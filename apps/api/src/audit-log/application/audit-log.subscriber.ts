import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { AgentActionExecutedEvent } from '../../cost/application/cost.events';
import { AuditLogService } from './audit-log.service';
import {
  AuditEventEnvelope,
  AuditEventType,
  AuditEventTypeName,
  LOT_EXPIRY_NEAR_CHANNEL_NAME,
  LOT_EXPIRY_NEAR_EVENT_TYPE_NAME,
} from './types';

/**
 * Single subscriber: persists one audit_log row per emitted event.
 *
 * Two payload shape conventions:
 * 1. **Legacy events** (already on the bus before this slice): published as
 *    ad-hoc shapes by cost / ingredients / recipes / supplier-items /
 *    agent-middleware. Translated to envelope per type by this subscriber.
 * 2. **New events introduced by this slice** (AI suggestions accept/reject,
 *    recipe cost rebuilt): emitter publishes the canonical
 *    `AuditEventEnvelope` shape directly; subscriber persists as-is.
 *
 * Each handler is wrapped in try/catch — a transient DB failure logs + drops
 * the row but does NOT propagate to the emitter (per ADR-AUDIT-WRITER).
 */
@Injectable()
export class AuditLogSubscriber {
  private readonly logger = new Logger(AuditLogSubscriber.name);

  constructor(private readonly auditLog: AuditLogService) {}

  // ------------- New events (envelope shape) -------------

  @OnEvent(AuditEventType.AI_SUGGESTION_ACCEPTED)
  onAiSuggestionAccepted(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.AI_SUGGESTION_ACCEPTED, payload);
  }

  @OnEvent(AuditEventType.AI_SUGGESTION_REJECTED)
  onAiSuggestionRejected(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.AI_SUGGESTION_REJECTED, payload);
  }

  @OnEvent(AuditEventType.RECIPE_COST_REBUILT)
  onRecipeCostRebuilt(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.RECIPE_COST_REBUILT, payload);
  }

  // ------------- Cost-domain channels (post-Wave-1.18 envelope shape) -------------
  //
  // Per ADR (m2-audit-log-emitter-migration Wave 1.18), the 5 cost.* channels
  // now publish AuditEventEnvelope directly from their source services. The
  // subscriber persists each as-is; per-type translation has been removed.
  // Channel-name documentation is preserved by keeping one @OnEvent per
  // channel rather than collapsing into a generic handler.

  @OnEvent(AuditEventType.INGREDIENT_OVERRIDE_CHANGED)
  onIngredientOverrideChanged(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.INGREDIENT_OVERRIDE_CHANGED, payload);
  }

  @OnEvent(AuditEventType.RECIPE_ALLERGENS_OVERRIDE_CHANGED)
  onRecipeAllergensOverrideChanged(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.RECIPE_ALLERGENS_OVERRIDE_CHANGED, payload);
  }

  @OnEvent(AuditEventType.RECIPE_SOURCE_OVERRIDE_CHANGED)
  onRecipeSourceOverrideChanged(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.RECIPE_SOURCE_OVERRIDE_CHANGED, payload);
  }

  @OnEvent(AuditEventType.RECIPE_INGREDIENT_UPDATED)
  onRecipeIngredientUpdated(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.RECIPE_INGREDIENT_UPDATED, payload);
  }

  @OnEvent(AuditEventType.SUPPLIER_PRICE_UPDATED)
  onSupplierPriceUpdated(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.SUPPLIER_PRICE_UPDATED, payload);
  }

  @OnEvent(AuditEventType.AGENT_ACTION_EXECUTED)
  onAgentActionExecuted(event: AgentActionExecutedEvent): Promise<void> {
    // Lean, request-anchored row from `AgentAuditMiddleware`. Per ADR-026
    // (Wave 1.14 m2-audit-log-forensic-split) this channel carries ONLY the
    // lean shape; rich aggregate-anchored emissions go to
    // AGENT_ACTION_FORENSIC. `aggregate_type='organization'` because the lean
    // payload has no aggregate.
    if (!event.organizationId) {
      this.logger.debug(
        `audit-log.subscriber.skipped: AGENT_ACTION_EXECUTED — no organizationId (pre-auth probe)`,
      );
      return Promise.resolve();
    }
    return this.persistTranslated(AuditEventType.AGENT_ACTION_EXECUTED, () => ({
      organizationId: event.organizationId as string,
      aggregateType: 'organization',
      aggregateId: event.organizationId as string,
      actorUserId: event.executedBy,
      actorKind: 'agent',
      agentName: event.agentName,
      payloadAfter: {
        capabilityName: event.capabilityName,
        timestamp: event.timestamp,
      },
    }));
  }

  @OnEvent(AuditEventType.AGENT_ACTION_FORENSIC)
  onAgentActionForensic(payload: AuditEventEnvelope): Promise<void> {
    // Rich, aggregate-anchored row from `BeforeAfterAuditInterceptor` (write
    // RPCs) and `AgentChatService` (chat turns; per ADR-027 streaming-handler
    // pattern). Persisted as-is — no per-type translation. See ADR-026 for
    // the channel split rationale.
    return this.persistEnvelope(AuditEventType.AGENT_ACTION_FORENSIC, payload);
  }

  // ------------- M3 channels (slice #21 m3-audit-log-hash-chain-hardening) -------------
  //
  // Per ADR-SUBSCRIBER-FAN-OUT (design.md), all M3 deferred event types are
  // wired onto this single subscriber class. Each handler is 3-5 LOC of
  // envelope mapping; the audit-log BC is the sole owner of audit_log
  // writes per ADR-CROSS-BC-SUBSCRIBER-LOCATION.

  /** Slice #1 m3-lot-aggregate — emit-side deferred to ops follow-up. */
  @OnEvent(AuditEventType.LOT_CREATED)
  onLotCreated(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.LOT_CREATED, payload);
  }

  /** Slice #1 m3-lot-aggregate — emit-side deferred to ops follow-up. */
  @OnEvent(AuditEventType.STOCK_MOVE_CREATED)
  onStockMoveCreated(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.STOCK_MOVE_CREATED, payload);
  }

  /**
   * Slice #2 m3-lot-consumption-events — `ConsumptionService.recordConsumption()`
   * emits a `LotConsumedEvent` with the slice-local inline shape:
   * `{ aggregateType: 'lot', organizationId, aggregateId, actorUserId,
   *    actorKind, eventType, payloadBefore: null, payloadAfter, createdAt }`.
   * The shape already matches `AuditEventEnvelope`; we persist as-is via
   * `persistEnvelope` (the extra `eventType` + `createdAt` fields are
   * tolerated — they're not part of the envelope contract but cause no
   * harm at persistence).
   */
  @OnEvent(AuditEventType.LOT_CONSUMED)
  onLotConsumed(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.LOT_CONSUMED, payload);
  }

  /**
   * Slice #3 m3-lot-expiry-alerts — `ExpiryScannerService.scan()` emits
   * on the shared `audit.event` channel. The payload carries
   * `payloadAfter.alert_band` to disambiguate from any other future
   * `audit.event` producer. This handler routes by the producing slice's
   * inline shape (envelope-compatible) and pins the persisted event_type
   * to `LOT_EXPIRY_NEAR`.
   */
  @OnEvent(LOT_EXPIRY_NEAR_CHANNEL_NAME)
  onLotExpiryNear(payload: AuditEventEnvelope): Promise<void> {
    // Direct persistence path that bypasses the channel→eventTypeName
    // lookup because LOT_EXPIRY_NEAR ships on the shared `audit.event`
    // channel (slice #3 ADR-EXPIRY-EVENT-CHANNEL). The persisted
    // event_type is pinned to `LOT_EXPIRY_NEAR`.
    return this.persistDirect(LOT_EXPIRY_NEAR_EVENT_TYPE_NAME, payload);
  }

  /** Slice #5 m3-cost-snapshot-persistence — already envelope-shaped. */
  @OnEvent(AuditEventType.COST_SNAPSHOT_RECORDED)
  onCostSnapshotRecorded(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.COST_SNAPSHOT_RECORDED, payload);
  }

  // ---- Slice #6 m3-po-aggregate (emit-side TBD by ops follow-up) ----

  @OnEvent(AuditEventType.PO_CREATED)
  onPoCreated(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PO_CREATED, payload);
  }

  @OnEvent(AuditEventType.PO_SENT)
  onPoSent(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PO_SENT, payload);
  }

  @OnEvent(AuditEventType.PO_RECEIVED_PARTIAL)
  onPoReceivedPartial(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PO_RECEIVED_PARTIAL, payload);
  }

  @OnEvent(AuditEventType.PO_RECEIVED_FULL)
  onPoReceivedFull(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PO_RECEIVED_FULL, payload);
  }

  @OnEvent(AuditEventType.PO_CANCELLED)
  onPoCancelled(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PO_CANCELLED, payload);
  }

  @OnEvent(AuditEventType.PO_CLOSED)
  onPoClosed(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PO_CLOSED, payload);
  }

  // ---- Slice #7 m3-gr-aggregate-reconciliation ----

  /**
   * Slice #7 emits `GrConfirmedEventPayload` (slice-local shape with
   * `grId`, `organizationId`, `poId`, `supplierId`, `receivedAt`,
   * `lines[]`). We translate to the canonical envelope: `aggregate_type
   * = 'goods_receipt'`, `aggregate_id = grId`, `payload_after` = the
   * full producing payload.
   */
  @OnEvent(AuditEventType.GR_CONFIRMED)
  onGrConfirmed(payload: unknown): Promise<void> {
    return this.persistTranslated(AuditEventType.GR_CONFIRMED, () =>
      this.translateGrPayload(payload, 'goods_receipt'),
    );
  }

  @OnEvent(AuditEventType.GR_LINE_QTY_VARIANCE)
  onGrLineQtyVariance(payload: unknown): Promise<void> {
    return this.persistTranslated(AuditEventType.GR_LINE_QTY_VARIANCE, () =>
      this.translateGrPayload(payload, 'goods_receipt_line'),
    );
  }

  @OnEvent(AuditEventType.GR_LINE_PRICE_VARIANCE)
  onGrLinePriceVariance(payload: unknown): Promise<void> {
    return this.persistTranslated(AuditEventType.GR_LINE_PRICE_VARIANCE, () =>
      this.translateGrPayload(payload, 'goods_receipt_line'),
    );
  }

  // ---- Slice #22 m3-email-dispatch-di — already envelope-shaped ----

  @OnEvent(AuditEventType.EMAIL_DISPATCHED)
  onEmailDispatched(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.EMAIL_DISPATCHED, payload);
  }

  @OnEvent(AuditEventType.EMAIL_FAILED)
  onEmailFailed(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.EMAIL_FAILED, payload);
  }

  // ------------- Internals -------------

  /**
   * Persist directly by canonical `eventTypeName`, bypassing the
   * channel→name lookup. Used by handlers whose bus channel name does
   * NOT map 1:1 to a persisted name (slice #3 `LOT_EXPIRY_NEAR` on the
   * shared `audit.event` channel).
   */
  private async persistDirect(
    eventTypeName: string,
    envelope: unknown,
  ): Promise<void> {
    const validated = this.validateEnvelope(envelope);
    if (validated === null) {
      this.logger.warn(
        `audit-log.subscriber.skipped: ${eventTypeName} — payload missing envelope shape`,
      );
      return;
    }
    try {
      await this.auditLog.record(eventTypeName, validated);
    } catch (err) {
      this.logError(eventTypeName, validated.aggregateId, err);
    }
  }

  private async persistEnvelope(
    channel: AuditEventType,
    envelope: unknown,
  ): Promise<void> {
    const validated = this.validateEnvelope(envelope);
    if (validated === null) {
      this.logger.warn(
        `audit-log.subscriber.skipped: ${channel} — payload missing envelope shape`,
      );
      return;
    }
    try {
      await this.auditLog.record(AuditEventTypeName[channel], validated);
    } catch (err) {
      this.logError(channel, validated.aggregateId, err);
    }
  }

  /**
   * `persistTranslated` runs a slice-local translator function that maps
   * a producer-specific shape into the canonical envelope. The optional
   * `eventTypeNameOverride` lets handlers like `onLotExpiryNear` pin a
   * canonical persisted name that differs from `AuditEventTypeName[channel]`
   * (the channel is the generic bus name; the persisted event_type names
   * the actual event).
   */
  private async persistTranslated(
    channel: AuditEventType,
    translate: () => AuditEventEnvelope,
    eventTypeNameOverride?: string,
  ): Promise<void> {
    let envelope: AuditEventEnvelope;
    try {
      envelope = translate();
    } catch (err) {
      this.logError(channel, '<unknown>', err);
      return;
    }
    const eventTypeName = eventTypeNameOverride ?? AuditEventTypeName[channel];
    try {
      await this.auditLog.record(eventTypeName, envelope);
    } catch (err) {
      this.logError(channel, envelope.aggregateId, err);
    }
  }

  /**
   * Map slice #7's GR event payload (slice-local shape with `grId`,
   * `organizationId`, `lines[]`, …) into the canonical `AuditEventEnvelope`.
   * Per ADR-EVENT-ENVELOPE-SHAPE (design.md), the audit-log BC translates
   * at the subscriber boundary so the producer can keep emitting its
   * domain-natural shape.
   */
  private translateGrPayload(
    payload: unknown,
    aggregateType: 'goods_receipt' | 'goods_receipt_line',
  ): AuditEventEnvelope {
    if (!payload || typeof payload !== 'object') {
      throw new Error('GR event payload is not an object');
    }
    const p = payload as Record<string, unknown>;
    const organizationId = typeof p.organizationId === 'string' ? p.organizationId : '';
    const aggregateId =
      aggregateType === 'goods_receipt'
        ? typeof p.grId === 'string'
          ? p.grId
          : ''
        : typeof p.grLineId === 'string'
          ? p.grLineId
          : typeof p.grId === 'string'
            ? p.grId
            : '';
    if (!organizationId || !aggregateId) {
      throw new Error(
        `GR event payload missing required fields: organizationId=${organizationId} aggregateId=${aggregateId}`,
      );
    }
    return {
      organizationId,
      aggregateType,
      aggregateId,
      actorUserId: null,
      actorKind: 'system',
      payloadBefore: null,
      payloadAfter: p,
    };
  }

  private logError(channel: string, aggregateId: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(
      `audit-log.subscriber.error: ${channel} aggregate=${aggregateId} ${message}`,
    );
  }

  private validateEnvelope(payload: unknown): AuditEventEnvelope | null {
    if (!payload || typeof payload !== 'object') return null;
    const candidate = payload as Partial<AuditEventEnvelope>;
    if (
      typeof candidate.organizationId !== 'string' ||
      typeof candidate.aggregateType !== 'string' ||
      typeof candidate.aggregateId !== 'string' ||
      (candidate.actorUserId !== null && typeof candidate.actorUserId !== 'string') ||
      (candidate.actorKind !== 'user' &&
        candidate.actorKind !== 'agent' &&
        candidate.actorKind !== 'system')
    ) {
      return null;
    }
    return candidate as AuditEventEnvelope;
  }
}
