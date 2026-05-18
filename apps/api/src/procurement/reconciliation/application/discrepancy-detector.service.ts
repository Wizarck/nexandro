import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { GoodsReceipt } from '../../gr/domain/goods-receipt.entity';
import type { GoodsReceiptLine } from '../../gr/domain/goods-receipt-line.entity';
import type { PurchaseOrder } from '../../po/domain/purchase-order.entity';
import type { PurchaseOrderLine } from '../../po/domain/purchase-order-line.entity';
import {
  DEFAULT_VARIANCE_THRESHOLDS,
  VarianceThresholds,
} from '../../gr/types';
import { detectVariance } from '../../gr/application/variance-detector';
import {
  Reconciliation,
  ReconciliationDiff,
} from '../domain/reconciliation.entity';

/**
 * Input to `DiscrepancyDetectorService.detect()`. The caller (today the
 * application service / future GrConfirmationService hook) is
 * responsible for loading and passing both aggregates plus their lines
 * — the detector itself is pure (no repo dependency) so it stays
 * trivially testable.
 *
 * `poLines` MUST be empty when `po` is `null` (independent GR).
 */
export interface DetectInput {
  po: PurchaseOrder | null;
  poLines: PurchaseOrderLine[];
  gr: GoodsReceipt;
  grLines: GoodsReceiptLine[];
  thresholds?: VarianceThresholds;
}

/**
 * Pure discrepancy detection for the j11 Reconciliación tab.
 *
 * Walks the GR lines and emits one Reconciliation row per detected
 * issue. Detection ladder (spec docs/ux/j11.md §6):
 *
 *  - `producto` — GR line product_id ≠ PO line ingredient_id (operator
 *    scanned the wrong SKU at the dock). Emitted FIRST so the downstream
 *    list view shows the most-actionable category at the top.
 *  - `cantidad` — qty_received differs from qty_ordered above the
 *    variance threshold (reuses `variance-detector` from slice #7 so
 *    the j11 list does NOT contradict the bus events).
 *  - `precio`   — unit_price_actual differs from unit_price above the
 *    variance threshold (same reuse).
 *  - `lote-no-conforme` — DEFERRED: the GoodsReceiptLine entity does
 *    not carry a lot quality status today. Slot reserved in the
 *    Reconciliation discrepancy_type enum + DB CHECK so a later GR
 *    enhancement can emit without a migration. Tracked as followup.
 *
 * Independent GR short-circuit: if `po` is null OR a GR line has
 * `poLineId === null`, only `producto` is detectable — and even then
 * we skip it because there is no PO baseline to compare against.
 * Independent GRs therefore return `[]` from this version.
 *
 * Idempotency note: this service does NOT consult the repository; the
 * caller is responsible for not re-detecting on a GR that already
 * triggered a detection run. The j11 surface only triggers detection
 * on the GR_CONFIRMED bus event (slice #21 wiring) which fires exactly
 * once per GR per ADR-GR-LOT-CREATION-SEAM.
 */
@Injectable()
export class DiscrepancyDetectorService {
  detect(input: DetectInput): Reconciliation[] {
    const { po, poLines, gr, grLines } = input;

    // Independent-GR short-circuit — no PO baseline, nothing to compare.
    if (po === null) return [];

    const thresholds = input.thresholds ?? DEFAULT_VARIANCE_THRESHOLDS;
    const poLineById = new Map<string, PurchaseOrderLine>(
      poLines.map((l) => [l.id, l]),
    );

    const out: Reconciliation[] = [];

    for (const grLine of grLines) {
      // No PO-line link → cannot reconcile this row. Skip.
      if (grLine.poLineId === null) continue;

      const poLine = poLineById.get(grLine.poLineId);
      // Caller passed an inconsistent shape (po_line_id not in poLines).
      // Treat defensively — skip rather than throw; integration tests
      // assert the caller always loads the full set.
      if (poLine === undefined) continue;

      // --- producto ---
      if (poLine.ingredientId !== grLine.productId) {
        out.push(
          this.build(po, gr, grLine, 'producto', {
            expectedProductId: poLine.ingredientId,
            actualProductId: grLine.productId,
          }),
        );
        // When the product itself is wrong, qty/precio diffs are
        // meaningless — skip the rest for this line.
        continue;
      }

      // --- cantidad + precio (reuse slice #7 variance thresholds) ---
      const variance = detectVariance(
        {
          qtyOrdered: poLine.quantityOrdered,
          unitPriceOrdered: poLine.unitPrice,
          qtyReceivedActual: grLine.qtyReceivedActual,
          unitPriceActual: grLine.unitPriceActual,
          poLineId: grLine.poLineId,
        },
        thresholds,
      );

      if (variance.kind === 'qty' || variance.kind === 'both') {
        out.push(
          this.build(po, gr, grLine, 'cantidad', {
            expectedQty: poLine.quantityOrdered,
            actualQty: grLine.qtyReceivedActual,
            unit: poLine.unit,
            deltaPct: variance.qtyDeltaPct ?? 0,
          }),
        );
      }

      if (variance.kind === 'price' || variance.kind === 'both') {
        out.push(
          this.build(po, gr, grLine, 'precio', {
            expectedUnitPrice: poLine.unitPrice,
            actualUnitPrice: grLine.unitPriceActual,
            currency: po.currency,
            deltaPct: variance.priceDeltaPct ?? 0,
          }),
        );
      }
    }

    return out;
  }

  private build(
    po: PurchaseOrder,
    gr: GoodsReceipt,
    grLine: GoodsReceiptLine,
    discrepancyType: Reconciliation['discrepancyType'],
    diff: ReconciliationDiff,
  ): Reconciliation {
    const recon = new Reconciliation();
    recon.id = randomUUID();
    recon.organizationId = gr.organizationId;
    recon.poId = po.id;
    recon.poNumber = po.poNumber;
    recon.grId = gr.id;
    recon.supplierId = gr.supplierId;
    recon.discrepancyType = discrepancyType;
    recon.diff = {
      grLineId: grLine.id,
      poLineId: grLine.poLineId,
      ...diff,
    };
    recon.state = 'abierta';
    recon.resolvedAt = null;
    recon.resolvedByUserId = null;
    recon.resolutionNotes = null;
    return recon;
  }
}
