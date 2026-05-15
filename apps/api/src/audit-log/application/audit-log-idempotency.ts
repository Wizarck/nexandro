import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Bounded in-process LRU cache that dedupes incoming `AuditEventEnvelope`
 * dispatches per ADR-IDEMPOTENT-EMIT-DEDUP (design.md of
 * m3-audit-log-hash-chain-hardening, slice #21 Wave 2.3).
 *
 * Key: `(eventType, aggregateId, correlationId ?? payloadHash)`.
 * Capacity: 10 000 entries.
 * TTL: 1 hour per entry.
 *
 * On a cache hit (second arrival within TTL), `shouldDedup()` returns
 * `true` and the subscriber skips persistence with a debug log marker.
 * Cache is per-process — restart clears state. The design accepts this
 * trade-off because the rate of true double-fire from EventEmitter2
 * retries is near zero in practice; the cache is defence-in-depth and
 * the hash chain catches duplicates that slip through (their `row_hash`
 * diverges from the recomputed value when the validator runs).
 */
const DEFAULT_CAPACITY = 10_000;
const DEFAULT_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  insertedAt: number;
}

@Injectable()
export class AuditLogIdempotencyCache {
  private readonly capacity: number;
  private readonly ttlMs: number;
  private readonly entries: Map<string, CacheEntry>;
  private readonly nowFn: () => number;

  constructor(opts?: {
    capacity?: number;
    ttlMs?: number;
    /** Test seam — production uses `Date.now()`. */
    nowFn?: () => number;
  }) {
    this.capacity = opts?.capacity ?? DEFAULT_CAPACITY;
    this.ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
    this.nowFn = opts?.nowFn ?? Date.now;
    this.entries = new Map<string, CacheEntry>();
  }

  /**
   * Returns `true` if the (eventType, aggregateId, key) tuple was seen
   * within the TTL — the caller should skip persistence. Returns
   * `false` on first sight, AND records the key in the cache so the next
   * call within TTL hits.
   *
   * `correlationId` is preferred as the dedup key; when absent, callers
   * pass `payloadHash` as the third coordinate. If both are absent, the
   * dedup is a per-(eventType, aggregateId) pair which is too coarse —
   * caller responsibility to compute at least the payload hash.
   */
  shouldDedup(
    eventType: string,
    aggregateId: string,
    keyPart: string | null | undefined,
  ): boolean {
    const key = `${eventType}::${aggregateId}::${keyPart ?? ''}`;
    const now = this.nowFn();
    // GC any expired entries we trip across on the hot path so the
    // capacity check below sees fresh state.
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      if (now - existing.insertedAt < this.ttlMs) {
        // Re-insert to refresh LRU position.
        this.entries.delete(key);
        this.entries.set(key, existing);
        return true;
      }
      // Expired — fall through to insert path.
      this.entries.delete(key);
    }
    // LRU eviction: drop the oldest if at capacity.
    if (this.entries.size >= this.capacity) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
    this.entries.set(key, { insertedAt: now });
    return false;
  }

  /** Compute a stable SHA-256 hex digest over a JSON-serialisable payload. */
  payloadHash(payload: unknown): string {
    const json = JSON.stringify(payload ?? null);
    return createHash('sha256').update(json, 'utf8').digest('hex');
  }

  /** Test-only inspector. */
  size(): number {
    return this.entries.size;
  }

  /**
   * Test-only reset. Drops every entry so each INT spec's `beforeEach`
   * truncate of `audit_log` is matched by a cache reset. Production has
   * no reason to call this — the LRU is process-lifetime and bounded by
   * capacity + TTL.
   */
  clear(): void {
    this.entries.clear();
  }
}
