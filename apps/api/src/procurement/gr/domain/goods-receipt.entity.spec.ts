import { getMetadataArgsStorage } from 'typeorm';
import { GoodsReceipt, GR_STATES } from './goods-receipt.entity';

describe('GoodsReceipt entity', () => {
  it('maps to the `goods_receipts` table', () => {
    const meta = getMetadataArgsStorage().tables.find(
      (t) => t.target === GoodsReceipt,
    );
    expect(meta).toBeDefined();
    expect(meta?.name).toBe('goods_receipts');
  });

  it('declares all expected columns', () => {
    const columns = getMetadataArgsStorage()
      .columns.filter((c) => c.target === GoodsReceipt)
      .map((c) => c.options?.name ?? c.propertyName);
    // 10 user-managed columns + created_at + updated_at = 12; PK is `id`
    const expected = [
      'id',
      'organization_id',
      'po_id',
      'supplier_id',
      'received_at',
      'received_at_location_id',
      'receiving_user_id',
      'supplier_invoice_ref',
      'state', // propertyName "state" without explicit name option
      'source_photo_ingestion_id',
      'requires_review',
      'created_at',
      'updated_at',
    ];
    for (const col of expected) {
      expect(columns).toContain(col);
    }
  });

  it('exports the canonical state list', () => {
    expect(GR_STATES).toEqual(['draft', 'confirmed', 'cancelled']);
  });

  it('defaults po_id and supplier_invoice_ref to null', () => {
    const gr = new GoodsReceipt();
    expect(gr.poId).toBeNull();
    expect(gr.supplierInvoiceRef).toBeNull();
  });

  it('defaults requires_review to false', () => {
    // The DownstreamRevocationSubscriber (PR #157) flips this column via raw
    // SQL UPDATE on its own; the default-false invariant is what guarantees
    // newly-created GRs from the regular ingest path are never accidentally
    // present in the review queue.
    const gr = new GoodsReceipt();
    expect(gr.requiresReview).toBe(false);
  });
});
