import { AuditLogIdempotencyCache } from './audit-log-idempotency';

describe('AuditLogIdempotencyCache', () => {
  it('returns false on first call and true on second call within TTL', () => {
    const cache = new AuditLogIdempotencyCache({ capacity: 100, ttlMs: 10_000 });
    expect(cache.shouldDedup('LOT_CONSUMED', 'lot-1', 'corr-1')).toBe(false);
    expect(cache.shouldDedup('LOT_CONSUMED', 'lot-1', 'corr-1')).toBe(true);
  });

  it('treats distinct correlation_ids as distinct events', () => {
    const cache = new AuditLogIdempotencyCache();
    expect(cache.shouldDedup('LOT_CONSUMED', 'lot-1', 'corr-A')).toBe(false);
    expect(cache.shouldDedup('LOT_CONSUMED', 'lot-1', 'corr-B')).toBe(false);
  });

  it('treats distinct event types as distinct keys', () => {
    const cache = new AuditLogIdempotencyCache();
    expect(cache.shouldDedup('LOT_CONSUMED', 'lot-1', 'corr-1')).toBe(false);
    expect(cache.shouldDedup('LOT_EXPIRY_NEAR', 'lot-1', 'corr-1')).toBe(false);
  });

  it('releases the slot after TTL expires', () => {
    let now = 1_000;
    const cache = new AuditLogIdempotencyCache({
      capacity: 100,
      ttlMs: 1_000,
      nowFn: () => now,
    });
    expect(cache.shouldDedup('E', 'A', 'k')).toBe(false);
    now = 1_500;
    expect(cache.shouldDedup('E', 'A', 'k')).toBe(true); // still within TTL
    now = 2_500;
    expect(cache.shouldDedup('E', 'A', 'k')).toBe(false); // TTL expired
  });

  it('evicts the oldest entry when at capacity', () => {
    const cache = new AuditLogIdempotencyCache({ capacity: 2, ttlMs: 10_000 });
    cache.shouldDedup('E', 'A', 'k1'); // size=1
    cache.shouldDedup('E', 'A', 'k2'); // size=2
    cache.shouldDedup('E', 'A', 'k3'); // evicts k1, size=2
    expect(cache.shouldDedup('E', 'A', 'k1')).toBe(false); // k1 was evicted
    // k2 should still be present
    expect(cache.shouldDedup('E', 'A', 'k2')).toBe(true);
  });

  it('payloadHash is stable for the same payload', () => {
    const cache = new AuditLogIdempotencyCache();
    const a = cache.payloadHash({ a: 1, b: 2 });
    const b = cache.payloadHash({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('payloadHash differs for different payloads', () => {
    const cache = new AuditLogIdempotencyCache();
    const a = cache.payloadHash({ a: 1 });
    const b = cache.payloadHash({ a: 2 });
    expect(a).not.toBe(b);
  });

  it('size() reflects current cache contents', () => {
    const cache = new AuditLogIdempotencyCache({ capacity: 10, ttlMs: 10_000 });
    expect(cache.size()).toBe(0);
    cache.shouldDedup('E', 'A', 'k1');
    expect(cache.size()).toBe(1);
    cache.shouldDedup('E', 'A', 'k2');
    expect(cache.size()).toBe(2);
  });
});
