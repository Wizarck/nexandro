import { Injectable } from '@nestjs/common';

/**
 * Snapshot of a rollup aggregate cached for outage fallback. Mirrors the
 * fields the `BudgetTierService.evaluate()` consumes; we deliberately do
 * NOT cache the full `AiUsageRollup` entity because the cache MUST be a
 * read-side-only fallback (writes always go through Postgres first).
 */
export interface RollupSnapshot {
  organizationId: string;
  period: string;
  totalCostEur: number;
  /** Already-crossed tiers at the time of the cached snapshot. */
  tierCrossedAt: Record<string, string>;
  /** Wall-clock timestamp when the snapshot was cached. */
  cachedAt: number;
}

const DEFAULT_CAPACITY = 1024;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * Process-local LRU cache for the last successful rollup aggregate per
 * `(organizationId, period_yyyy_mm)` key. Per design.md ADR-LRU-CACHE-
 * FALLBACK: 1 K orgs × 1 h TTL.
 *
 * Implementation: native `Map` exploits guaranteed insertion-order
 * iteration in modern JS engines. On every `get(key)`, the entry is
 * deleted + re-inserted so the most-recently-accessed entry moves to the
 * tail of the iteration order; the head is the eviction candidate. This
 * avoids pulling in the `lru-cache` npm dependency (already absent from
 * `apps/api/package.json`).
 *
 * `verifyEligible(key)` is the check-and-insert dedup gate (Wave 2.3 #136
 * lesson): the still-present-key check runs BEFORE the missing-key path so
 * the LRU eviction race is impossible.
 */
@Injectable()
export class LruRollupCache {
  private readonly capacity: number;
  private readonly ttlMs: number;
  private readonly store = new Map<string, RollupSnapshot>();

  constructor(capacity: number = DEFAULT_CAPACITY, ttlMs: number = DEFAULT_TTL_MS) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
  }

  /**
   * Build the canonical key form. Centralised so future shape changes are
   * one-place edits + the scheduler + spec tests use the same key.
   */
  buildKey(organizationId: string, period: string): string {
    return `${organizationId}:${period}`;
  }

  /**
   * Lookup with TTL + LRU-recency update. Returns undefined when:
   *  - key absent
   *  - key expired (TTL elapsed) — entry is deleted on read
   */
  get(key: string): RollupSnapshot | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) return undefined;

    const now = Date.now();
    if (now - entry.cachedAt > this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }

    // Recency bump: delete + re-insert moves entry to tail of iteration order.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }

  /**
   * Insert / replace. On overflow, evicts the LRU head until size <= capacity.
   * `cachedAt` is stamped at insertion time so the TTL is from the most
   * recent successful tick, not from the org's first observation.
   */
  set(key: string, value: Omit<RollupSnapshot, 'cachedAt'>): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, { ...value, cachedAt: Date.now() });

    // Cap-bounded eviction: pop oldest until size === capacity.
    while (this.store.size > this.capacity) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
  }

  /**
   * Check-and-insert dedup gate per Wave 2.3 #136 lesson + design.md
   * ADR-LRU-CACHE-FALLBACK. Verifies the still-present key FIRST (catches
   * the not-yet-evicted case), then falls into the missing-key path.
   * Returns `true` when the caller may proceed (key was absent), `false`
   * when the caller should short-circuit (key was already present).
   *
   * This method is intended for non-aggregate dedup keys (e.g. tracking
   * "did we already log the fallback warning for this org+period this
   * tick?"). The aggregate `get/set` API is the primary surface; this is
   * a defensive utility.
   */
  verifyEligible(key: string): boolean {
    // Check FIRST — order matters per #136 lesson.
    const existing = this.store.get(key);
    if (existing !== undefined) {
      // Still present (not evicted). Already seen this tick — skip.
      return false;
    }
    // Now-confirmed missing path. Mark as seen with a sentinel snapshot.
    this.store.set(key, {
      organizationId: '',
      period: '',
      totalCostEur: 0,
      tierCrossedAt: {},
      cachedAt: Date.now(),
    });
    return true;
  }

  /** For tests + observability. */
  size(): number {
    return this.store.size;
  }

  /** For tests — resets the store. */
  clear(): void {
    this.store.clear();
  }
}
