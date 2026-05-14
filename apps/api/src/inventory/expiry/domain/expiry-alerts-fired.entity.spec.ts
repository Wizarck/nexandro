import { randomUUID } from 'node:crypto';
import { ExpiryAlertsFired } from './expiry-alerts-fired.entity';

describe('ExpiryAlertsFired.create', () => {
  const baseProps = () => ({
    organizationId: randomUUID(),
    lotId: randomUUID(),
    alertBand: 't-24h' as const,
    expiresAtSnapshot: new Date('2026-05-15T08:00:00Z'),
  });

  it('constructs a valid row with generated UUID', () => {
    const row = ExpiryAlertsFired.create(baseProps());
    expect(row.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('defaults firedAt to now() when not provided', () => {
    const before = Date.now();
    const row = ExpiryAlertsFired.create(baseProps());
    const after = Date.now();
    expect(row.firedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(row.firedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('preserves an explicit firedAt', () => {
    const at = new Date('2026-05-14T12:00:00Z');
    const row = ExpiryAlertsFired.create({ ...baseProps(), firedAt: at });
    expect(row.firedAt).toEqual(at);
  });

  it('accepts both band literals', () => {
    const r72 = ExpiryAlertsFired.create({ ...baseProps(), alertBand: 't-72h' });
    const r24 = ExpiryAlertsFired.create({ ...baseProps(), alertBand: 't-24h' });
    expect(r72.alertBand).toBe('t-72h');
    expect(r24.alertBand).toBe('t-24h');
  });

  it('rejects an invalid band literal', () => {
    expect(() =>
      ExpiryAlertsFired.create({
        ...baseProps(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        alertBand: 't-7d' as any,
      }),
    ).toThrow(/Invalid alertBand/);
  });

  it('preserves expiresAtSnapshot exactly (no truncation)', () => {
    const ts = new Date('2026-05-15T08:01:02.345Z');
    const row = ExpiryAlertsFired.create({
      ...baseProps(),
      expiresAtSnapshot: ts,
    });
    expect(row.expiresAtSnapshot).toEqual(ts);
  });
});
