import { randomUUID } from 'node:crypto';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Location } from '../../../iam/domain/location.entity';
import { Organization } from '../../../iam/domain/organization.entity';
import { UserLocation } from '../../../iam/domain/user-location.entity';
import { User } from '../../../iam/domain/user.entity';
import { AuditLog } from '../../domain/audit-log.entity';
import { AuditLogIdempotencyCache } from '../audit-log-idempotency';
import { AuditLogService } from '../audit-log.service';
import { AuditLogSubscriber } from '../audit-log.subscriber';

const ALL_ENTITIES = [Organization, User, Location, UserLocation, AuditLog];

/**
 * Shared INT harness for the four `audit-log-subscriber-*.int.spec.ts`
 * specs introduced by m3-audit-log-subscriber-int-coverage (slice H2a).
 *
 * Why a harness instead of duplicating bootstrap per spec:
 *   1. Centralises the TypeOrm + EventEmitter wiring so future M4+
 *      subscribers can extend with one more spec instead of one more
 *      bootstrap.
 *   2. Owns the deterministic emit-and-read sequencing via
 *      `emitter.emitAsync()` + `await` — no `setTimeout` flake (per
 *      `feedback_event_subscriber_int_specs` Hindsight memory).
 *   3. Disables hash-chain validation for the scope of this slice so
 *      tests do NOT couple to sibling slice H2b's contract.
 *
 * Per the same Hindsight memory: registering `EventEmitterModule.forRoot()`
 * in `imports` is not enough — the subscriber class must also appear in
 * `providers` for its `@OnEvent` decorators to fire.
 */
export interface AuditLogIntHarness {
  readonly app: TestingModule;
  readonly dataSource: DataSource;
  readonly service: AuditLogService;
  readonly subscriber: AuditLogSubscriber;
  readonly cache: AuditLogIdempotencyCache;
  readonly emitter: EventEmitter2;

  /** TRUNCATE audit_log + organizations + clear LRU cache. Idempotent. */
  truncate(): Promise<void>;

  /**
   * Emit on the bus and await fan-out. Resolves AFTER the subscriber's
   * handler chain has settled (because `emitAsync` returns a promise that
   * resolves once every async handler has resolved).
   */
  emitAndWait(channel: string, payload: unknown): Promise<void>;

  /**
   * Fetch all rows for an organization, newest-first. Used by specs to
   * assert per-org persistence shape.
   */
  fetchRows(orgId: string): Promise<AuditLog[]>;

  /**
   * Insert a seed organization row. Returns the created UUID. Idempotent
   * — re-running with the same `id` is a no-op.
   */
  seedOrg(id?: string, name?: string): Promise<string>;

  /** Clear the LRU cache without rebuilding it. Used by `truncate()`. */
  clearCache(): void;
}

/**
 * Build a NestJS TestingModule with EventEmitter2 + TypeORM + the audit
 * log subscriber + the LRU idempotency cache. Runs migrations on first
 * boot. Callers MUST destroy the DataSource + close the module in their
 * `afterAll` block.
 *
 * `DATABASE_URL` env var overrides the default test Postgres URL
 * (port 5433 — matches existing INT spec convention).
 *
 * `AUDIT_LOG_HASH_CHAIN_ENABLED='false'` is set in-process so chain
 * validation does NOT trip on the legacy-style rows seeded by these
 * tests. Sibling slice H2b owns chain INT coverage.
 */
export async function createAuditLogIntHarness(): Promise<AuditLogIntHarness> {
  // Defensive: set BEFORE the service module loads in case a previous spec
  // file set it to 'true' (process-shared env).
  process.env.AUDIT_LOG_HASH_CHAIN_ENABLED = 'false';

  const app = await Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot({ wildcard: false, verboseMemoryLeak: false }),
      TypeOrmModule.forRoot({
        type: 'postgres',
        url:
          process.env.DATABASE_URL ??
          'postgres://opentrattos_test:opentrattos_test@localhost:5433/opentrattos_test',
        entities: ALL_ENTITIES,
        migrations: [`${__dirname}/../../../migrations/*.{ts,js}`],
        migrationsTableName: 'opentrattos_migrations',
        synchronize: false,
      }),
      TypeOrmModule.forFeature(ALL_ENTITIES),
    ],
    providers: [
      AuditLogService,
      AuditLogSubscriber,
      {
        provide: AuditLogIdempotencyCache,
        useFactory: () => new AuditLogIdempotencyCache(),
      },
    ],
  }).compile();

  const dataSource = app.get(DataSource);
  await dataSource.runMigrations();

  const service = app.get(AuditLogService);
  const subscriber = app.get(AuditLogSubscriber);
  const cache = app.get(AuditLogIdempotencyCache);
  const emitter = app.get(EventEmitter2);

  const harness: AuditLogIntHarness = {
    app,
    dataSource,
    service,
    subscriber,
    cache,
    emitter,

    async truncate(): Promise<void> {
      await dataSource.query(
        'TRUNCATE TABLE "audit_log" RESTART IDENTITY CASCADE',
      );
      await dataSource.query(
        'TRUNCATE TABLE "organizations" RESTART IDENTITY CASCADE',
      );
      harness.clearCache();
    },

    async emitAndWait(channel: string, payload: unknown): Promise<void> {
      await emitter.emitAsync(channel, payload);
    },

    async fetchRows(orgId: string): Promise<AuditLog[]> {
      const repo = dataSource.getRepository(AuditLog);
      return repo
        .createQueryBuilder('a')
        .where('a.organization_id = :orgId', { orgId })
        .orderBy('a.created_at', 'DESC')
        .addOrderBy('a.id', 'DESC')
        .getMany();
    },

    async seedOrg(id?: string, name?: string): Promise<string> {
      const orgId = id ?? randomUUID();
      const orgName = name ?? `int-org-${orgId.slice(0, 8)}`;
      await dataSource.query(
        `INSERT INTO "organizations"
           ("id", "name", "currency_code", "default_locale", "timezone")
         VALUES ($1, $2, 'EUR', 'es', 'Europe/Madrid')
         ON CONFLICT ("id") DO NOTHING`,
        [orgId, orgName],
      );
      return orgId;
    },

    clearCache(): void {
      // The cache stores entries in a private `entries` Map. Reset by
      // re-emitting via a TTL-expired key would be brittle; clear the Map
      // directly through the documented test-only surface.
      const entries = (cache as unknown as { entries: Map<string, unknown> })
        .entries;
      entries.clear();
    },
  };

  return harness;
}
