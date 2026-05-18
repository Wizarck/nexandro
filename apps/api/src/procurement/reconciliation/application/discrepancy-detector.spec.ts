import { randomUUID } from 'node:crypto';
import { GoodsReceipt } from '../../gr/domain/goods-receipt.entity';
import { GoodsReceiptLine } from '../../gr/domain/goods-receipt-line.entity';
import { PurchaseOrder } from '../../po/domain/purchase-order.entity';
import { PurchaseOrderLine } from '../../po/domain/purchase-order-line.entity';
import { DiscrepancyDetectorService } from './discrepancy-detector.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const SUPPLIER = '22222222-2222-4222-8222-222222222222';

function makePo(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  const po = new PurchaseOrder();
  po.id = overrides.id ?? randomUUID();
  po.organizationId = overrides.organizationId ?? ORG;
  po.supplierId = overrides.supplierId ?? SUPPLIER;
  po.poNumber = overrides.poNumber ?? 'PO-2026-0042';
  po.state = overrides.state ?? 'sent';
  po.currency = overrides.currency ?? 'EUR';
  po.subtotal = overrides.subtotal ?? 0;
  po.vatTotal = overrides.vatTotal ?? 0;
  po.total = overrides.total ?? 0;
  po.expectedDeliveryDate = overrides.expectedDeliveryDate ?? null;
  po.notes = overrides.notes ?? null;
  po.createdByUserId =
    overrides.createdByUserId ?? '33333333-3333-4333-8333-333333333333';
  po.sentAt = overrides.sentAt ?? null;
  po.closedAt = overrides.closedAt ?? null;
  po.createdAt = overrides.createdAt ?? new Date('2026-05-15T10:00:00Z');
  po.updatedAt = overrides.updatedAt ?? new Date('2026-05-15T10:00:00Z');
  return po;
}

function makePoLine(
  poId: string,
  overrides: Partial<PurchaseOrderLine> = {},
): PurchaseOrderLine {
  const l = new PurchaseOrderLine();
  l.id = overrides.id ?? randomUUID();
  l.purchaseOrderId = poId;
  l.organizationId = overrides.organizationId ?? ORG;
  l.lineNumber = overrides.lineNumber ?? 1;
  l.ingredientId =
    overrides.ingredientId ?? '44444444-4444-4444-8444-444444444444';
  l.quantityOrdered = overrides.quantityOrdered ?? 100;
  l.unit = overrides.unit ?? 'kg';
  l.unitPrice = overrides.unitPrice ?? 2.0;
  l.vatRate = overrides.vatRate ?? 0.1;
  l.vatInclusive = overrides.vatInclusive ?? false;
  l.lineSubtotal = overrides.lineSubtotal ?? 200;
  l.lineVat = overrides.lineVat ?? 20;
  l.lineTotal = overrides.lineTotal ?? 220;
  return l;
}

function makeGr(overrides: Partial<GoodsReceipt> = {}): GoodsReceipt {
  const gr = new GoodsReceipt();
  gr.id = overrides.id ?? randomUUID();
  gr.organizationId = overrides.organizationId ?? ORG;
  gr.poId = 'poId' in overrides ? (overrides.poId ?? null) : null;
  gr.supplierId = overrides.supplierId ?? SUPPLIER;
  gr.receivedAt = overrides.receivedAt ?? new Date('2026-05-18T09:30:00Z');
  gr.receivedAtLocationId =
    overrides.receivedAtLocationId ?? '55555555-5555-4555-8555-555555555555';
  gr.receivingUserId =
    overrides.receivingUserId ?? '66666666-6666-4666-8666-666666666666';
  gr.supplierInvoiceRef = overrides.supplierInvoiceRef ?? null;
  gr.state = overrides.state ?? 'confirmed';
  gr.sourcePhotoIngestionId = overrides.sourcePhotoIngestionId ?? null;
  gr.requiresReview = overrides.requiresReview ?? false;
  gr.createdAt = overrides.createdAt ?? new Date('2026-05-18T09:30:00Z');
  gr.updatedAt = overrides.updatedAt ?? new Date('2026-05-18T09:30:00Z');
  return gr;
}

function makeGrLine(
  grId: string,
  overrides: Partial<GoodsReceiptLine> = {},
): GoodsReceiptLine {
  const l = new GoodsReceiptLine();
  l.id = overrides.id ?? randomUUID();
  l.grId = grId;
  l.poLineId = 'poLineId' in overrides ? (overrides.poLineId ?? null) : null;
  l.productId =
    overrides.productId ?? '44444444-4444-4444-8444-444444444444';
  l.qtyReceivedActual = overrides.qtyReceivedActual ?? 100;
  l.unitPriceActual = overrides.unitPriceActual ?? 2.0;
  l.lotIdCreated = overrides.lotIdCreated ?? null;
  l.expiresAtOverride = overrides.expiresAtOverride ?? null;
  l.createdAt = overrides.createdAt ?? new Date('2026-05-18T09:30:00Z');
  l.updatedAt = overrides.updatedAt ?? new Date('2026-05-18T09:30:00Z');
  return l;
}

describe('DiscrepancyDetectorService', () => {
  let svc: DiscrepancyDetectorService;

  beforeEach(() => {
    svc = new DiscrepancyDetectorService();
  });

  it('returns [] when GR has no PO (independent receipt)', () => {
    const gr = makeGr({ poId: null });
    const grLine = makeGrLine(gr.id, { poLineId: null });
    const out = svc.detect({ po: null, poLines: [], gr, grLines: [grLine] });
    expect(out).toEqual([]);
  });

  it('returns [] when GR fully matches PO (same product, qty, price)', () => {
    const po = makePo();
    const poLine = makePoLine(po.id, { quantityOrdered: 100, unitPrice: 2.0 });
    const gr = makeGr({ poId: po.id });
    const grLine = makeGrLine(gr.id, {
      poLineId: poLine.id,
      productId: poLine.ingredientId,
      qtyReceivedActual: 100,
      unitPriceActual: 2.0,
    });
    const out = svc.detect({ po, poLines: [poLine], gr, grLines: [grLine] });
    expect(out).toEqual([]);
  });

  it('detects producto when GR line productId differs from PO ingredientId', () => {
    const po = makePo();
    const poLine = makePoLine(po.id);
    const gr = makeGr({ poId: po.id });
    const wrongProduct = '99999999-9999-4999-8999-999999999999';
    const grLine = makeGrLine(gr.id, {
      poLineId: poLine.id,
      productId: wrongProduct,
      qtyReceivedActual: 100,
      unitPriceActual: 2.0,
    });
    const out = svc.detect({ po, poLines: [poLine], gr, grLines: [grLine] });
    expect(out).toHaveLength(1);
    expect(out[0].discrepancyType).toBe('producto');
    expect(out[0].diff).toMatchObject({
      expectedProductId: poLine.ingredientId,
      actualProductId: wrongProduct,
    });
    expect(out[0].state).toBe('abierta');
    expect(out[0].poNumber).toBe('PO-2026-0042');
    expect(out[0].organizationId).toBe(ORG);
  });

  it('skips qty/precio detection when producto mismatch fires (avoids noise)', () => {
    const po = makePo();
    const poLine = makePoLine(po.id, { quantityOrdered: 100, unitPrice: 2.0 });
    const gr = makeGr({ poId: po.id });
    const grLine = makeGrLine(gr.id, {
      poLineId: poLine.id,
      productId: '99999999-9999-4999-8999-999999999999',
      qtyReceivedActual: 500, // would trigger cantidad
      unitPriceActual: 10.0, // would trigger precio
    });
    const out = svc.detect({ po, poLines: [poLine], gr, grLines: [grLine] });
    expect(out).toHaveLength(1);
    expect(out[0].discrepancyType).toBe('producto');
  });

  it('detects cantidad when qty drift crosses variance threshold', () => {
    const po = makePo();
    const poLine = makePoLine(po.id, { quantityOrdered: 100, unitPrice: 2.0 });
    const gr = makeGr({ poId: po.id });
    const grLine = makeGrLine(gr.id, {
      poLineId: poLine.id,
      productId: poLine.ingredientId,
      qtyReceivedActual: 120, // 20% delta, well above default 1%
      unitPriceActual: 2.0,
    });
    const out = svc.detect({ po, poLines: [poLine], gr, grLines: [grLine] });
    expect(out).toHaveLength(1);
    expect(out[0].discrepancyType).toBe('cantidad');
    expect(out[0].diff).toMatchObject({
      expectedQty: 100,
      actualQty: 120,
      unit: 'kg',
    });
  });

  it('detects precio when unit price drift crosses variance threshold', () => {
    const po = makePo();
    const poLine = makePoLine(po.id, { quantityOrdered: 100, unitPrice: 2.0 });
    const gr = makeGr({ poId: po.id });
    const grLine = makeGrLine(gr.id, {
      poLineId: poLine.id,
      productId: poLine.ingredientId,
      qtyReceivedActual: 100,
      unitPriceActual: 2.5, // 25% delta
    });
    const out = svc.detect({ po, poLines: [poLine], gr, grLines: [grLine] });
    expect(out).toHaveLength(1);
    expect(out[0].discrepancyType).toBe('precio');
    expect(out[0].diff).toMatchObject({
      expectedUnitPrice: 2.0,
      actualUnitPrice: 2.5,
      currency: 'EUR',
    });
  });

  it('emits BOTH cantidad and precio when both cross threshold', () => {
    const po = makePo();
    const poLine = makePoLine(po.id, { quantityOrdered: 100, unitPrice: 2.0 });
    const gr = makeGr({ poId: po.id });
    const grLine = makeGrLine(gr.id, {
      poLineId: poLine.id,
      productId: poLine.ingredientId,
      qtyReceivedActual: 120,
      unitPriceActual: 2.5,
    });
    const out = svc.detect({ po, poLines: [poLine], gr, grLines: [grLine] });
    expect(out).toHaveLength(2);
    const types = out.map((r) => r.discrepancyType).sort();
    expect(types).toEqual(['cantidad', 'precio']);
  });

  it('skips GR lines without poLineId even when PO is set (defensive)', () => {
    const po = makePo();
    const poLine = makePoLine(po.id);
    const gr = makeGr({ poId: po.id });
    const grLineLinked = makeGrLine(gr.id, {
      poLineId: poLine.id,
      productId: poLine.ingredientId,
      qtyReceivedActual: 100,
      unitPriceActual: 2.0,
    });
    const grLineFloating = makeGrLine(gr.id, {
      poLineId: null,
      productId: '99999999-9999-4999-8999-999999999999',
      qtyReceivedActual: 999,
      unitPriceActual: 999,
    });
    const out = svc.detect({
      po,
      poLines: [poLine],
      gr,
      grLines: [grLineLinked, grLineFloating],
    });
    expect(out).toEqual([]);
  });

  it('skips GR line when its poLineId is not in the loaded poLines (defensive)', () => {
    const po = makePo();
    const poLine = makePoLine(po.id);
    const gr = makeGr({ poId: po.id });
    const grLine = makeGrLine(gr.id, {
      poLineId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', // not in poLines
      productId: poLine.ingredientId,
      qtyReceivedActual: 100,
      unitPriceActual: 2.0,
    });
    const out = svc.detect({ po, poLines: [poLine], gr, grLines: [grLine] });
    expect(out).toEqual([]);
  });

  it('processes multiple GR lines independently', () => {
    const po = makePo();
    const poLineA = makePoLine(po.id, { quantityOrdered: 100, unitPrice: 2.0 });
    const poLineB = makePoLine(po.id, {
      lineNumber: 2,
      ingredientId: '77777777-7777-4777-8777-777777777777',
      quantityOrdered: 50,
      unitPrice: 5.0,
    });
    const gr = makeGr({ poId: po.id });
    const grLineA = makeGrLine(gr.id, {
      poLineId: poLineA.id,
      productId: poLineA.ingredientId,
      qtyReceivedActual: 100,
      unitPriceActual: 2.0,
    });
    const grLineB = makeGrLine(gr.id, {
      poLineId: poLineB.id,
      productId: poLineB.ingredientId,
      qtyReceivedActual: 75, // 50% over → cantidad
      unitPriceActual: 5.0,
    });
    const out = svc.detect({
      po,
      poLines: [poLineA, poLineB],
      gr,
      grLines: [grLineA, grLineB],
    });
    expect(out).toHaveLength(1);
    expect(out[0].discrepancyType).toBe('cantidad');
    expect(out[0].diff).toMatchObject({
      poLineId: poLineB.id,
      expectedQty: 50,
      actualQty: 75,
    });
  });
});
