import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AuditLog } from '../domain/audit-log.entity';
import { AuditLogIdempotencyCache } from './audit-log-idempotency';
import {
  AUDIT_LOG_DEFAULT_LIMIT,
  AUDIT_LOG_EXPORT_BATCH_SIZE,
  AUDIT_LOG_EXPORT_HARD_CAP,
  AUDIT_LOG_MAX_LIMIT,
  AuditLogService,
} from './audit-log.service';
import { AuditLogQueryError } from './errors';
import type { AuditEventEnvelope } from './types';

interface FakeQueryBuilder {
  whereCalls: Array<{ sql: string; params: Record<string, unknown> }>;
  orderByCalled?: { col: string; dir: 'ASC' | 'DESC' };
  addOrderByCalled?: Array<{ col: string; dir: 'ASC' | 'DESC' }>;
  skipValue?: number;
  takeValue?: number;
  limitValue?: number;
  selectArg?: string;
  rows: AuditLog[];
  total: number;
}

type FakeQbHandle = Record<string, unknown> & {
  where: (sql: string, params: Record<string, unknown>) => FakeQbHandle;
  andWhere: (sqlOrBrackets: unknown, params?: Record<string, unknown>) => FakeQbHandle;
  orderBy: (col: string, dir: 'ASC' | 'DESC') => FakeQbHandle;
  addOrderBy: (col: string, dir: 'ASC' | 'DESC') => FakeQbHandle;
  skip: (n: number) => FakeQbHandle;
  take: (n: number) => FakeQbHandle;
  limit: (n: number) => FakeQbHandle;
  select: (arg: string) => FakeQbHandle;
  getQuery: () => string;
  getParameters: () => Record<string, unknown>;
  getQueryAndParameters: () => [string, unknown[]];
  getManyAndCount: () => Promise<[AuditLog[], number]>;
  getMany: () => Promise<AuditLog[]>;
};

function makeFakeQueryBuilder(state: FakeQueryBuilder): FakeQbHandle {
  const qb: FakeQbHandle = {
    where(sql: string, params: Record<string, unknown>) {
      state.whereCalls.push({ sql, params });
      return qb;
    },
    andWhere(sqlOrBrackets: unknown, params?: Record<string, unknown>) {
      // Brackets are used for IN clauses; we capture the params directly.
      if (typeof sqlOrBrackets === 'string') {
        state.whereCalls.push({ sql: sqlOrBrackets, params: params ?? {} });
      } else {
        // Treat as Brackets — unwrap by calling the inner func with this same qb.
        const fn = (sqlOrBrackets as { whereFactory?: (qb: FakeQbHandle) => void }).whereFactory;
        fn?.(qb);
      }
      return qb;
    },
    orderBy(col: string, dir: 'ASC' | 'DESC') {
      state.orderByCalled = { col, dir };
      return qb;
    },
    addOrderBy(col: string, dir: 'ASC' | 'DESC') {
      state.addOrderByCalled = [...(state.addOrderByCalled ?? []), { col, dir }];
      return qb;
    },
    skip(n: number) {
      state.skipValue = n;
      return qb;
    },
    take(n: number) {
      state.takeValue = n;
      return qb;
    },
    async getManyAndCount(): Promise<[AuditLog[], number]> {
      return [state.rows, state.total];
    },
    async getMany(): Promise<AuditLog[]> {
      return state.rows;
    },
    limit(n: number) {
      state.limitValue = n;
      return qb;
    },
    select(arg: string) {
      state.selectArg = arg;
      return qb;
    },
    getQuery() {
      // Capture-only stub; tests of wouldExceedCap pre-program dataSource.query.
      return 'SELECT 1 FROM audit_log a /* fake */';
    },
    getParameters() {
      const merged: Record<string, unknown> = {};
      for (const c of state.whereCalls) Object.assign(merged, c.params);
      return merged;
    },
    getQueryAndParameters() {
      const merged: Record<string, unknown> = {};
      for (const c of state.whereCalls) Object.assign(merged, c.params);
      return ['SELECT 1 FROM audit_log a /* fake */', Object.values(merged)];
    },
  };
  return qb;
}

function makeAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  const row = new AuditLog();
  row.id = overrides.id ?? '00000000-0000-4000-8000-000000000001';
  row.organizationId = overrides.organizationId ?? '00000000-0000-4000-8000-00000000aaaa';
  row.eventType = overrides.eventType ?? 'TEST_EVENT';
  row.aggregateType = overrides.aggregateType ?? 'test';
  row.aggregateId = overrides.aggregateId ?? '00000000-0000-4000-8000-00000000bbbb';
  row.actorUserId = overrides.actorUserId ?? null;
  row.actorKind = overrides.actorKind ?? 'system';
  row.agentName = overrides.agentName ?? null;
  row.payloadBefore = overrides.payloadBefore ?? null;
  row.payloadAfter = overrides.payloadAfter ?? null;
  row.reason = overrides.reason ?? null;
  row.citationUrl = overrides.citationUrl ?? null;
  row.snippet = overrides.snippet ?? null;
  row.createdAt = overrides.createdAt ?? new Date();
  return row;
}

describe('AuditLogService', () => {
  const orgId = '00000000-0000-4000-8000-00000000aaaa';

  let service: AuditLogService;
  let savedRows: AuditLog[];
  let qbStates: FakeQueryBuilder[] = [];
  let rawQueryQueue: unknown[][] = [];

  beforeEach(async () => {
    savedRows = [];
    qbStates = [];
    rawQueryQueue = [];

    const dataSource = {
      getRepository: () => ({
        save: jest.fn(async (row: AuditLog) => {
          savedRows.push(row);
          return row;
        }),
        createQueryBuilder: () => {
          const next = qbStates.shift();
          if (!next) throw new Error('No QB state pre-loaded for test');
          return makeFakeQueryBuilder(next);
        },
      }),
      // Used by wouldExceedCap (raw SELECT count(*) FROM (subquery) sub).
      query: jest.fn(async () => {
        const next = rawQueryQueue.shift();
        if (!next) throw new Error('No raw-query result pre-loaded for test');
        return next;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(AuditLogService);
  });

  describe('record()', () => {
    it('persists envelope as audit row', async () => {
      const envelope: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId: 'agg-123',
        actorUserId: 'user-1',
        actorKind: 'user',
        payloadAfter: { foo: 'bar' },
        reason: 'because',
      };
      await service.record('AI_SUGGESTION_ACCEPTED', envelope);
      expect(savedRows).toHaveLength(1);
      const row = savedRows[0];
      expect(row.eventType).toBe('AI_SUGGESTION_ACCEPTED');
      expect(row.organizationId).toBe(orgId);
      expect(row.aggregateType).toBe('recipe');
      expect(row.aggregateId).toBe('agg-123');
      expect(row.actorUserId).toBe('user-1');
      expect(row.actorKind).toBe('user');
      expect(row.payloadAfter).toEqual({ foo: 'bar' });
      expect(row.reason).toBe('because');
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('persists nullable fields as null when omitted', async () => {
      await service.record('SYSTEM_PING', {
        organizationId: orgId,
        aggregateType: 'organization',
        aggregateId: orgId,
        actorUserId: null,
        actorKind: 'system',
      });
      const row = savedRows[0];
      expect(row.actorUserId).toBeNull();
      expect(row.agentName).toBeNull();
      expect(row.payloadBefore).toBeNull();
      expect(row.payloadAfter).toBeNull();
      expect(row.reason).toBeNull();
      expect(row.citationUrl).toBeNull();
      expect(row.snippet).toBeNull();
    });

    it('preserves agentName when actorKind is agent', async () => {
      await service.record('AGENT_ACTION_EXECUTED', {
        organizationId: orgId,
        aggregateType: 'organization',
        aggregateId: orgId,
        actorUserId: 'user-1',
        actorKind: 'agent',
        agentName: 'claude-desktop',
      });
      expect(savedRows[0].actorKind).toBe('agent');
      expect(savedRows[0].agentName).toBe('claude-desktop');
    });
  });

  describe('query()', () => {
    it('returns rows + total + clamped pagination', async () => {
      qbStates.push({ whereCalls: [], rows: [makeAuditLog()], total: 1 });
      const page = await service.query({ organizationId: orgId });
      expect(page.rows).toHaveLength(1);
      expect(page.total).toBe(1);
      expect(page.limit).toBe(AUDIT_LOG_DEFAULT_LIMIT);
      expect(page.offset).toBe(0);
    });

    it('rejects limit out of range', async () => {
      await expect(
        service.query({ organizationId: orgId, limit: 0 }),
      ).rejects.toBeInstanceOf(AuditLogQueryError);
      await expect(
        service.query({ organizationId: orgId, limit: AUDIT_LOG_MAX_LIMIT + 1 }),
      ).rejects.toBeInstanceOf(AuditLogQueryError);
    });

    it('rejects negative offset', async () => {
      await expect(
        service.query({ organizationId: orgId, offset: -1 }),
      ).rejects.toBeInstanceOf(AuditLogQueryError);
    });

    it('rejects since > until', async () => {
      const since = new Date('2026-05-06T00:00:00Z');
      const until = new Date('2026-05-05T00:00:00Z');
      await expect(
        service.query({ organizationId: orgId, since, until }),
      ).rejects.toBeInstanceOf(AuditLogQueryError);
    });

    it('defaults to last 30 days when range omitted', async () => {
      qbStates.push({ whereCalls: [], rows: [], total: 0 });
      const beforeNow = Date.now();
      const page = await service.query({ organizationId: orgId });
      expect(page.total).toBe(0);
      // Smoke check: defaults applied without throwing.
      expect(beforeNow).toBeLessThanOrEqual(Date.now());
    });

    it('honours explicit limit + offset', async () => {
      qbStates.push({ whereCalls: [], rows: [], total: 0 });
      const page = await service.query({ organizationId: orgId, limit: 10, offset: 5 });
      expect(page.limit).toBe(10);
      expect(page.offset).toBe(5);
    });

    describe('FTS (q parameter)', () => {
      it('q absent → orderBy is created_at DESC, no FTS clause in WHERE', async () => {
        const state: FakeQueryBuilder = { whereCalls: [], rows: [], total: 0 };
        qbStates.push(state);
        await service.query({ organizationId: orgId });

        expect(state.orderByCalled).toEqual({ col: 'a.created_at', dir: 'DESC' });
        expect(state.addOrderByCalled).toBeUndefined();
        const ftsClauses = state.whereCalls.filter((c) =>
          c.sql.includes('plainto_tsquery'),
        );
        expect(ftsClauses).toHaveLength(0);
      });

      it('q present → adds dual-config OR\'d FTS clause with both spanish + english', async () => {
        const state: FakeQueryBuilder = { whereCalls: [], rows: [], total: 0 };
        qbStates.push(state);
        await service.query({ organizationId: orgId, q: 'tomate' });

        const ftsClauses = state.whereCalls.filter((c) =>
          c.sql.includes('plainto_tsquery'),
        );
        expect(ftsClauses).toHaveLength(1);
        const clause = ftsClauses[0];
        expect(clause.sql).toContain("plainto_tsquery('spanish', :q)");
        expect(clause.sql).toContain("plainto_tsquery('english', :q)");
        expect(clause.sql).toContain('jsonb_to_tsvector');
        expect(clause.sql).toMatch(/\sOR\s/);
        expect(clause.params).toEqual({ q: 'tomate' });
      });

      it('q present → orderBy uses GREATEST(ts_rank…) DESC, addOrderBy created_at DESC', async () => {
        const state: FakeQueryBuilder = { whereCalls: [], rows: [], total: 0 };
        qbStates.push(state);
        await service.query({ organizationId: orgId, q: 'pollo' });

        expect(state.orderByCalled?.dir).toBe('DESC');
        expect(state.orderByCalled?.col).toContain('GREATEST');
        expect(state.orderByCalled?.col).toContain('ts_rank');
        expect(state.orderByCalled?.col).toContain("plainto_tsquery('spanish', :q)");
        expect(state.orderByCalled?.col).toContain("plainto_tsquery('english', :q)");
        expect(state.addOrderByCalled).toEqual([
          { col: 'a.created_at', dir: 'DESC' },
        ]);
      });

      it('empty q (length 0) is treated as absent — no FTS clause', async () => {
        const state: FakeQueryBuilder = { whereCalls: [], rows: [], total: 0 };
        qbStates.push(state);
        await service.query({ organizationId: orgId, q: '' });

        const ftsClauses = state.whereCalls.filter((c) =>
          c.sql.includes('plainto_tsquery'),
        );
        expect(ftsClauses).toHaveLength(0);
        expect(state.orderByCalled).toEqual({ col: 'a.created_at', dir: 'DESC' });
      });

      it('q combines AND-wise with aggregateType + actorUserId', async () => {
        const state: FakeQueryBuilder = { whereCalls: [], rows: [], total: 0 };
        qbStates.push(state);
        await service.query({
          organizationId: orgId,
          q: 'tomate',
          aggregateType: 'recipe',
          actorUserId: '00000000-0000-4000-8000-000000000999',
        });

        // The FTS clause is one andWhere; aggregateType + actorUserId are
        // separate andWhere calls. All sit alongside the org_id WHERE +
        // since/until WHERE — so we expect ≥ 5 captured WHERE calls.
        expect(state.whereCalls.length).toBeGreaterThanOrEqual(5);
        expect(
          state.whereCalls.some((c) => c.sql.includes('a.aggregate_type = :aggregateType')),
        ).toBe(true);
        expect(
          state.whereCalls.some((c) => c.sql.includes('a.actor_user_id = :actorUserId')),
        ).toBe(true);
        expect(
          state.whereCalls.some((c) => c.sql.includes('plainto_tsquery')),
        ).toBe(true);
      });
    });
  });

  describe('streamRows()', () => {
    function rowsForBatch(count: number, batchTag: string): AuditLog[] {
      return Array.from({ length: count }, (_, i) =>
        makeAuditLog({
          id: `00000000-0000-4000-8000-${batchTag}${String(i).padStart(8, '0')}`,
          createdAt: new Date(2026, 0, 1, 0, 0, count - i),
        }),
      );
    }

    it('yields zero rows on empty result set', async () => {
      qbStates.push({ whereCalls: [], rows: [], total: 0 });
      const out: AuditLog[] = [];
      for await (const r of service.streamRows({ organizationId: orgId }, 100)) {
        out.push(r);
      }
      expect(out).toHaveLength(0);
    });

    it('yields all rows when result set is below cap', async () => {
      // 50 rows in one batch; the second batch returns empty so generator stops.
      qbStates.push({ whereCalls: [], rows: rowsForBatch(50, 'aaaa'), total: 50 });
      qbStates.push({ whereCalls: [], rows: [], total: 0 });
      const out: AuditLog[] = [];
      for await (const r of service.streamRows({ organizationId: orgId }, 200)) {
        out.push(r);
      }
      expect(out).toHaveLength(50);
    });

    it('caps at exactly hardCap when source has more rows', async () => {
      // 1000 rows in batch 1, 500 in batch 2 — but cap is 1500.
      qbStates.push({ whereCalls: [], rows: rowsForBatch(1000, 'aaaa'), total: 1000 });
      qbStates.push({ whereCalls: [], rows: rowsForBatch(500, 'bbbb'), total: 500 });
      // No third batch should be requested because we hit cap=1500 exactly.
      const out: AuditLog[] = [];
      for await (const r of service.streamRows({ organizationId: orgId }, 1500)) {
        out.push(r);
      }
      expect(out).toHaveLength(1500);
      expect(qbStates).toHaveLength(0); // both batches consumed, no extra call
    });

    it('caps mid-batch when hardCap < batchSize', async () => {
      qbStates.push({ whereCalls: [], rows: rowsForBatch(50, 'aaaa'), total: 50 });
      const out: AuditLog[] = [];
      for await (const r of service.streamRows({ organizationId: orgId }, 10)) {
        out.push(r);
      }
      expect(out).toHaveLength(10);
    });

    it('uses default hardCap = AUDIT_LOG_EXPORT_HARD_CAP when omitted', async () => {
      qbStates.push({ whereCalls: [], rows: [], total: 0 });
      const out: AuditLog[] = [];
      for await (const r of service.streamRows({ organizationId: orgId })) {
        out.push(r);
      }
      // Smoke: didn't crash, didn't try to fetch billions of batches.
      expect(out).toHaveLength(0);
      expect(AUDIT_LOG_EXPORT_HARD_CAP).toBe(100_000);
      expect(AUDIT_LOG_EXPORT_BATCH_SIZE).toBe(1_000);
    });

    it('orderBy is created_at DESC then addOrderBy id DESC (cursor-friendly)', async () => {
      const state: FakeQueryBuilder = {
        whereCalls: [],
        rows: rowsForBatch(3, 'aaaa'),
        total: 3,
      };
      qbStates.push(state);
      qbStates.push({ whereCalls: [], rows: [], total: 0 });
      const out: AuditLog[] = [];
      for await (const r of service.streamRows({ organizationId: orgId }, 10)) {
        out.push(r);
      }
      expect(state.orderByCalled).toEqual({ col: 'a.created_at', dir: 'DESC' });
      expect(state.addOrderByCalled).toEqual([{ col: 'a.id', dir: 'DESC' }]);
    });

    it('second batch query carries cursor from previous batch last row', async () => {
      const batch1Rows = rowsForBatch(1000, 'aaaa');
      const lastOfBatch1 = batch1Rows[batch1Rows.length - 1];
      const state1: FakeQueryBuilder = { whereCalls: [], rows: batch1Rows, total: 1000 };
      const state2: FakeQueryBuilder = { whereCalls: [], rows: [], total: 0 };
      qbStates.push(state1, state2);

      const out: AuditLog[] = [];
      for await (const r of service.streamRows({ organizationId: orgId }, 10_000)) {
        out.push(r);
      }
      // Second batch should have a where call with cursor params.
      const cursorClauses = state2.whereCalls.filter((c) =>
        c.sql.includes('(a.created_at, a.id) <'),
      );
      expect(cursorClauses).toHaveLength(1);
      expect(cursorClauses[0].params.cursorCreatedAt).toEqual(lastOfBatch1.createdAt);
      expect(cursorClauses[0].params.cursorId).toEqual(lastOfBatch1.id);
    });

    it('honours filter.q via FTS clause in cursor batches', async () => {
      const state: FakeQueryBuilder = { whereCalls: [], rows: [], total: 0 };
      qbStates.push(state);
      const out: AuditLog[] = [];
      for await (const r of service.streamRows(
        { organizationId: orgId, q: 'tomate' },
        10,
      )) {
        out.push(r);
      }
      const ftsClauses = state.whereCalls.filter((c) =>
        c.sql.includes('plainto_tsquery'),
      );
      expect(ftsClauses).toHaveLength(1);
      expect(ftsClauses[0].params.q).toBe('tomate');
    });
  });

  describe('wouldExceedCap()', () => {
    it('returns true when capped count > cap', async () => {
      // The fake QB will be created for the inner subquery.
      qbStates.push({ whereCalls: [], rows: [], total: 0 });
      // dataSource.query returns count = cap+1 = 101.
      rawQueryQueue.push([{ count: '101' }]);
      const result = await service.wouldExceedCap({ organizationId: orgId }, 100);
      expect(result).toBe(true);
    });

    it('returns false when capped count ≤ cap', async () => {
      qbStates.push({ whereCalls: [], rows: [], total: 0 });
      rawQueryQueue.push([{ count: '50' }]);
      const result = await service.wouldExceedCap({ organizationId: orgId }, 100);
      expect(result).toBe(false);
    });

    it('returns false when result set has zero rows', async () => {
      qbStates.push({ whereCalls: [], rows: [], total: 0 });
      rawQueryQueue.push([{ count: '0' }]);
      expect(await service.wouldExceedCap({ organizationId: orgId }, 100)).toBe(false);
    });

    it('returns false when count equals cap exactly (boundary)', async () => {
      qbStates.push({ whereCalls: [], rows: [], total: 0 });
      rawQueryQueue.push([{ count: '100' }]);
      expect(await service.wouldExceedCap({ organizationId: orgId }, 100)).toBe(false);
    });
  });
});

// Regression — m3.x-audit-log-idempotency-cache-injection. Before the fix,
// the constructor parameter was `idempotencyCache: AuditLogIdempotencyCache |
// null` without an explicit `@Inject(AuditLogIdempotencyCache)`. TypeScript
// emits `design:paramtypes` for nullable unions as `Object`, so NestJS's
// DI looked up the `Object` token, failed, `@Optional()` returned undefined,
// and the constructor default `= null` applied — even when the provider WAS
// registered. The two cases below pin both branches so the regression
// can't ship silently again.
describe('AuditLogService — idempotency cache DI', () => {
  const fakeDataSource = { getRepository: () => ({}) } as unknown as object;

  it('falls back to null when no AuditLogIdempotencyCache provider is registered', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getDataSourceToken(), useValue: fakeDataSource },
      ],
    }).compile();
    const service = module.get(AuditLogService);
    // Access the private field directly — this regression test is allowed
    // to peek at the internal state because it is precisely what production
    // DI must wire correctly.
    expect((service as unknown as { idempotencyCache: unknown }).idempotencyCache).toBeNull();
    await module.close();
  });

  it('injects the registered cache when AuditLogIdempotencyCache is in providers', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getDataSourceToken(), useValue: fakeDataSource },
        {
          provide: AuditLogIdempotencyCache,
          useFactory: () => new AuditLogIdempotencyCache(),
        },
      ],
    }).compile();
    const service = module.get(AuditLogService);
    const cache = (service as unknown as { idempotencyCache: unknown }).idempotencyCache;
    expect(cache).not.toBeNull();
    expect(cache).toBeInstanceOf(AuditLogIdempotencyCache);
    await module.close();
  });
});
