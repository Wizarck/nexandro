import { randomUUID } from 'node:crypto';
import {
  LOT_CONSUMED_EVENT,
  LOT_CONSUMED_UNITS,
  LotConsumedPayload,
  LotConsumedPayloadSchema,
} from './events';

describe('LOT_CONSUMED_EVENT bus channel constant', () => {
  it('is the canonical bus channel name', () => {
    expect(LOT_CONSUMED_EVENT).toBe('m3.inventory.lot-consumed');
  });

  it('canonical unit enum matches lot.entity LotUnit', () => {
    // Defensive: if slice #1's LotUnit ever grows / shrinks, this test
    // will surface here AND at the Zod boundary below.
    expect(LOT_CONSUMED_UNITS).toEqual(['kg', 'g', 'L', 'ml', 'un']);
  });
});

describe('LotConsumedPayloadSchema (Zod validation)', () => {
  const basePayload = (): LotConsumedPayload => ({
    organization_id: randomUUID(),
    lot_id: randomUUID(),
    stock_move_id: randomUUID(),
    qty_consumed: 30,
    unit: 'kg',
    recipe_id: randomUUID(),
    menu_item_id: null,
    consumed_at: '2026-05-14T12:34:56.000Z',
    consumed_by_user_id: randomUUID(),
    nexandro_tag: 'chef-tablet',
    reason: null,
  });

  it('happy path: full payload parses', () => {
    const parsed = LotConsumedPayloadSchema.parse(basePayload());
    expect(parsed.qty_consumed).toBe(30);
    expect(parsed.unit).toBe('kg');
    expect(parsed.recipe_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('accepts nullable recipe_id + menu_item_id together', () => {
    const p = basePayload();
    p.recipe_id = null;
    p.menu_item_id = null;
    p.reason = 'dropped pan'; // service-level guard requires reason; schema does not
    const parsed = LotConsumedPayloadSchema.parse(p);
    expect(parsed.recipe_id).toBeNull();
    expect(parsed.menu_item_id).toBeNull();
  });

  it('accepts menu-item driver (recipe_id null)', () => {
    const p = basePayload();
    p.recipe_id = null;
    p.menu_item_id = randomUUID();
    const parsed = LotConsumedPayloadSchema.parse(p);
    expect(parsed.menu_item_id).not.toBeNull();
  });

  describe('boundary violations reject at Zod layer', () => {
    it('missing organization_id → ZodError', () => {
      const p = basePayload() as Record<string, unknown>;
      delete p.organization_id;
      expect(() => LotConsumedPayloadSchema.parse(p)).toThrow();
    });

    it('non-UUID organization_id → ZodError', () => {
      const p = basePayload();
      (p as { organization_id: string }).organization_id = 'not-a-uuid';
      expect(() => LotConsumedPayloadSchema.parse(p)).toThrow();
    });

    it('qty_consumed = 0 → ZodError', () => {
      const p = basePayload();
      p.qty_consumed = 0;
      expect(() => LotConsumedPayloadSchema.parse(p)).toThrow(
        /strictly positive/,
      );
    });

    it('qty_consumed negative → ZodError', () => {
      const p = basePayload();
      p.qty_consumed = -5;
      expect(() => LotConsumedPayloadSchema.parse(p)).toThrow(
        /strictly positive/,
      );
    });

    it('qty_consumed NaN → ZodError (Zod number rejects NaN by default)', () => {
      const p = basePayload();
      p.qty_consumed = Number.NaN;
      expect(() => LotConsumedPayloadSchema.parse(p)).toThrow();
    });

    it('unknown unit → ZodError', () => {
      const p = basePayload();
      (p as { unit: string }).unit = 'dozen';
      expect(() => LotConsumedPayloadSchema.parse(p)).toThrow();
    });

    it('all canonical units accepted', () => {
      for (const u of LOT_CONSUMED_UNITS) {
        const p = basePayload();
        p.unit = u;
        expect(LotConsumedPayloadSchema.parse(p).unit).toBe(u);
      }
    });

    it('consumed_at non-ISO string → ZodError', () => {
      const p = basePayload();
      p.consumed_at = 'yesterday';
      expect(() => LotConsumedPayloadSchema.parse(p)).toThrow(
        /ISO-8601 datetime/,
      );
    });

    it('nexandro_tag empty string → ZodError (min length 1)', () => {
      const p = basePayload();
      p.nexandro_tag = '';
      expect(() => LotConsumedPayloadSchema.parse(p)).toThrow();
    });

    it('nexandro_tag null → accepted', () => {
      const p = basePayload();
      p.nexandro_tag = null;
      const parsed = LotConsumedPayloadSchema.parse(p);
      expect(parsed.nexandro_tag).toBeNull();
    });

    it('reason empty string → ZodError', () => {
      const p = basePayload();
      p.reason = '';
      expect(() => LotConsumedPayloadSchema.parse(p)).toThrow();
    });

    it('reason over 500 chars → ZodError', () => {
      const p = basePayload();
      p.reason = 'x'.repeat(501);
      expect(() => LotConsumedPayloadSchema.parse(p)).toThrow();
    });
  });
});
