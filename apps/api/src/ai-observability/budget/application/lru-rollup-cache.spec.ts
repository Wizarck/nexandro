import { LruRollupCache } from './lru-rollup-cache';

describe('LruRollupCache', () => {
  describe('basic get/set', () => {
    it('returns undefined for absent key', () => {
      const lru = new LruRollupCache();
      expect(lru.get('absent')).toBeUndefined();
    });

    it('round-trips a snapshot', () => {
      const lru = new LruRollupCache();
      lru.set('org1:2026-05', {
        organizationId: 'org1',
        period: '2026-05',
        totalCostEur: 50,
        tierCrossedAt: {},
      });
      const got = lru.get('org1:2026-05');
      expect(got?.totalCostEur).toBe(50);
      expect(got?.organizationId).toBe('org1');
    });

    it('overwrites on duplicate set', () => {
      const lru = new LruRollupCache();
      lru.set('k', {
        organizationId: 'a',
        period: '2026-05',
        totalCostEur: 10,
        tierCrossedAt: {},
      });
      lru.set('k', {
        organizationId: 'a',
        period: '2026-05',
        totalCostEur: 20,
        tierCrossedAt: {},
      });
      expect(lru.get('k')?.totalCostEur).toBe(20);
      expect(lru.size()).toBe(1);
    });
  });

  describe('capacity eviction', () => {
    it('evicts oldest when capacity exceeded', () => {
      const lru = new LruRollupCache(2, 60_000);
      lru.set('a', { organizationId: 'a', period: 'p', totalCostEur: 1, tierCrossedAt: {} });
      lru.set('b', { organizationId: 'b', period: 'p', totalCostEur: 2, tierCrossedAt: {} });
      lru.set('c', { organizationId: 'c', period: 'p', totalCostEur: 3, tierCrossedAt: {} });
      expect(lru.get('a')).toBeUndefined();
      expect(lru.get('b')?.totalCostEur).toBe(2);
      expect(lru.get('c')?.totalCostEur).toBe(3);
    });

    it('recency-bump on get moves entry to tail', () => {
      const lru = new LruRollupCache(2, 60_000);
      lru.set('a', { organizationId: 'a', period: 'p', totalCostEur: 1, tierCrossedAt: {} });
      lru.set('b', { organizationId: 'b', period: 'p', totalCostEur: 2, tierCrossedAt: {} });
      // Touch 'a' → 'a' is now the most-recent; 'b' becomes the eviction candidate.
      lru.get('a');
      lru.set('c', { organizationId: 'c', period: 'p', totalCostEur: 3, tierCrossedAt: {} });
      expect(lru.get('a')?.totalCostEur).toBe(1);
      expect(lru.get('b')).toBeUndefined();
      expect(lru.get('c')?.totalCostEur).toBe(3);
    });
  });

  describe('TTL expiry', () => {
    it('expires entries after TTL', () => {
      jest.useFakeTimers();
      const lru = new LruRollupCache(10, 1000);
      lru.set('k', { organizationId: 'a', period: 'p', totalCostEur: 1, tierCrossedAt: {} });
      jest.advanceTimersByTime(999);
      expect(lru.get('k')?.totalCostEur).toBe(1);
      jest.advanceTimersByTime(2);
      // 1001 ms elapsed > TTL 1000 → evicted on read
      expect(lru.get('k')).toBeUndefined();
      jest.useRealTimers();
    });
  });

  describe('verifyEligible — check-and-insert dedup', () => {
    it('returns true for first call on absent key (and marks)', () => {
      const lru = new LruRollupCache();
      expect(lru.verifyEligible('once')).toBe(true);
    });

    it('returns false for second call on same key (still-present check fires first)', () => {
      const lru = new LruRollupCache();
      lru.verifyEligible('once');
      expect(lru.verifyEligible('once')).toBe(false);
    });

    it('check-and-insert order: existing key always returns false before missing-key path', () => {
      // This is the Wave 2.3 #136 lesson: the still-present check must
      // happen FIRST so we never spuriously double-emit when LRU eviction
      // would otherwise make the key appear missing.
      const lru = new LruRollupCache();
      lru.set('preexisting', {
        organizationId: 'a',
        period: 'p',
        totalCostEur: 10,
        tierCrossedAt: {},
      });
      // verifyEligible sees the pre-existing entry — still-present check
      // returns false WITHOUT touching the missing-key path.
      expect(lru.verifyEligible('preexisting')).toBe(false);
      // And the original entry is untouched (not overwritten by the sentinel).
      expect(lru.get('preexisting')?.totalCostEur).toBe(10);
    });
  });

  describe('clear', () => {
    it('empties the cache', () => {
      const lru = new LruRollupCache();
      lru.set('k', { organizationId: 'a', period: 'p', totalCostEur: 1, tierCrossedAt: {} });
      lru.clear();
      expect(lru.size()).toBe(0);
      expect(lru.get('k')).toBeUndefined();
    });
  });

  describe('buildKey', () => {
    it('produces a canonical composite key', () => {
      const lru = new LruRollupCache();
      expect(lru.buildKey('orgA', '2026-05')).toBe('orgA:2026-05');
    });
  });
});
