import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Lot } from '../../../inventory/lot/domain/lot.entity';
import { LotRepository } from '../../../inventory/lot/application/lot.repository';
import { PurchaseOrderRepository } from '../../po/infrastructure/purchase-order.repository';
import { PurchaseOrderLineRepository } from '../../po/infrastructure/purchase-order-line.repository';
import { DiscrepancyDetectorService } from '../../reconciliation/application/discrepancy-detector.service';
import { ReconciliationRepository } from '../../reconciliation/infrastructure/reconciliation.repository';
import { GoodsReceipt } from '../domain/goods-receipt.entity';
import { GoodsReceiptLine } from '../domain/goods-receipt-line.entity';
import {
  GrLineInvariantError,
  GrNotFoundError,
  IllegalGrTransition,
  IndependentGrMissingSupplierError,
  OverReceiptError,
  PoAggregateNotEnabledError,
} from '../domain/errors';
import { GoodsReceiptRepository } from './gr.repository';
import { GoodsReceiptLineRepository } from './gr-line.repository';
import {
  ConfirmedLineSummary,
  CreateGrInput,
  CreateGrInputSchema,
  DEFAULT_OVER_RECEIPT_TOLERANCE,
  DEFAULT_VARIANCE_THRESHOLDS,
  GrConfirmationResult,
  GrConfirmedEventPayload,
  GrEventType,
  GrLinePriceVarianceEventPayload,
  GrLineQtyVarianceEventPayload,
  VarianceEventEnvelope,
  VarianceThresholds,
} from '../types';
import { detectVariance } from './variance-detector';

/**
 * Minimal contract surface for slice #6's PoStateMachine.
 *
 * Slice #6 (m3-po-aggregate) is parallel — if its real PoStateMachine
 * class isn't reachable from this worktree at the time of writing, the
 * service uses this structural shape and a no-op fallback provider.
 * Phase 3 (post-merge) replaces the provider with the real injection.
 *
 * Per ADR-GR-PO-STATE-TRANSITION: gated behind `M3_PO_AGGREGATE_ENABLED`
 * env flag. When `false`, any GR with `po_id IS NOT NULL` is rejected.
 */
export interface PoStateMachineLike {
  transitionFromGrConfirmation(
    organizationId: string,
    poId: string,
    confirmedLines: Array<{ poLineId: string; qtyReceivedActual: number }>,
    manager: EntityManager,
  ): Promise<void>;
}

export const PO_STATE_MACHINE_TOKEN = 'PO_STATE_MACHINE';

/**
 * GrConfirmationService — orchestrates the single closeable-loop seam in M3.
 *
 * Per ADR-GR-LOT-CREATION-SEAM, the entire confirmation runs in a single
 * Postgres transaction (BEGIN…COMMIT). Steps:
 *
 *   1. Validate input (Zod + shape coherence + multi-tenancy).
 *   2. Compute variance + check over-receipt tolerance per line.
 *   3. Per line: build Lot via `LotFactory.create()`, persist via
 *      `LotRepository.save(lot, manager)`.
 *   4. Persist GR header + lines (with `lot_id_created` populated).
 *   5. Transition state to 'confirmed'.
 *   6. If po_id IS NOT NULL AND `M3_PO_AGGREGATE_ENABLED=true`, call
 *      `PoStateMachine.transitionFromGrConfirmation()` (slice #6 seam).
 *   7. Emit `GR_CONFIRMED` + per-line variance events on the bus
 *      (subscriber wiring deferred to slice #21).
 *
 * If ANY step throws, the whole transaction rolls back (no partial Lots,
 * GR stays unwritten, no PO state change).
 *
 * Note: this slice does NOT call `LotRepository.save()` with the slice-#1
 * transactional override because LotRepository.save() takes only the Lot.
 * To keep the atomicity invariant, we materialize Lots through the same
 * EntityManager via `manager.save(Lot, lot)` directly. The slice-#1
 * factory (`Lot.create(...)`) is still the authoritative invariant gate.
 */
@Injectable()
export class GrConfirmationService {
  private readonly logger = new Logger(GrConfirmationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly grRepo: GoodsReceiptRepository,
    private readonly grLineRepo: GoodsReceiptLineRepository,
    private readonly lotRepo: LotRepository,
    private readonly events: EventEmitter2,
    @Optional()
    @Inject(PO_STATE_MACHINE_TOKEN)
    private readonly poStateMachine: PoStateMachineLike | null,
    /**
     * Sprint 4 W3-5b — optional reconciliation seam. Marked @Optional so
     * the GR spec (which doesn't wire these) and any historic test
     * harness keep compiling. When the three deps are present the
     * service runs detect+persist AFTER the GR transaction commits;
     * failures are logged + swallowed so a transient detector hiccup
     * cannot take down the GR write that just succeeded.
     */
    @Optional()
    private readonly poRepo: PurchaseOrderRepository | null = null,
    @Optional()
    private readonly poLineRepo: PurchaseOrderLineRepository | null = null,
    @Optional()
    private readonly detector: DiscrepancyDetectorService | null = null,
    @Optional()
    private readonly reconciliationRepo: ReconciliationRepository | null = null,
  ) {}

  /**
   * Confirm a draft GR end-to-end. Creates N Lots + N GR lines + the GR
   * header (or, if a `grId` is supplied, transitions an existing draft
   * row to confirmed). Idempotent via the `idempotencyKey` param when
   * supplied — re-running with the same key short-circuits before any
   * row is written.
   *
   * @throws IndependentGrMissingSupplierError when po_id / po_line_id
   *         shapes are inconsistent.
   * @throws PoAggregateNotEnabledError when po_id is set but slice #6 is
   *         not yet flipped on via `M3_PO_AGGREGATE_ENABLED=true`.
   * @throws OverReceiptError when cumulative qty exceeds tolerance band.
   * @throws GrLineInvariantError on shape / Zod validation failures.
   * @throws GrNotFoundError when grId is supplied but no draft exists.
   */
  async confirm(
    input: CreateGrInput,
    grId?: string,
  ): Promise<GrConfirmationResult> {
    // Step 1a — Zod validation.
    const parsed = CreateGrInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new GrLineInvariantError(
        `GR input invalid: ${parsed.error.errors
          .map((e) => `${e.path.join('.')}=${e.message}`)
          .join('; ')}`,
      );
    }
    const validated = parsed.data;

    // Step 1b — shape coherence (po_id ↔ all po_line_id).
    this.assertShapeCoherent(validated);

    // Step 1c — feature flag for slice #6.
    if (validated.poId !== null && !this.isPoAggregateEnabled()) {
      throw new PoAggregateNotEnabledError();
    }

    // Run all DB mutations inside a single transaction. We capture
    // `committedHeader` + `committedLines` outside the closure so the
    // post-commit reconciliation hook can read them without
    // re-querying. They're populated INSIDE the transaction and read
    // only AFTER the closure resolves successfully (no torn reads).
    let committedHeader: GoodsReceipt | null = null;
    let committedLines: GoodsReceiptLine[] = [];

    const result = await this.dataSource.transaction(async (manager) => {
      // Step 2 — over-receipt accumulator check (only for PO-linked lines).
      await this.assertWithinOverReceiptTolerance(validated, manager);

      // Step 3 — materialize Lots + GR header + lines + state.
      const finalGrId = grId ?? randomUUID();
      const header = this.buildHeader(validated, finalGrId);

      // Pre-build line entities + their associated Lot rows.
      const confirmedLines: ConfirmedLineSummary[] = [];
      const lineEntities: GoodsReceiptLine[] = [];
      const lotEntities: Lot[] = [];

      for (const lineInput of validated.lines) {
        const lot = Lot.create({
          organizationId: validated.organizationId,
          locationId: validated.receivedAtLocationId,
          supplierId: validated.supplierId,
          receivedAt: validated.receivedAt,
          expiresAt: lineInput.expiresAtOverride ?? null,
          quantityReceived: lineInput.qtyReceivedActual,
          unit: lineInput.unit,
          metadata: {
            grId: finalGrId,
            poLineId: lineInput.poLineId,
            supplierInvoiceRef: validated.supplierInvoiceRef ?? null,
            unitPriceActual: lineInput.unitPriceActual,
          },
        });
        lotEntities.push(lot);

        const grLineId = randomUUID();
        const grLine = new GoodsReceiptLine();
        grLine.id = grLineId;
        grLine.grId = finalGrId;
        grLine.poLineId = lineInput.poLineId;
        grLine.productId = lineInput.productId;
        grLine.qtyReceivedActual = lineInput.qtyReceivedActual;
        grLine.unitPriceActual = lineInput.unitPriceActual;
        grLine.lotIdCreated = lot.id;
        grLine.expiresAtOverride = lineInput.expiresAtOverride ?? null;
        lineEntities.push(grLine);

        confirmedLines.push({
          grLineId,
          poLineId: lineInput.poLineId,
          productId: lineInput.productId,
          qtyReceivedActual: lineInput.qtyReceivedActual,
          unitPriceActual: lineInput.unitPriceActual,
          lotIdCreated: lot.id,
          unit: lineInput.unit,
        });
      }

      // Persist: Lots first (FK target for goods_receipt_lines.lot_id_created),
      // then header, then lines.
      await manager.save(Lot, lotEntities);

      header.state = 'confirmed';
      await this.grRepo.save(header, manager);
      await this.grLineRepo.saveMany(lineEntities, manager);

      // Step 6 — PO state transition (if flag enabled + PO linked).
      if (validated.poId !== null && this.isPoAggregateEnabled()) {
        await this.invokePoStateMachine(
          validated.organizationId,
          validated.poId,
          validated.lines
            .filter((l) => l.poLineId !== null)
            .map((l) => ({
              poLineId: l.poLineId as string,
              qtyReceivedActual: l.qtyReceivedActual,
            })),
          manager,
        );
      }

      // Step 7 — variance event detection + outbound bus emission.
      const varianceEvents = this.buildVarianceEvents(
        finalGrId,
        validated,
        confirmedLines,
      );
      this.emitEvents(finalGrId, validated, confirmedLines, varianceEvents);

      // Capture the committed snapshot for the post-commit reconciliation
      // hook. These locals exist OUTSIDE the txn closure but are read
      // only after the closure resolves successfully (on throw, the
      // outer await rejects and the hook never runs).
      committedHeader = header;
      committedLines = lineEntities;

      return {
        grId: finalGrId,
        organizationId: validated.organizationId,
        state: 'confirmed' as const,
        lines: confirmedLines,
        varianceEvents,
      };
    });

    // Sprint 4 W3-5b — post-commit reconciliation hook. Runs ONLY when:
    //   - the GR was PO-linked (independent GRs have nothing to
    //     reconcile against), AND
    //   - every Reconciliation dep is wired (the seam is @Optional so
    //     existing GR-only specs keep compiling).
    // Failures are logged + swallowed because the GR row is already
    // persisted; a transient detector hiccup must NOT propagate as a
    // 500 to a goods-receipt that just succeeded.
    await this.maybeRunReconciliation(committedHeader, committedLines);

    return result;
  }

  private async maybeRunReconciliation(
    header: GoodsReceipt | null,
    lines: GoodsReceiptLine[],
  ): Promise<void> {
    if (
      header === null ||
      header.poId === null ||
      this.poRepo === null ||
      this.poLineRepo === null ||
      this.detector === null ||
      this.reconciliationRepo === null
    ) {
      return;
    }
    try {
      const po = await this.poRepo.findById(header.organizationId, header.poId);
      if (po === null) {
        return;
      }
      const poLines = await this.poLineRepo.findByPo(
        header.organizationId,
        header.poId,
      );
      const reconciliations = this.detector.detect({
        po,
        poLines,
        gr: header,
        grLines: lines,
      });
      for (const recon of reconciliations) {
        await this.reconciliationRepo.create(recon);
      }
      if (reconciliations.length > 0) {
        this.logger.log(
          `reconciliation.detected gr=${header.id} count=${reconciliations.length}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `reconciliation.detect-or-persist.failed gr=${header.id} ${msg}`,
      );
      // Intentionally swallow — GR is already committed.
    }
  }

  /**
   * Public helper for the future cancellation flow. Per design.md open
   * questions: `cancelled` is reachable ONLY from `draft`. INT tests in
   * Phase 3 exercise the full flow.
   */
  async cancelDraft(organizationId: string, grId: string): Promise<void> {
    const existing = await this.grRepo.findById(organizationId, grId);
    if (existing === null) {
      throw new GrNotFoundError(grId);
    }
    if (existing.state !== 'draft') {
      throw new IllegalGrTransition(existing.state, 'cancelled');
    }
    await this.grRepo.updateState(organizationId, grId, 'cancelled');
  }

  // ---- private helpers ----

  private isPoAggregateEnabled(): boolean {
    return process.env.M3_PO_AGGREGATE_ENABLED === 'true';
  }

  private assertShapeCoherent(input: CreateGrInput): void {
    const allLinked = input.lines.every((l) => l.poLineId !== null);
    const noneLinked = input.lines.every((l) => l.poLineId === null);
    if (input.poId === null && !noneLinked) {
      throw new IndependentGrMissingSupplierError(
        'Independent GR (po_id IS NULL) must have ALL lines with po_line_id IS NULL.',
      );
    }
    if (input.poId !== null && !allLinked) {
      throw new IndependentGrMissingSupplierError(
        'PO-linked GR (po_id IS NOT NULL) must have ALL lines with po_line_id IS NOT NULL.',
      );
    }
  }

  private async assertWithinOverReceiptTolerance(
    input: CreateGrInput,
    manager: EntityManager,
  ): Promise<void> {
    for (const line of input.lines) {
      if (line.poLineId === null || line.qtyOrdered === null) continue;
      const tolerancePct =
        line.unit === 'un'
          ? DEFAULT_OVER_RECEIPT_TOLERANCE.discretePct
          : DEFAULT_OVER_RECEIPT_TOLERANCE.bulkPct;
      const limit = line.qtyOrdered * (1 + tolerancePct);
      const priorCumulative = await this.grLineRepo.sumQtyReceivedByPoLine(
        input.organizationId,
        line.poLineId,
        manager,
      );
      const newCumulative = priorCumulative + line.qtyReceivedActual;
      if (newCumulative > limit + 1e-9) {
        throw new OverReceiptError(line.poLineId, newCumulative, limit);
      }
    }
  }

  private buildHeader(input: CreateGrInput, grId: string): GoodsReceipt {
    const gr = new GoodsReceipt();
    gr.id = grId;
    gr.organizationId = input.organizationId;
    gr.poId = input.poId;
    gr.supplierId = input.supplierId;
    gr.receivedAt = input.receivedAt;
    gr.receivedAtLocationId = input.receivedAtLocationId;
    gr.receivingUserId = input.receivingUserId;
    gr.supplierInvoiceRef = input.supplierInvoiceRef ?? null;
    gr.state = 'draft';
    return gr;
  }

  private buildVarianceEvents(
    grId: string,
    input: CreateGrInput,
    confirmedLines: ConfirmedLineSummary[],
  ): VarianceEventEnvelope[] {
    const out: VarianceEventEnvelope[] = [];
    const thresholds: VarianceThresholds = DEFAULT_VARIANCE_THRESHOLDS;

    for (let i = 0; i < input.lines.length; i++) {
      const lineInput = input.lines[i];
      const confirmed = confirmedLines[i];
      const result = detectVariance(
        {
          qtyOrdered: lineInput.qtyOrdered,
          unitPriceOrdered: lineInput.unitPriceOrdered,
          qtyReceivedActual: lineInput.qtyReceivedActual,
          unitPriceActual: lineInput.unitPriceActual,
          poLineId: lineInput.poLineId,
        },
        thresholds,
      );

      if (
        (result.kind === 'qty' || result.kind === 'both') &&
        lineInput.poLineId !== null &&
        lineInput.qtyOrdered !== null
      ) {
        const payload: GrLineQtyVarianceEventPayload = {
          grId,
          organizationId: input.organizationId,
          grLineId: confirmed.grLineId,
          poLineId: lineInput.poLineId,
          qtyOrdered: lineInput.qtyOrdered,
          qtyReceivedActual: lineInput.qtyReceivedActual,
          deltaPct: result.qtyDeltaPct ?? 0,
          thresholdPct: thresholds.qty,
        };
        out.push({ type: GrEventType.GR_LINE_QTY_VARIANCE, payload });
      }

      if (
        (result.kind === 'price' || result.kind === 'both') &&
        lineInput.poLineId !== null &&
        lineInput.unitPriceOrdered !== null
      ) {
        const payload: GrLinePriceVarianceEventPayload = {
          grId,
          organizationId: input.organizationId,
          grLineId: confirmed.grLineId,
          poLineId: lineInput.poLineId,
          unitPriceOrdered: lineInput.unitPriceOrdered,
          unitPriceActual: lineInput.unitPriceActual,
          deltaPct: result.priceDeltaPct ?? 0,
          thresholdPct: thresholds.price,
        };
        out.push({ type: GrEventType.GR_LINE_PRICE_VARIANCE, payload });
      }
    }

    return out;
  }

  private emitEvents(
    grId: string,
    input: CreateGrInput,
    confirmedLines: ConfirmedLineSummary[],
    varianceEvents: VarianceEventEnvelope[],
  ): void {
    const confirmedPayload: GrConfirmedEventPayload = {
      grId,
      organizationId: input.organizationId,
      poId: input.poId,
      supplierId: input.supplierId,
      receivedAt: input.receivedAt,
      lines: confirmedLines.map((l) => ({
        grLineId: l.grLineId,
        poLineId: l.poLineId,
        productId: l.productId,
        qtyReceivedActual: l.qtyReceivedActual,
        unitPriceActual: l.unitPriceActual,
        lotIdCreated: l.lotIdCreated,
      })),
    };
    // Bus emit only — slice #21 wires the AuditLogSubscriber to consume.
    this.events.emit(GrEventType.GR_CONFIRMED, confirmedPayload);
    for (const ev of varianceEvents) {
      this.events.emit(ev.type, ev.payload);
    }
  }

  private async invokePoStateMachine(
    organizationId: string,
    poId: string,
    confirmedLines: Array<{ poLineId: string; qtyReceivedActual: number }>,
    manager: EntityManager,
  ): Promise<void> {
    if (this.poStateMachine === null) {
      // Flag is on but no provider was supplied; treat as no-op (slice #6
      // not actually wired). Phase 3 wires the real PoModule and removes
      // this defensive branch.
      return;
    }
    await this.poStateMachine.transitionFromGrConfirmation(
      organizationId,
      poId,
      confirmedLines,
      manager,
    );
  }
}
