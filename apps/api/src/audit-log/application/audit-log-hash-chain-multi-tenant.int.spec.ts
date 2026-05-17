import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Location } from '../../iam/domain/location.entity';
import { Organization } from '../../iam/domain/organization.entity';
import { User } from '../../iam/domain/user.entity';
import { UserLocation } from '../../iam/domain/user-location.entity';
import { AuditLog } from '../domain/audit-log.entity';
import { validateChainIntegrity } from './audit-log-hash-chain';
import { AuditLogIdempotencyCache } from './audit-log-idempotency';
import { AuditLogService } from './audit-log.service';
import { HashChainBrokenError } from './errors';
import { AuditEventEnvelope } from './types';

const ALL_ENTITIES = [Organization, User, Location, UserLocation, AuditLog];

/**
 * INT spec — H2b m3-audit-log-hash-chain-int-coverage.
 *
 * Asserts the hash chain's isolation boundaries:
 *  - AC-CHAIN-5  — corrupting org A does NOT block org B's next emit
 *                  (tenant-scoped lookback is the boundary)
 *  - AC-CHAIN-6a — interleaved per-aggregate emits within one org form one
 *                  continuous tenant chain that validates cleanly
 *  - AC-CHAIN-6b — tampering a lineage-A row blocks the next lineage-B
 *                  emit too (the chain IS tenant-scoped, NOT aggregate-scoped)
 *
 * The per-aggregate cases document the scope boundary chosen by slice #21
 * (see ADR-PER-AGGREGATE-PARTITIONING in this slice's design.md) so a
 * future contributor doesn't introduce a regression by assuming aggregate-
 * scoped sub-chaining.
 */
describe('AuditLog hash chain multi-tenant + per-aggregate (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let service: AuditLogService;
  let cache: AuditLogIdempotencyCache;

  const ORG_A = '55555555-5555-4555-8555-555555555555';
  const ORG_B = '66666666-6666-4666-8666-666666666666';
  const AGG_A = '77777777-7777-4777-8777-777777777777';
  const AGG_B = '88888888-8888-4888-8888-888888888888';

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url:
            process.env.DATABASE_URL ??
            'postgres://nexandro_test:nexandro_test@localhost:5433/nexandro_test',
          entities: ALL_ENTITIES,
          migrations: [`${__dirname}/../../migrations/*.{ts,js}`],
          migrationsTableName: 'nexandro_migrations',
          synchronize: false,
        }),
        TypeOrmModule.forFeature(ALL_ENTITIES),
      ],
      providers: [
        AuditLogService,
        {
          provide: AuditLogIdempotencyCache,
          useFactory: () => new AuditLogIdempotencyCache(),
        },
      ],
    }).compile();

    dataSource = app.get(DataSource);
    service = app.get(AuditLogService);
    cache = app.get(AuditLogIdempotencyCache);
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await app?.close();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "audit_log" RESTART IDENTITY CASCADE');
    // Reset the LRU between tests — see audit-log-hash-chain-integrity.int.spec.ts.
    cache.clear();
  });

  describe('AC-CHAIN-5 — multi-tenant chain isolation', () => {
    it('corrupting org A does NOT block org B; the broken side throws on its own next emit', async () => {
      // Seed org A and org B with 10 rows each.
      const orgAIds: string[] = [];
      const orgBIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const a = await service.record('LOT_CREATED', envelope(ORG_A, AGG_A, { idx: i }));
        const b = await service.record('LOT_CREATED', envelope(ORG_B, AGG_B, { idx: i }));
        orgAIds.push(a.id);
        orgBIds.push(b.id);
      }
      expect(await rowCountForOrg(dataSource, ORG_A)).toBe(10);
      expect(await rowCountForOrg(dataSource, ORG_B)).toBe(10);

      // Tamper org A row #5.
      await dataSource.query(
        `UPDATE "audit_log" SET "payload_after" = '{"tampered":true}'::jsonb WHERE "id" = $1`,
        [orgAIds[5]],
      );

      // Org B emit should succeed — the lookback filters by organization_id
      // so org A's corruption is invisible.
      const orgBNext = await service.record(
        'LOT_CREATED',
        envelope(ORG_B, AGG_B, { idx: 10 }),
      );
      expect(orgBNext.rowHash).not.toBeNull();
      expect(await rowCountForOrg(dataSource, ORG_B)).toBe(11);

      // Org A emit should throw — its own chain IS broken.
      let caught: unknown = null;
      try {
        await service.record('LOT_CREATED', envelope(ORG_A, AGG_A, { idx: 10 }));
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(HashChainBrokenError);
      if (caught instanceof HashChainBrokenError) {
        expect(caught.organizationId).toBe(ORG_A);
        expect(caught.firstBrokenRowId).toBe(orgAIds[5]);
      }

      // Org A still has 10 rows (the broken-chain emit was rejected).
      expect(await rowCountForOrg(dataSource, ORG_A)).toBe(10);
      // Org B is unaffected.
      expect(await rowCountForOrg(dataSource, ORG_B)).toBe(11);
    }, 30_000);
  });

  describe('AC-CHAIN-6a — per-aggregate happy path under one tenant', () => {
    it('interleaved lineage-A + lineage-B emits within one org form a valid tenant-wide chain', async () => {
      // Interleave 25 lineage-A + 25 lineage-B emits ordered by emit time
      // (the natural call order produces the natural created_at ordering).
      for (let i = 0; i < 25; i++) {
        await service.record(
          'LOT_CREATED',
          envelope(ORG_A, AGG_A, { lineage: 'A', idx: i }),
        );
        await service.record(
          'STOCK_MOVE_CREATED',
          envelope(ORG_A, AGG_B, { lineage: 'B', idx: i }),
        );
      }
      expect(await rowCountForOrg(dataSource, ORG_A)).toBe(50);

      // The full tenant chain validates end to end.
      const all = await fetchAllOrdered(dataSource, ORG_A);
      expect(all).toHaveLength(50);
      const result = validateChainIntegrity(all);
      expect(result.ok).toBe(true);
    }, 30_000);
  });

  describe('AC-CHAIN-6b — per-aggregate boundary (tenant-scoped, NOT aggregate-scoped)', () => {
    it('tampering a lineage-A row blocks the NEXT lineage-B emit too', async () => {
      const lineageAIds: string[] = [];
      // Same interleaved seed as AC-CHAIN-6a.
      for (let i = 0; i < 25; i++) {
        const a = await service.record(
          'LOT_CREATED',
          envelope(ORG_A, AGG_A, { lineage: 'A', idx: i }),
        );
        lineageAIds.push(a.id);
        await service.record(
          'STOCK_MOVE_CREATED',
          envelope(ORG_A, AGG_B, { lineage: 'B', idx: i }),
        );
      }
      expect(await rowCountForOrg(dataSource, ORG_A)).toBe(50);

      // Tamper one lineage-A row in the middle of the chain.
      const tamperTarget = lineageAIds[12]; // Lineage A row #12 (~mid-chain).
      await dataSource.query(
        `UPDATE "audit_log" SET "payload_after" = '{"tampered":true}'::jsonb WHERE "id" = $1`,
        [tamperTarget],
      );

      // Next lineage-B emit MUST throw — the lookback is tenant-wide, so a
      // tamper on ANY row in the lookback window blocks ANY subsequent
      // emit for the tenant regardless of which aggregate is being written.
      let caught: unknown = null;
      try {
        await service.record(
          'STOCK_MOVE_CREATED',
          envelope(ORG_A, AGG_B, { lineage: 'B', idx: 25 }),
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(HashChainBrokenError);
      if (caught instanceof HashChainBrokenError) {
        expect(caught.organizationId).toBe(ORG_A);
        expect(caught.firstBrokenRowId).toBe(tamperTarget);
      }

      // Row count unchanged.
      expect(await rowCountForOrg(dataSource, ORG_A)).toBe(50);
    }, 30_000);
  });
});

function envelope(
  organizationId: string,
  aggregateId: string,
  payloadAfter: Record<string, unknown>,
): AuditEventEnvelope {
  return {
    organizationId,
    aggregateType: 'lot',
    aggregateId,
    actorUserId: null,
    actorKind: 'system',
    payloadAfter,
  };
}

async function rowCountForOrg(ds: DataSource, organizationId: string): Promise<number> {
  const rows: Array<{ count: string }> = await ds.query(
    'SELECT count(*)::text AS count FROM "audit_log" WHERE "organization_id" = $1',
    [organizationId],
  );
  return Number.parseInt(rows[0]?.count ?? '0', 10);
}

async function fetchAllOrdered(ds: DataSource, organizationId: string): Promise<AuditLog[]> {
  return ds
    .getRepository(AuditLog)
    .createQueryBuilder('a')
    .where('a.organization_id = :orgId', { orgId: organizationId })
    .orderBy('a.created_at', 'ASC')
    .addOrderBy('a.id', 'ASC')
    .getMany();
}
