import { gunzipSync } from 'node:zlib';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DataSource } from 'typeorm';
import { AuditLogArchivalScanner } from './audit-log-archival.scanner';
import type { AuditArchiveStorage } from './audit-archive-storage';
import { AuditEventType, AUDIT_RETENTION_DAYS } from '../application/types';

type Query = (sql: string, params?: unknown[]) => Promise<unknown>;

function fakeDataSource(handlers: Query[]): {
  ds: Pick<DataSource, 'query'>;
  calls: Array<{ sql: string; params?: unknown[] }>;
} {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let i = 0;
  const ds: Pick<DataSource, 'query'> = {
    query: (async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      const handler = handlers[i++] ?? (async () => []);
      return handler(sql, params);
    }) as unknown as DataSource['query'],
  };
  return { ds, calls };
}

function makeStorage(): {
  storage: AuditArchiveStorage;
  writes: Array<{
    organizationId: string;
    yearMonth: string;
    gzippedLines: Buffer;
  }>;
  setBehaviour: (
    fn: (
      organizationId: string,
      yearMonth: string,
      gzippedLines: Buffer,
    ) => Promise<{ path: string; bytes: number }>,
  ) => void;
} {
  const writes: Array<{
    organizationId: string;
    yearMonth: string;
    gzippedLines: Buffer;
  }> = [];
  let behaviour: AuditArchiveStorage['write'] = async (
    _o,
    ym,
    gz,
  ) => ({ path: `/archive/${ym}.gz`, bytes: gz.length });
  const storage: AuditArchiveStorage = {
    write: async (organizationId, yearMonth, gzippedLines) => {
      writes.push({ organizationId, yearMonth, gzippedLines });
      return behaviour(organizationId, yearMonth, gzippedLines);
    },
  };
  return {
    storage,
    writes,
    setBehaviour: (fn) => {
      behaviour = fn;
    },
  };
}

function makeEvents(): {
  events: EventEmitter2;
  emitted: Array<{ event: string; envelope: unknown }>;
} {
  const events = new EventEmitter2();
  const emitted: Array<{ event: string; envelope: unknown }> = [];
  events.onAny((event, envelope) => {
    emitted.push({ event: String(event), envelope });
  });
  return { events, emitted };
}

describe('AuditLogArchivalScanner', () => {
  let prevEnv: string | undefined;

  beforeEach(() => {
    prevEnv = process.env.OPENTRATTOS_AUDIT_LOG_ARCHIVAL_ENABLED;
  });

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env.OPENTRATTOS_AUDIT_LOG_ARCHIVAL_ENABLED;
    } else {
      process.env.OPENTRATTOS_AUDIT_LOG_ARCHIVAL_ENABLED = prevEnv;
    }
  });

  it('env-disabled (no env) → no DB queries, no storage call, no emit', async () => {
    delete process.env.OPENTRATTOS_AUDIT_LOG_ARCHIVAL_ENABLED;
    const { ds, calls } = fakeDataSource([]);
    const { storage, writes } = makeStorage();
    const { events, emitted } = makeEvents();

    const scanner = new AuditLogArchivalScanner(
      ds as unknown as DataSource,
      events,
      storage,
    );
    await scanner.runTick();

    expect(calls).toEqual([]);
    expect(writes).toEqual([]);
    expect(emitted).toEqual([]);
  });

  it('env-disabled (value=false) → no DB queries', async () => {
    process.env.OPENTRATTOS_AUDIT_LOG_ARCHIVAL_ENABLED = 'false';
    const { ds, calls } = fakeDataSource([]);
    const { storage } = makeStorage();
    const { events } = makeEvents();

    const scanner = new AuditLogArchivalScanner(
      ds as unknown as DataSource,
      events,
      storage,
    );
    await scanner.runTick();

    expect(calls).toEqual([]);
  });

  it('env-enabled, no rows → no storage call, no delete, no emit', async () => {
    process.env.OPENTRATTOS_AUDIT_LOG_ARCHIVAL_ENABLED = 'true';
    // 3 bucket-queries (one per retention class) all return [].
    const { ds, calls } = fakeDataSource([
      async () => [],
      async () => [],
      async () => [],
    ]);
    const { storage, writes } = makeStorage();
    const { events, emitted } = makeEvents();

    const scanner = new AuditLogArchivalScanner(
      ds as unknown as DataSource,
      events,
      storage,
    );
    await scanner.runOnce();

    expect(calls).toHaveLength(3);
    expect(writes).toEqual([]);
    expect(emitted).toEqual([]);
  });

  it('SQL params match AUDIT_RETENTION_DAYS for each retention class', async () => {
    process.env.OPENTRATTOS_AUDIT_LOG_ARCHIVAL_ENABLED = 'true';
    const { ds, calls } = fakeDataSource([
      async () => [],
      async () => [],
      async () => [],
    ]);
    const { storage } = makeStorage();
    const { events } = makeEvents();

    const scanner = new AuditLogArchivalScanner(
      ds as unknown as DataSource,
      events,
      storage,
    );
    await scanner.runOnce();

    // Order is RETENTION_CLASSES order: regulatory, operational, ephemeral.
    expect(calls[0].params).toEqual([
      'regulatory',
      AUDIT_RETENTION_DAYS.regulatory,
    ]);
    expect(calls[1].params).toEqual([
      'operational',
      AUDIT_RETENTION_DAYS.operational,
    ]);
    expect(calls[2].params).toEqual([
      'ephemeral',
      AUDIT_RETENTION_DAYS.ephemeral,
    ]);
  });

  it('happy path: write succeeds → delete called AFTER write → emit fired', async () => {
    process.env.OPENTRATTOS_AUDIT_LOG_ARCHIVAL_ENABLED = 'true';
    const orgId = '11111111-1111-1111-1111-111111111111';
    const ids = ['aaa', 'bbb'];
    const rows = [
      { id: 'aaa', created_at: '2024-01-01T00:00:00Z', payload: 'first' },
      { id: 'bbb', created_at: '2024-01-02T00:00:00Z', payload: 'second' },
    ];
    // Sequence:
    //  [0] bucket-query regulatory → 1 bucket
    //  [1] row-fetch → rows
    //  [2] delete
    //  [3] bucket-query operational → []
    //  [4] bucket-query ephemeral → []
    const { ds, calls } = fakeDataSource([
      async () => [{ organization_id: orgId, ym: '2024-01', ids }],
      async () => rows,
      async () => [],
      async () => [],
      async () => [],
    ]);
    const { storage, writes } = makeStorage();
    const { events, emitted } = makeEvents();

    const scanner = new AuditLogArchivalScanner(
      ds as unknown as DataSource,
      events,
      storage,
    );
    await scanner.runOnce();

    // 1 write
    expect(writes).toHaveLength(1);
    expect(writes[0].organizationId).toBe(orgId);
    expect(writes[0].yearMonth).toBe('2024-01');
    // Gzip round-trips to the JSONL we produced.
    const restored = gunzipSync(writes[0].gzippedLines).toString('utf8');
    expect(restored).toBe(
      `${JSON.stringify(rows[0])}\n${JSON.stringify(rows[1])}`,
    );

    // The 3rd DataSource.query (calls[2]) is the DELETE — confirms
    // write-then-delete ordering.
    expect(calls[2].sql).toContain('DELETE FROM audit_log');
    expect(calls[2].params).toEqual([ids]);

    // Emit with envelope shape
    const archivalEmits = emitted.filter(
      (e) => e.event === AuditEventType.AUDIT_LOG_ARCHIVAL_BATCH,
    );
    expect(archivalEmits).toHaveLength(1);
    expect(archivalEmits[0].envelope).toMatchObject({
      organizationId: orgId,
      aggregateType: 'organization',
      aggregateId: orgId,
      actorUserId: null,
      actorKind: 'system',
      payloadAfter: {
        retentionClass: 'regulatory',
        yearMonth: '2024-01',
        rowCount: 2,
        bytes: writes[0].gzippedLines.length,
        path: '/archive/2024-01.gz',
      },
    });
  });

  it('storage.write throws → DELETE NOT called → no emit → rows preserved', async () => {
    process.env.OPENTRATTOS_AUDIT_LOG_ARCHIVAL_ENABLED = 'true';
    const orgId = '22222222-2222-2222-2222-222222222222';
    const ids = ['x'];
    const rows = [{ id: 'x', value: 1 }];
    const { ds, calls } = fakeDataSource([
      async () => [{ organization_id: orgId, ym: '2024-05', ids }],
      async () => rows,
      async () => [],
      async () => [],
    ]);
    const { storage, setBehaviour, writes } = makeStorage();
    setBehaviour(async () => {
      throw new Error('S3 putobject 503');
    });
    const { events, emitted } = makeEvents();

    const scanner = new AuditLogArchivalScanner(
      ds as unknown as DataSource,
      events,
      storage,
    );
    await scanner.runOnce();

    // write was attempted
    expect(writes).toHaveLength(1);
    // No DELETE statement — only bucket-query + row-fetch ran for this class,
    // then the next two bucket-queries (operational + ephemeral).
    const deleteCalls = calls.filter((c) => c.sql.includes('DELETE'));
    expect(deleteCalls).toEqual([]);
    // No emit
    const archivalEmits = emitted.filter(
      (e) => e.event === AuditEventType.AUDIT_LOG_ARCHIVAL_BATCH,
    );
    expect(archivalEmits).toEqual([]);
  });

  it('one bucket failing does NOT abort sibling buckets in the same class', async () => {
    process.env.OPENTRATTOS_AUDIT_LOG_ARCHIVAL_ENABLED = 'true';
    const orgA = '33333333-3333-3333-3333-333333333333';
    const orgB = '44444444-4444-4444-4444-444444444444';
    const idsA = ['a1'];
    const idsB = ['b1'];
    const { ds, calls } = fakeDataSource([
      async () => [
        { organization_id: orgA, ym: '2024-01', ids: idsA },
        { organization_id: orgB, ym: '2024-01', ids: idsB },
      ],
      async () => [{ id: 'a1' }], // row-fetch orgA
      async () => [{ id: 'b1' }], // row-fetch orgB
      async () => [], // delete orgB (orgA write failed, so no delete)
      async () => [],
      async () => [],
    ]);
    const { storage, setBehaviour, writes } = makeStorage();
    setBehaviour(async (org, ym, gz) => {
      if (org === orgA) throw new Error('orgA write failed');
      return { path: `/archive/${org}/${ym}.gz`, bytes: gz.length };
    });
    const { events, emitted } = makeEvents();

    const scanner = new AuditLogArchivalScanner(
      ds as unknown as DataSource,
      events,
      storage,
    );
    await scanner.runOnce();

    // both write attempts happened
    expect(writes).toHaveLength(2);
    // Exactly one DELETE (orgB)
    const deleteCalls = calls.filter((c) => c.sql.includes('DELETE'));
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].params).toEqual([idsB]);
    // Exactly one emit
    const archivalEmits = emitted.filter(
      (e) => e.event === AuditEventType.AUDIT_LOG_ARCHIVAL_BATCH,
    );
    expect(archivalEmits).toHaveLength(1);
  });

  it('bucket-query failure on one class → log + continue to next class', async () => {
    process.env.OPENTRATTOS_AUDIT_LOG_ARCHIVAL_ENABLED = 'true';
    const orgId = '55555555-5555-5555-5555-555555555555';
    const { ds, calls } = fakeDataSource([
      async () => {
        throw new Error('connection reset');
      },
      async () => [{ organization_id: orgId, ym: '2024-01', ids: ['op1'] }],
      async () => [{ id: 'op1' }],
      async () => [], // delete
      async () => [],
    ]);
    const { storage, writes } = makeStorage();
    const { events, emitted } = makeEvents();

    const scanner = new AuditLogArchivalScanner(
      ds as unknown as DataSource,
      events,
      storage,
    );
    await scanner.runOnce();

    expect(writes).toHaveLength(1);
    const archivalEmits = emitted.filter(
      (e) => e.event === AuditEventType.AUDIT_LOG_ARCHIVAL_BATCH,
    );
    expect(archivalEmits).toHaveLength(1);
    expect(calls).toHaveLength(5);
  });

  it('runTick swallows top-level errors so the cron worker does not die', async () => {
    process.env.OPENTRATTOS_AUDIT_LOG_ARCHIVAL_ENABLED = 'true';
    const ds: Pick<DataSource, 'query'> = {
      query: jest.fn().mockImplementation(() => {
        throw new Error('synchronous catastrophe');
      }) as unknown as DataSource['query'],
    };
    const { storage } = makeStorage();
    const { events } = makeEvents();

    const scanner = new AuditLogArchivalScanner(
      ds as unknown as DataSource,
      events,
      storage,
    );
    await expect(scanner.runTick()).resolves.toBeUndefined();
  });
});
