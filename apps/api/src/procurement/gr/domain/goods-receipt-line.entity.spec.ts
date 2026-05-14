import { getMetadataArgsStorage } from 'typeorm';
import { GoodsReceiptLine } from './goods-receipt-line.entity';

describe('GoodsReceiptLine entity', () => {
  it('maps to the `goods_receipt_lines` table', () => {
    const meta = getMetadataArgsStorage().tables.find(
      (t) => t.target === GoodsReceiptLine,
    );
    expect(meta).toBeDefined();
    expect(meta?.name).toBe('goods_receipt_lines');
  });

  it('numeric columns use numericTransformer hoisted above class declaration', () => {
    // Compile-time TS2448 would have prevented this file from compiling.
    // Runtime smoke check: numeric transformers convert string → number.
    const cols = getMetadataArgsStorage().columns.filter(
      (c) =>
        c.target === GoodsReceiptLine &&
        (c.options?.name === 'qty_received_actual' ||
          c.options?.name === 'unit_price_actual'),
    );
    expect(cols).toHaveLength(2);
    for (const col of cols) {
      const transformer = col.options?.transformer as
        | { from: (v: string | null) => number; to: (v: number) => number }
        | undefined;
      expect(transformer).toBeDefined();
      expect(transformer?.from('123.4500')).toBe(123.45);
      expect(transformer?.from(null)).toBe(0);
      expect(transformer?.to(7.89)).toBe(7.89);
    }
  });

  it('declares the numeric precision/scale per ADR-GR-MONEY-PRECISION', () => {
    const cols = getMetadataArgsStorage().columns.filter(
      (c) => c.target === GoodsReceiptLine,
    );
    const priceCol = cols.find((c) => c.options?.name === 'unit_price_actual');
    expect(priceCol?.options?.precision).toBe(12);
    expect(priceCol?.options?.scale).toBe(4);

    const qtyCol = cols.find((c) => c.options?.name === 'qty_received_actual');
    expect(qtyCol?.options?.precision).toBe(18);
    expect(qtyCol?.options?.scale).toBe(4);
  });

  it('defaults nullable columns', () => {
    const line = new GoodsReceiptLine();
    expect(line.poLineId).toBeNull();
    expect(line.lotIdCreated).toBeNull();
    expect(line.expiresAtOverride).toBeNull();
  });
});
