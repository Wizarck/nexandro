import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Location } from '../../iam/domain/location.entity';
import { Organization } from '../../iam/domain/organization.entity';
import { User } from '../../iam/domain/user.entity';
import { UserLocation } from '../../iam/domain/user-location.entity';
import { AuditLog } from '../domain/audit-log.entity';
import { AuditLogIdempotencyCache } from './audit-log-idempotency';
import { AuditLogService } from './audit-log.service';
import {
  AuditEventEnvelope,
  AuditEventTypeName,
  RETENTION_CLASSES,
  RetentionClass,
  computeRetentionClass,
} from './types';

const ALL_ENTITIES = [Organization, User, Location, UserLocation, AuditLog];

/**
 * INT spec — H2b m3-audit-log-hash-chain-int-coverage.
 *
 * Asserts the DB CHECK constraint `audit_log_retention_class_check` is the
 * source of truth for valid `retention_class` values, that the
 * `RETENTION_BY_EVENT_NAME` lookup never emits a value outside the CHECK
 * set, and that `record()` round-trips correctly for every event-type name.
 *
 * ACs covered (see spec.md):
 *  - AC-CHAIN-4   — unknown retention_class rejected with SQLSTATE 23514
 *  - AC-CHAIN-4b  — the three canonical values insert successfully
 *  - AC-CHAIN-4c  — every value in RETENTION_BY_EVENT_NAME round-trips
 *  - AC-CHAIN-4d  — drift surface: CHECK definition contains the three literals
 */
describe('AuditLog retention_class CHECK (integration)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let service: AuditLogService;
  let cache: AuditLogIdempotencyCache;

  const ORG = '33333333-3333-4333-8333-333333333333';
  const AGG_ID = '44444444-4444-4444-8444-444444444444';

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

  describe('AC-CHAIN-4 — unknown retention_class rejected', () => {
    it("raw INSERT with retention_class='foobar' fails with SQLSTATE 23514", async () => {
      let caught: { code?: string } | null = null;
      try {
        await dataSource.query(
          `INSERT INTO "audit_log" (
             "id", "organization_id", "event_type", "aggregate_type",
             "aggregate_id", "actor_kind", "created_at", "retention_class"
           ) VALUES ($1, $2, 'TEST', 'lot', $3, 'system', now(), 'foobar')`,
          [randomUUID(), ORG, AGG_ID],
        );
      } catch (err) {
        caught = err as { code?: string };
      }
      expect(caught).not.toBeNull();
      // SQLSTATE 23514 = check_violation
      expect(caught?.code).toBe('23514');

      // Verify no row landed.
      const rows: Array<{ count: string }> = await dataSource.query(
        `SELECT count(*)::text AS count FROM "audit_log" WHERE "retention_class" = 'foobar'`,
      );
      expect(Number.parseInt(rows[0]?.count ?? '0', 10)).toBe(0);
    });
  });

  describe('AC-CHAIN-4b — the three canonical values insert successfully', () => {
    it.each(RETENTION_CLASSES)('retention_class=%s inserts successfully', async (cls) => {
      const id = randomUUID();
      await dataSource.query(
        `INSERT INTO "audit_log" (
           "id", "organization_id", "event_type", "aggregate_type",
           "aggregate_id", "actor_kind", "created_at", "retention_class"
         ) VALUES ($1, $2, 'TEST', 'lot', $3, 'system', now(), $4)`,
        [id, ORG, AGG_ID, cls],
      );
      const rows: Array<{ retention_class: string }> = await dataSource.query(
        `SELECT "retention_class" FROM "audit_log" WHERE "id" = $1`,
        [id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].retention_class).toBe(cls);
    });
  });

  describe('AC-CHAIN-4c — every RETENTION_BY_EVENT_NAME value round-trips through record()', () => {
    it('each known event-type name lands the row with the lookup-derived retention_class', async () => {
      const eventTypeNames = Object.values(AuditEventTypeName);
      // De-dup since multiple bus channels may share an event-type name.
      const uniqueNames = Array.from(new Set(eventTypeNames));

      for (const name of uniqueNames) {
        const expected = computeRetentionClass(name);
        expect(RETENTION_CLASSES).toContain(expected);

        const env: AuditEventEnvelope = {
          organizationId: ORG,
          aggregateType: 'lot',
          aggregateId: AGG_ID,
          actorUserId: null,
          actorKind: 'system',
          payloadAfter: { name },
        };
        const persisted = await service.record(name, env);
        expect(persisted.retentionClass).toBe(expected);

        // Verify the row landed in the DB with the expected class.
        const rows: Array<{ retention_class: string }> = await dataSource.query(
          `SELECT "retention_class" FROM "audit_log" WHERE "id" = $1`,
          [persisted.id],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].retention_class).toBe(expected);
      }
    }, 60_000);

    it('unknown event-type name defaults to operational (proves the fallback path is also CHECK-valid)', async () => {
      const unknownName = 'NEVER_REGISTERED_EVENT_TYPE_FOR_TEST';
      const expected: RetentionClass = computeRetentionClass(unknownName);
      expect(expected).toBe('operational');

      const persisted = await service.record(unknownName, {
        organizationId: ORG,
        aggregateType: 'lot',
        aggregateId: AGG_ID,
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { marker: 'unknown' },
      });
      expect(persisted.retentionClass).toBe('operational');
    });
  });

  describe('AC-CHAIN-4d — drift surface', () => {
    it('audit_log_retention_class_check exists with the documented enum values', async () => {
      const rows: Array<{ definition: string }> = await dataSource.query(
        `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE conname = 'audit_log_retention_class_check'`,
      );
      expect(rows).toHaveLength(1);
      const def = rows[0].definition;
      // Definition shape varies by PG version (e.g. CHECK ((retention_class
      // = ANY (ARRAY['regulatory'::text, ...]))) but always literally contains
      // the three values). Assert presence of each literal rather than an
      // exact regex.
      expect(def).toContain("'regulatory'");
      expect(def).toContain("'operational'");
      expect(def).toContain("'ephemeral'");
    });

    it('RETENTION_BY_EVENT_NAME does not emit any value outside the CHECK set', () => {
      // Pure-fn drift check; no DB round-trip. Belt-and-braces vs AC-CHAIN-4c.
      const eventTypeNames = Object.values(AuditEventTypeName);
      const uniqueNames = Array.from(new Set(eventTypeNames));
      for (const name of uniqueNames) {
        expect(RETENTION_CLASSES).toContain(computeRetentionClass(name));
      }
    });
  });
});
