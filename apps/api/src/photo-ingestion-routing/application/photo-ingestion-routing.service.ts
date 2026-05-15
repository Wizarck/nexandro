import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import { safeAuditEmit } from '../../shared/audit-emit/safe-audit-emit';
import { Lot, LotUnit } from '../../inventory/lot/domain/lot.entity';
import { LotRepository } from '../../inventory/lot/application/lot.repository';
import { GoodsReceipt } from '../../procurement/gr/domain/goods-receipt.entity';
import { GoodsReceiptRepository } from '../../procurement/gr/application/gr.repository';
import type {
  InvoiceLineItemHint,
  InvoicePhotoFieldMap,
  PhotoIngestionRoutingResult,
  ProductPhotoFieldMap,
} from './types';

/**
 * Aggregate-type pinned on every routing-decision audit envelope. Per
 * ADR-ROUTING-AUDIT-EVENT-NAMING (design.md, this slice): the envelope
 * describes a DECISION ABOUT the ingestion item, not a state change on
 * the downstream aggregate, so the aggregate id remains the ingestion
 * item id.
 */
const ROUTING_AGGREGATE_TYPE = 'photo_ingestion_item' as const;

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LOT_UNITS: readonly LotUnit[] = ['kg', 'g', 'L', 'ml', 'un'];

/**
 * Postgres unique-violation error code (`23505`). Used to recognise the
 * race condition where two concurrent emits both pass the
 * idempotency lookup, both attempt insert, and the second insert collides
 * on `uq_lots_source_photo_ingestion` / `uq_goods_receipts_source_photo_ingestion`.
 */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Cross-BC contract surface for the signed envelope's `payload_after`.
 * Inline (NOT imported from `packages/contracts`) per the rootDir TS6059
 * discipline. Mirrors the shape `HitlSignService.sign()` writes to the
 * `PHOTO_INGESTION_SIGNED` envelope.
 */
interface SignedEnvelopePayloadAfter {
  photoId: string;
  kind: 'product' | 'invoice';
  status: string;
  overallConfidence: number;
  modelVersion: string;
  promptVersion: string;
  signedAt: Date | string | null;
  signedByUserId: string | null;
  llmExtraction: { fields: Array<ExtractionField> } | null;
  operatorCorrection: { fields: Array<ExtractionField> } | null;
}

interface ExtractionField {
  name: string;
  value: string | number | null;
  confidence: number;
}

/**
 * Routes the `PHOTO_INGESTION_SIGNED` envelope to the appropriate
 * downstream aggregate: `kind='product'` → Lot row (inventory BC),
 * `kind='invoice'` → GR draft row (procurement BC).
 *
 * Per ADR-DOWNSTREAM-ROUTING-IDEMPOTENCY: idempotent under at-least-once
 * delivery via (1) app-layer `findBySourcePhotoIngestionId` short-circuit
 * + (2) DB-layer unique partial index race backstop. A pre-existing row
 * returns `alreadyRouted: true` envelope; no duplicate insert.
 *
 * Per ADR-FIELD-MAPPING-FAIL-OPEN: missing critical fields emit
 * `PHOTO_INGESTION_ROUTING_SKIPPED` and return `{ routed: false }`. No
 * throw, no retry.
 *
 * Multi-tenant: every repository call gates on `organizationId`.
 */
@Injectable()
export class PhotoIngestionRoutingService {
  private readonly logger = new Logger(PhotoIngestionRoutingService.name);

  constructor(
    private readonly lotRepo: LotRepository,
    private readonly grRepo: GoodsReceiptRepository,
    private readonly events: EventEmitter2,
  ) {}

  async routeSigned(
    envelope: AuditEventEnvelope,
  ): Promise<PhotoIngestionRoutingResult> {
    const validated = this.validateSignedEnvelope(envelope);
    if (validated === null) {
      return { routed: false, skipReason: ['envelope:invalid-shape'] };
    }
    const { organizationId, ingestionItemId, payloadAfter, signerUserId } =
      validated;
    if (payloadAfter.kind === 'product') {
      return this.routeProduct(
        organizationId,
        ingestionItemId,
        payloadAfter,
        signerUserId,
      );
    }
    return this.routeInvoice(
      organizationId,
      ingestionItemId,
      payloadAfter,
      signerUserId,
    );
  }

  // ------------- product path -------------

  private async routeProduct(
    organizationId: string,
    ingestionItemId: string,
    payloadAfter: SignedEnvelopePayloadAfter,
    _signerUserId: string | null,
  ): Promise<PhotoIngestionRoutingResult> {
    const existing = await this.lotRepo.findBySourcePhotoIngestionId(
      organizationId,
      ingestionItemId,
    );
    if (existing !== null) {
      await this.emitRouted(
        organizationId,
        ingestionItemId,
        'product',
        'lot',
        existing.id,
        true,
      );
      return {
        routed: true,
        downstreamAggregateType: 'lot',
        downstreamAggregateId: existing.id,
        alreadyRouted: true,
      };
    }

    const fields = this.extractProductFields(payloadAfter);
    const missing = this.validateProductFields(fields);
    if (missing.length > 0) {
      await this.emitSkipped(
        organizationId,
        ingestionItemId,
        'product',
        missing,
      );
      return { routed: false, skipReason: missing };
    }

    // Defensive narrowing — validateProductFields above guarantees the
    // required fields are populated, but TS can't see across the array
    // boundary so we re-assert here.
    if (
      fields.gtin === undefined ||
      fields.quantity === undefined ||
      fields.unit === undefined ||
      fields.locationId === undefined
    ) {
      // Should be unreachable.
      await this.emitSkipped(organizationId, ingestionItemId, 'product', [
        'invariant:internal-narrowing-failed',
      ]);
      return {
        routed: false,
        skipReason: ['invariant:internal-narrowing-failed'],
      };
    }

    const receivedAt = this.coerceDate(payloadAfter.signedAt) ?? new Date();

    let lot: Lot;
    try {
      lot = Lot.create({
        organizationId,
        locationId: fields.locationId,
        supplierId: fields.supplierId ?? null,
        receivedAt,
        expiresAt: fields.expiryDate ?? null,
        quantityReceived: fields.quantity,
        unit: fields.unit,
        metadata: {
          sourceKind: 'photo-ingest',
          sourceItemId: ingestionItemId,
          gtin: fields.gtin,
        },
        sourcePhotoIngestionId: ingestionItemId,
      });
    } catch (err) {
      const reason = `invariant:${err instanceof Error ? err.constructor.name : 'UnknownError'}`;
      await this.emitSkipped(organizationId, ingestionItemId, 'product', [
        reason,
      ]);
      return { routed: false, skipReason: [reason] };
    }

    try {
      const saved = await this.lotRepo.save(lot);
      await this.emitRouted(
        organizationId,
        ingestionItemId,
        'product',
        'lot',
        saved.id,
        false,
      );
      return {
        routed: true,
        downstreamAggregateType: 'lot',
        downstreamAggregateId: saved.id,
      };
    } catch (err) {
      // DB-layer race backstop per ADR-DOWNSTREAM-ROUTING-IDEMPOTENCY.
      if (this.isUniqueViolation(err)) {
        const winner = await this.lotRepo.findBySourcePhotoIngestionId(
          organizationId,
          ingestionItemId,
        );
        if (winner !== null) {
          await this.emitRouted(
            organizationId,
            ingestionItemId,
            'product',
            'lot',
            winner.id,
            true,
          );
          return {
            routed: true,
            downstreamAggregateType: 'lot',
            downstreamAggregateId: winner.id,
            alreadyRouted: true,
          };
        }
      }
      // Re-raise non-idempotency errors — the subscriber catches.
      this.logger.error(
        `photo-ingestion-routing.product save failed: org=${organizationId} item=${ingestionItemId} err=${err instanceof Error ? err.message : String(err)}`,
      );
      const reason = `invariant:${err instanceof Error ? err.constructor.name : 'PersistenceError'}`;
      await this.emitSkipped(organizationId, ingestionItemId, 'product', [
        reason,
      ]);
      return { routed: false, skipReason: [reason] };
    }
  }

  // ------------- invoice path -------------

  private async routeInvoice(
    organizationId: string,
    ingestionItemId: string,
    payloadAfter: SignedEnvelopePayloadAfter,
    signerUserId: string | null,
  ): Promise<PhotoIngestionRoutingResult> {
    const existing = await this.grRepo.findBySourcePhotoIngestionId(
      organizationId,
      ingestionItemId,
    );
    if (existing !== null) {
      await this.emitRouted(
        organizationId,
        ingestionItemId,
        'invoice',
        'goods_receipt',
        existing.id,
        true,
      );
      return {
        routed: true,
        downstreamAggregateType: 'goods_receipt',
        downstreamAggregateId: existing.id,
        alreadyRouted: true,
      };
    }

    const fields = this.extractInvoiceFields(payloadAfter, signerUserId);
    const missing = this.validateInvoiceFields(fields);
    if (missing.length > 0) {
      await this.emitSkipped(
        organizationId,
        ingestionItemId,
        'invoice',
        missing,
      );
      return { routed: false, skipReason: missing };
    }
    if (
      fields.supplierInvoiceRef === undefined ||
      fields.supplierId === undefined ||
      fields.receivedAtLocationId === undefined ||
      fields.receivingUserId === undefined ||
      fields.lineItems === undefined ||
      fields.lineItems.length === 0
    ) {
      await this.emitSkipped(organizationId, ingestionItemId, 'invoice', [
        'invariant:internal-narrowing-failed',
      ]);
      return {
        routed: false,
        skipReason: ['invariant:internal-narrowing-failed'],
      };
    }

    const gr = new GoodsReceipt();
    gr.id = randomUUID();
    gr.organizationId = organizationId;
    gr.poId = null;
    gr.supplierId = fields.supplierId;
    gr.receivedAt = fields.receivedAt ?? new Date();
    gr.receivedAtLocationId = fields.receivedAtLocationId;
    gr.receivingUserId = fields.receivingUserId;
    gr.supplierInvoiceRef = fields.supplierInvoiceRef;
    gr.state = 'draft';
    gr.sourcePhotoIngestionId = ingestionItemId;

    try {
      const saved = await this.grRepo.save(gr);
      await this.emitRouted(
        organizationId,
        ingestionItemId,
        'invoice',
        'goods_receipt',
        saved.id,
        false,
        fields.lineItems,
      );
      return {
        routed: true,
        downstreamAggregateType: 'goods_receipt',
        downstreamAggregateId: saved.id,
      };
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        const winner = await this.grRepo.findBySourcePhotoIngestionId(
          organizationId,
          ingestionItemId,
        );
        if (winner !== null) {
          await this.emitRouted(
            organizationId,
            ingestionItemId,
            'invoice',
            'goods_receipt',
            winner.id,
            true,
            fields.lineItems,
          );
          return {
            routed: true,
            downstreamAggregateType: 'goods_receipt',
            downstreamAggregateId: winner.id,
            alreadyRouted: true,
          };
        }
      }
      this.logger.error(
        `photo-ingestion-routing.invoice save failed: org=${organizationId} item=${ingestionItemId} err=${err instanceof Error ? err.message : String(err)}`,
      );
      const reason = `invariant:${err instanceof Error ? err.constructor.name : 'PersistenceError'}`;
      await this.emitSkipped(organizationId, ingestionItemId, 'invoice', [
        reason,
      ]);
      return { routed: false, skipReason: [reason] };
    }
  }

  // ------------- field extraction -------------

  /**
   * Walk `operatorCorrection.fields[]` first (operator-trusted at
   * confidence 1.0 by definition), then `llmExtraction.fields[]` as
   * fallback. Returns a `Map<string, ExtractionField>` keyed on
   * lowercased + normalized field name.
   */
  private buildFieldLookup(
    payloadAfter: SignedEnvelopePayloadAfter,
  ): Map<string, ExtractionField> {
    const out = new Map<string, ExtractionField>();
    const llmFields = payloadAfter.llmExtraction?.fields ?? [];
    for (const f of llmFields) {
      out.set(this.normalizeFieldName(f.name), f);
    }
    const opFields = payloadAfter.operatorCorrection?.fields ?? [];
    for (const f of opFields) {
      out.set(this.normalizeFieldName(f.name), f);
    }
    return out;
  }

  private normalizeFieldName(name: string): string {
    return name.trim().toLowerCase().replace(/-/g, '_');
  }

  private extractProductFields(
    payloadAfter: SignedEnvelopePayloadAfter,
  ): ProductPhotoFieldMap {
    const lookup = this.buildFieldLookup(payloadAfter);
    const gtin = this.readString(lookup, ['gtin', 'barcode', 'ean']);
    const quantity = this.readNumber(lookup, [
      'quantity',
      'qty',
      'quantity_received',
    ]);
    const unitRaw = this.readString(lookup, ['unit', 'uom']);
    const unit = this.coerceLotUnit(unitRaw);
    const expiryDate = this.readDate(lookup, [
      'expiry_date',
      'expires_at',
      'best_before',
    ]);
    const supplierId = this.readUuid(lookup, ['supplier_id']);
    const locationId = this.readUuid(lookup, ['location_id', 'kitchen_id']);
    return {
      gtin: gtin ?? undefined,
      expiryDate,
      quantity,
      unit,
      supplierId: supplierId ?? null,
      locationId: locationId ?? undefined,
    };
  }

  private extractInvoiceFields(
    payloadAfter: SignedEnvelopePayloadAfter,
    signerUserId: string | null,
  ): InvoicePhotoFieldMap {
    const lookup = this.buildFieldLookup(payloadAfter);
    const supplierInvoiceRef = this.readString(lookup, [
      'supplier_invoice_ref',
      'invoice_ref',
      'invoice_number',
    ]);
    const supplierId = this.readUuid(lookup, ['supplier_id']);
    const receivedAt = this.readDate(lookup, [
      'received_at',
      'invoice_date',
      'date',
    ]);
    const receivedAtLocationId = this.readUuid(lookup, [
      'received_at_location_id',
      'location_id',
      'kitchen_id',
    ]);
    // Receiving user defaults to the signer — the operator who signed the
    // extraction is reasonably also the receiver. The j7 confirmation
    // surface lets the operator override if needed.
    const receivingUserId =
      this.readUuid(lookup, ['receiving_user_id']) ?? signerUserId ?? undefined;
    const lineItems = this.readLineItems(lookup);
    return {
      supplierInvoiceRef: supplierInvoiceRef ?? undefined,
      supplierId: supplierId ?? undefined,
      receivedAt,
      receivedAtLocationId: receivedAtLocationId ?? undefined,
      receivingUserId,
      lineItems,
    };
  }

  // ------------- validation -------------

  private validateProductFields(map: ProductPhotoFieldMap): string[] {
    const missing: string[] = [];
    if (map.gtin === undefined || map.gtin.trim().length === 0) {
      missing.push('missing:gtin');
    }
    if (
      map.quantity === undefined ||
      !Number.isFinite(map.quantity) ||
      map.quantity <= 0
    ) {
      missing.push('missing:quantity');
    }
    if (map.unit === undefined) {
      missing.push('missing:unit');
    }
    if (map.locationId === undefined) {
      missing.push('missing:locationId');
    }
    return missing;
  }

  private validateInvoiceFields(map: InvoicePhotoFieldMap): string[] {
    const missing: string[] = [];
    if (
      map.supplierInvoiceRef === undefined ||
      map.supplierInvoiceRef.trim().length === 0
    ) {
      missing.push('missing:supplierInvoiceRef');
    }
    if (map.supplierId === undefined) {
      missing.push('missing:supplierId');
    }
    if (map.receivedAtLocationId === undefined) {
      missing.push('missing:receivedAtLocationId');
    }
    if (map.receivingUserId === undefined) {
      missing.push('missing:receivingUserId');
    }
    if (map.lineItems === undefined || map.lineItems.length === 0) {
      missing.push('missing:lineItems');
    }
    return missing;
  }

  // ------------- envelope emission -------------

  private async emitRouted(
    organizationId: string,
    ingestionItemId: string,
    kind: 'product' | 'invoice',
    downstreamAggregateType: 'lot' | 'goods_receipt',
    downstreamAggregateId: string,
    alreadyRouted: boolean,
    lineItemsHint?: InvoiceLineItemHint[],
  ): Promise<void> {
    const payloadAfter: Record<string, unknown> = {
      ingestionItemId,
      kind,
      downstreamAggregateType,
      downstreamAggregateId,
    };
    if (alreadyRouted) payloadAfter.alreadyRouted = true;
    if (lineItemsHint !== undefined) payloadAfter.lineItemsHint = lineItemsHint;
    const envelope: AuditEventEnvelope = {
      organizationId,
      aggregateType: ROUTING_AGGREGATE_TYPE,
      aggregateId: ingestionItemId,
      actorUserId: null,
      actorKind: 'system',
      payloadBefore: null,
      payloadAfter,
    };
    await safeAuditEmit(
      this.events,
      AuditEventType.PHOTO_INGESTION_DOWNSTREAM_ROUTED,
      envelope,
      this.logger,
    );
  }

  private async emitSkipped(
    organizationId: string,
    ingestionItemId: string,
    kind: 'product' | 'invoice',
    reasons: string[],
  ): Promise<void> {
    const envelope: AuditEventEnvelope = {
      organizationId,
      aggregateType: ROUTING_AGGREGATE_TYPE,
      aggregateId: ingestionItemId,
      actorUserId: null,
      actorKind: 'system',
      payloadBefore: null,
      payloadAfter: {
        ingestionItemId,
        kind,
        reason: reasons,
      },
    };
    await safeAuditEmit(
      this.events,
      AuditEventType.PHOTO_INGESTION_ROUTING_SKIPPED,
      envelope,
      this.logger,
    );
  }

  // ------------- coercion helpers -------------

  private validateSignedEnvelope(envelope: AuditEventEnvelope): {
    organizationId: string;
    ingestionItemId: string;
    payloadAfter: SignedEnvelopePayloadAfter;
    signerUserId: string | null;
  } | null {
    if (
      typeof envelope.organizationId !== 'string' ||
      typeof envelope.aggregateId !== 'string'
    ) {
      return null;
    }
    const after = envelope.payloadAfter;
    if (!after || typeof after !== 'object') return null;
    const p = after as Partial<SignedEnvelopePayloadAfter>;
    if (p.kind !== 'product' && p.kind !== 'invoice') return null;
    return {
      organizationId: envelope.organizationId,
      ingestionItemId: envelope.aggregateId,
      payloadAfter: p as SignedEnvelopePayloadAfter,
      signerUserId: typeof p.signedByUserId === 'string' ? p.signedByUserId : null,
    };
  }

  private readString(
    lookup: Map<string, ExtractionField>,
    keys: string[],
  ): string | undefined {
    for (const k of keys) {
      const v = lookup.get(this.normalizeFieldName(k))?.value;
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    }
    return undefined;
  }

  private readNumber(
    lookup: Map<string, ExtractionField>,
    keys: string[],
  ): number | undefined {
    for (const k of keys) {
      const raw = lookup.get(this.normalizeFieldName(k))?.value;
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
      if (typeof raw === 'string') {
        const n = Number.parseFloat(raw);
        if (Number.isFinite(n)) return n;
      }
    }
    return undefined;
  }

  private readDate(
    lookup: Map<string, ExtractionField>,
    keys: string[],
  ): Date | undefined {
    for (const k of keys) {
      const raw = lookup.get(this.normalizeFieldName(k))?.value;
      if (typeof raw === 'string') {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
    return undefined;
  }

  private readUuid(
    lookup: Map<string, ExtractionField>,
    keys: string[],
  ): string | undefined {
    const raw = this.readString(lookup, keys);
    if (raw === undefined) return undefined;
    return UUID_RX.test(raw) ? raw : undefined;
  }

  private coerceLotUnit(raw: string | undefined): LotUnit | undefined {
    if (raw === undefined) return undefined;
    const lower = raw.toLowerCase();
    return (LOT_UNITS as readonly string[]).includes(lower)
      ? (lower as LotUnit)
      : undefined;
  }

  private coerceDate(raw: Date | string | null | undefined): Date | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? undefined : raw;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  private readLineItems(
    lookup: Map<string, ExtractionField>,
  ): InvoiceLineItemHint[] | undefined {
    const raw = lookup.get(this.normalizeFieldName('line_items'))?.value;
    if (raw === undefined || raw === null) return undefined;
    let parsed: unknown;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return undefined;
      }
    } else {
      parsed = raw;
    }
    if (!Array.isArray(parsed)) return undefined;
    const items: InvoiceLineItemHint[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const qtyRaw = e.qty ?? e.quantity;
      const qty =
        typeof qtyRaw === 'number'
          ? qtyRaw
          : typeof qtyRaw === 'string'
            ? Number.parseFloat(qtyRaw)
            : Number.NaN;
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const item: InvoiceLineItemHint = { qty };
      if (typeof e.productId === 'string' && UUID_RX.test(e.productId)) {
        item.productId = e.productId;
      }
      const unitPriceRaw = e.unitPrice ?? e.unit_price;
      if (
        typeof unitPriceRaw === 'number' &&
        Number.isFinite(unitPriceRaw)
      ) {
        item.unitPrice = unitPriceRaw;
      } else if (typeof unitPriceRaw === 'string') {
        const n = Number.parseFloat(unitPriceRaw);
        if (Number.isFinite(n)) item.unitPrice = n;
      }
      const unitRaw = typeof e.unit === 'string' ? e.unit : undefined;
      const unit = this.coerceLotUnit(unitRaw);
      if (unit !== undefined) item.unit = unit;
      if (typeof e.description === 'string') item.description = e.description;
      items.push(item);
    }
    return items.length > 0 ? items : undefined;
  }

  private isUniqueViolation(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { code?: unknown; driverError?: { code?: unknown } };
    if (e.code === PG_UNIQUE_VIOLATION) return true;
    if (
      e.driverError &&
      typeof e.driverError === 'object' &&
      (e.driverError as { code?: unknown }).code === PG_UNIQUE_VIOLATION
    ) {
      return true;
    }
    return false;
  }
}
