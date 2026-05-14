import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LotRepository } from '../../lot/application/lot.repository';
import { StockMoveRepository } from '../../lot/application/stock-move.repository';
import { StockMove } from '../../lot/domain/stock-move.entity';
import type { RecordConsumptionInput } from '../domain/consumption-input';
import {
  InvalidConsumptionInputError,
  LotInsufficientQuantityError,
} from '../domain/errors';
import {
  LOT_CONSUMED_EVENT,
  LotConsumedEvent,
  LotConsumedPayload,
  LotConsumedPayloadSchema,
} from '../domain/events';

/**
 * Canonical emission seam for `LotConsumedEvent`. Every consumption
 * code path in M3 funnels through `recordConsumption()` — the recipe
 * execution bridge (procurement-block follow-up), the agent
 * MCP write capability (slice #13 follow-up), and the operator's
 * "manual depletion" UI (M3.x) all call this method.
 *
 * Per ADR-CONSUMPTION-EMITTER-LOCATION: emission lives in this
 * application service, NOT in `StockMoveRepository.append()`. The
 * repository is generic — it also handles inbound / waste / adjustment
 * moves — and not every outbound move is a consumption. The service
 * is where the domain semantics live.
 *
 * Per ADR-CONSUMPTION-NO-EMIT-HERE: this slice emits the event on the
 * bus but does NOT register `LOT_CONSUMED` in
 * `AuditLogSubscriber.persistEnvelope()`. Calls produce a real
 * `stock_moves` row + a real bus event, but NO `audit_log` row. Slice
 * #21 (`m3-audit-log-hash-chain-hardening`) wires the subscriber.
 *
 * Idempotency: per REQ-CE-5 the caller passes an `idempotencyKey`
 * (uuid v4) in `RecordConsumptionInput`. Same key replayed within
 * the same org returns the original envelope without writing a
 * second `stock_moves` row. In this slice the dedup cache is an
 * in-memory map keyed by `(organizationId, idempotencyKey)`. A
 * follow-up (slice #21 or the procurement bridge) replaces this with
 * a Postgres-backed `agent_idempotency_key` row reuse — same shape,
 * different store.
 */
@Injectable()
export class ConsumptionService {
  private readonly logger = new Logger(ConsumptionService.name);

  /**
   * In-memory idempotency cache. Keyed by `${organizationId}::${key}`,
   * value is the original `LotConsumedEvent` envelope returned by the
   * first successful call. Acceptable at MVP scale (<10k events/day);
   * follow-up swaps to the existing `agent_idempotency_key` table from
   * `m2-mcp-write-capabilities` once we wire this BC through the MCP
   * surface (slice #11+).
   */
  private readonly idempotencyCache = new Map<string, LotConsumedEvent>();

  constructor(
    private readonly lotRepo: LotRepository,
    private readonly stockMoveRepo: StockMoveRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Record a consumption against a lot. See class doc for the full
   * contract; see spec.md REQ-CE-1 .. REQ-CE-9 for scenarios.
   *
   * @returns the typed `LotConsumedEvent` envelope (same shape that lands
   *          on the bus). Idempotent retries return the original event.
   *
   * @throws  InvalidConsumptionInputError  — qty <= 0, both drivers,
   *                                          manual depletion without
   *                                          reason, lot not in org.
   * @throws  LotInsufficientQuantityError — qty > lot.quantity_remaining.
   * @throws  DuplicateIdempotencyKeyError — not thrown today (idempotent
   *                                          replay returns original);
   *                                          declared for future
   *                                          strict-mode opt-in.
   * @throws  ZodError                      — bus emission boundary
   *                                          validation failed (should
   *                                          never happen if service-level
   *                                          guards passed; defence in depth).
   */
  async recordConsumption(
    organizationId: string,
    actorUserId: string,
    input: RecordConsumptionInput,
  ): Promise<LotConsumedEvent> {
    // --- 1. Idempotency check (BEFORE any side effects) -----------------
    const dedupKey = this.dedupKey(organizationId, input.idempotencyKey);
    const cached = this.idempotencyCache.get(dedupKey);
    if (cached !== undefined) {
      this.logger.debug(
        `Idempotency hit for org=${organizationId} key=${input.idempotencyKey}; ` +
          `returning original event lot=${cached.aggregateId}.`,
      );
      return cached;
    }

    // --- 2. Input validation --------------------------------------------
    this.validateBasicInput(input);
    this.validateDriverInvariant(input);

    // --- 3. Multi-tenant gated lot load ---------------------------------
    const lot = await this.lotRepo.findById(organizationId, input.lotId);
    if (lot === null) {
      // Cross-tenant access surfaces as not-found per slice #1 convention.
      throw new InvalidConsumptionInputError(
        `Lot not found: ${input.lotId} (organization ${organizationId}).`,
      );
    }

    // --- 4. Quantity availability check ---------------------------------
    if (input.qtyConsumed > lot.quantityRemaining) {
      throw new LotInsufficientQuantityError(
        lot.id,
        input.qtyConsumed,
        lot.quantityRemaining,
      );
    }

    // --- 5. Append the stock_moves outbound row (signed-negative) -------
    const move = StockMove.create({
      organizationId,
      locationId: lot.locationId,
      lotId: lot.id,
      moveType: 'outbound',
      // StockMove.validateQuantitySign requires strict-negative for outbound.
      quantity: -input.qtyConsumed,
      actorUserId,
      reason: input.reason ?? null,
    });
    const persistedMove = await this.stockMoveRepo.append(move);

    // --- 6. Build + Zod-validate the typed payload ----------------------
    const payload: LotConsumedPayload = {
      organization_id: organizationId,
      lot_id: lot.id,
      stock_move_id: persistedMove.id,
      qty_consumed: input.qtyConsumed, // positive in payload (normalised)
      unit: lot.unit,
      recipe_id: input.recipeId ?? null,
      menu_item_id: input.menuItemId ?? null,
      consumed_at: persistedMove.createdAt.toISOString(),
      consumed_by_user_id: actorUserId,
      opentrattos_tag: input.opentrattosTag ?? null,
      reason: input.reason ?? null,
    };
    // Defence-in-depth: parse before emit. Should always succeed if the
    // service-level guards above are correct; a Zod miss here is a bug.
    LotConsumedPayloadSchema.parse(payload);

    // --- 7. Construct the envelope --------------------------------------
    const envelope: LotConsumedEvent = {
      aggregateType: 'lot',
      organizationId,
      aggregateId: lot.id,
      actorUserId,
      actorKind: 'user',
      eventType: LOT_CONSUMED_EVENT,
      payloadBefore: null,
      payloadAfter: payload,
      createdAt: persistedMove.createdAt,
    };

    // --- 8. Cache the dedup result BEFORE emit (consistent on retry) ----
    this.idempotencyCache.set(dedupKey, envelope);

    // --- 9. Emit on the bus ---------------------------------------------
    // Synchronous in-process emit (M2 Wave 1.9 convention). The
    // EventEmitter2 module is wired @Global in app.module.ts.
    // Per ADR-CONSUMPTION-NO-EMIT-HERE: no `AuditLogSubscriber` listens
    // for `LOT_CONSUMED_EVENT` in this slice — registration is slice #21.
    this.eventEmitter.emit(LOT_CONSUMED_EVENT, envelope);

    return envelope;
  }

  // ---------- internal helpers ----------

  private dedupKey(organizationId: string, idempotencyKey: string): string {
    return `${organizationId}::${idempotencyKey}`;
  }

  private validateBasicInput(input: RecordConsumptionInput): void {
    if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length === 0) {
      throw new InvalidConsumptionInputError(
        'idempotencyKey is required and must be a non-empty string.',
      );
    }
    if (typeof input.lotId !== 'string' || input.lotId.length === 0) {
      throw new InvalidConsumptionInputError(
        'lotId is required and must be a non-empty string.',
      );
    }
    if (!Number.isFinite(input.qtyConsumed) || input.qtyConsumed <= 0) {
      throw new InvalidConsumptionInputError(
        `qtyConsumed must be a positive finite number; got ${input.qtyConsumed}.`,
      );
    }
  }

  /**
   * Enforces ADR-CONSUMPTION-RECIPE-MENU-NULLABLE:
   *  - At most one of `recipeId` / `menuItemId` is populated.
   *  - If BOTH null (manual depletion), `reason` is REQUIRED non-empty.
   */
  private validateDriverInvariant(input: RecordConsumptionInput): void {
    const hasRecipe =
      typeof input.recipeId === 'string' && input.recipeId.length > 0;
    const hasMenuItem =
      typeof input.menuItemId === 'string' && input.menuItemId.length > 0;

    if (hasRecipe && hasMenuItem) {
      throw new InvalidConsumptionInputError(
        'At most one of recipeId / menuItemId may be populated per consumption event.',
      );
    }

    if (!hasRecipe && !hasMenuItem) {
      const hasReason =
        typeof input.reason === 'string' && input.reason.trim().length > 0;
      if (!hasReason) {
        throw new InvalidConsumptionInputError(
          'Manual depletion (no recipeId, no menuItemId) requires a non-empty reason.',
        );
      }
    }
  }

  /**
   * Forward-trace query helper. Read-side surface consumed by slices
   * #11 / #12. Reads `stock_moves` outbound rows for the given lot,
   * newest-first. Uses the `idx_stock_moves_org_lot_outbound` partial
   * index landing in migration 0037 (slice's own migration deferred —
   * this slice ships the query but the partial index is created when
   * the migration lands in a follow-up; for now the query falls back
   * to slice #1's generic `idx_stock_moves_org_lot_created`).
   *
   * Per spec.md REQ-CE-4 scenarios: cross-tenant query returns empty
   * (no exception); pagination via `limit`/`offset` is supported;
   * ordering is `created_at DESC`.
   */
  async findConsumptionsByLot(
    organizationId: string,
    lotId: string,
    limit = 50,
    offset = 0,
  ): Promise<StockMove[]> {
    // First gate cross-tenant: if the lot isn't in this org, return [].
    // The lot object itself is unused beyond this gate (downstream
    // queries key off `lotId` directly), hence the `_`-prefix on the
    // local to satisfy `no-unused-vars`.
    const _lotGate = await this.lotRepo.findById(organizationId, lotId);
    if (_lotGate === null) {
      return [];
    }
    const rows = await this.stockMoveRepo.findByLot(
      organizationId,
      lotId,
      limit,
      offset,
    );
    // Filter to outbound only (consumption-side; the generic findByLot
    // also returns inbound / adjustment rows from slice #1's surface).
    return rows.filter((m) => m.moveType === 'outbound');
  }
}
