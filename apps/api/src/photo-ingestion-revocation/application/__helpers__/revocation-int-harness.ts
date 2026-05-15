import { randomUUID } from 'node:crypto';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Location } from '../../../iam/domain/location.entity';
import { Organization } from '../../../iam/domain/organization.entity';
import { UserLocation } from '../../../iam/domain/user-location.entity';
import { User } from '../../../iam/domain/user.entity';
import { AuditLog } from '../../../audit-log/domain/audit-log.entity';
import { AuditLogIdempotencyCache } from '../../../audit-log/application/audit-log-idempotency';
import { AuditLogService } from '../../../audit-log/application/audit-log.service';
import { AuditLogSubscriber } from '../../../audit-log/application/audit-log.subscriber';
import { DownstreamRevocationRepository } from '../downstream-revocation.repository';
import { DownstreamRevocationSubscriber } from '../downstream-revocation.subscriber';

/**
 * INT harness for `m3.x-photo-ingest-revocation-int`. Extends the
 * audit-log harness pattern from H2a's `audit-log-int-harness.ts` to wire
 * the `DownstreamRevocationSubscriber` end-to-end alongside the audit-log
 * subscriber, then exposes seed helpers for the FK chain
 * (`organizations → users → photos → photo_ingestion_items → lots`).
 *
 * Why a sibling harness instead of reusing the audit-log one: this BC
 * needs its own subscriber + repository in the provider list AND the seed
 * helpers cross multiple BCs (lots, goods_receipts, photo_ingestion_items)
 * which the audit-log harness has no business knowing about.
 *
 * Per [[feedback_event_subscriber_int_specs]] (Hindsight memory):
 *  - `EventEmitterModule.forRoot()` alone is not enough; the subscriber
 *    class MUST also be in `providers`.
 *  - `await app.init()` is REQUIRED after `Test.createTestingModule().compile()`
 *    for @OnEvent decorators to wire.
 *  - `emitAsync()` (not `emit()`) so the spec resolves after the handler
 *    chain has settled.
 */
const ALL_ENTITIES = [Organization, User, Location, UserLocation, AuditLog];

export interface RevocationIntHarness {
  readonly app: TestingModule;
  readonly dataSource: DataSource;
  readonly emitter: EventEmitter2;
  readonly auditService: AuditLogService;

  /** TRUNCATE every table touched by these tests + clear the LRU cache. */
  truncate(): Promise<void>;

  /**
   * Emit on the bus and await fan-out. Resolves AFTER both subscribers
   * (audit-log + downstream-revocation) have settled.
   */
  emitAndWait(channel: string, payload: unknown): Promise<void>;

  /** Fetch audit_log rows for an organization, newest-first. */
  fetchAuditRows(orgId: string): Promise<AuditLog[]>;

  /** Insert organization. Idempotent on `id`. */
  seedOrg(opts?: { id?: string; name?: string }): Promise<string>;

  /** Insert location for org. Idempotent on `id`. */
  seedLocation(orgId: string, opts?: { id?: string }): Promise<string>;

  /** Insert user for org. Idempotent on `id`. */
  seedUser(orgId: string, opts?: { id?: string }): Promise<string>;

  /** Insert photo for org+user. Idempotent on `id`. */
  seedPhoto(
    orgId: string,
    uploadedByUserId: string,
    opts?: { id?: string },
  ): Promise<string>;

  /** Insert photo_ingestion_items row. Idempotent on `id`. */
  seedPhotoIngestionItem(
    orgId: string,
    photoId: string,
    opts?: { id?: string; kind?: 'invoice' | 'product'; status?: string },
  ): Promise<string>;

  /** Insert lot row with optional source_photo_ingestion_id. Idempotent on `id`. */
  seedLot(
    orgId: string,
    locationId: string,
    opts?: {
      id?: string;
      sourcePhotoIngestionId?: string | null;
      supplierId?: string | null;
    },
  ): Promise<string>;

  /** Fetch lot row by id (raw shape — only the fields we assert on). */
  fetchLotById(lotId: string): Promise<{
    id: string;
    organizationId: string;
    requiresReview: boolean;
    sourcePhotoIngestionId: string | null;
  } | null>;
}

export async function createRevocationIntHarness(): Promise<RevocationIntHarness> {
  // Mirror H2a harness: disable hash chain validation so seed envelopes
  // do not require chain bootstrapping. This BC's emits go through the
  // same AuditLogSubscriber and we only assert that rows persist, not
  // chain integrity.
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
      DownstreamRevocationRepository,
      DownstreamRevocationSubscriber,
    ],
  }).compile();

  // Mandatory per H2a discovery: @OnEvent decorators wire during
  // EventEmitterReadinessWatcher.onApplicationBootstrap, which only runs
  // on app.init(). Without this, both subscribers are inert.
  await app.init();

  const dataSource = app.get(DataSource);
  await dataSource.runMigrations();

  const emitter = app.get(EventEmitter2);
  const auditService = app.get(AuditLogService);
  const cache = app.get(AuditLogIdempotencyCache);

  const harness: RevocationIntHarness = {
    app,
    dataSource,
    emitter,
    auditService,

    async truncate(): Promise<void> {
      await dataSource.query(
        'TRUNCATE TABLE "audit_log","lots","goods_receipts","photo_ingestion_items","photos","user_locations","users","locations","organizations" RESTART IDENTITY CASCADE',
      );
      cache.clear();
    },

    async emitAndWait(channel: string, payload: unknown): Promise<void> {
      await emitter.emitAsync(channel, payload);
    },

    async fetchAuditRows(orgId: string): Promise<AuditLog[]> {
      const repo = dataSource.getRepository(AuditLog);
      return repo
        .createQueryBuilder('a')
        .where('a.organization_id = :orgId', { orgId })
        .orderBy('a.created_at', 'DESC')
        .addOrderBy('a.id', 'DESC')
        .getMany();
    },

    async seedOrg(opts = {}): Promise<string> {
      const id = opts.id ?? randomUUID();
      const name = opts.name ?? `int-org-${id.slice(0, 8)}`;
      await dataSource.query(
        `INSERT INTO "organizations"
           ("id", "name", "currency_code", "default_locale", "timezone")
         VALUES ($1, $2, 'EUR', 'es', 'Europe/Madrid')
         ON CONFLICT ("id") DO NOTHING`,
        [id, name],
      );
      return id;
    },

    async seedLocation(orgId, opts = {}): Promise<string> {
      const id = opts.id ?? randomUUID();
      await dataSource.query(
        `INSERT INTO "locations"
           ("id", "organization_id", "name", "address", "type")
         VALUES ($1, $2, $3, 'Calle Falsa 123', 'RESTAURANT')
         ON CONFLICT ("id") DO NOTHING`,
        [id, orgId, `int-loc-${id.slice(0, 8)}`],
      );
      return id;
    },

    async seedUser(orgId, opts = {}): Promise<string> {
      const id = opts.id ?? randomUUID();
      // Bcrypt-shaped placeholder: matches the `ck_users_password_hash_bcrypt`
      // CHECK constraint `^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$`. Not a real
      // verifiable hash — INT specs never authenticate.
      const fakeBcrypt =
        '$2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX012';
      await dataSource.query(
        `INSERT INTO "users"
           ("id", "organization_id", "email", "name", "role", "password_hash")
         VALUES ($1, $2, $3, $4, 'OWNER', $5)
         ON CONFLICT ("id") DO NOTHING`,
        [
          id,
          orgId,
          `int-${id.slice(0, 8)}@x.test`,
          `int-user-${id.slice(0, 8)}`,
          fakeBcrypt,
        ],
      );
      return id;
    },

    async seedPhoto(orgId, uploadedByUserId, opts = {}): Promise<string> {
      const id = opts.id ?? randomUUID();
      await dataSource.query(
        `INSERT INTO "photos"
           ("id","organization_id","s3_key","mime_type","byte_size","uploaded_by_user_id","retention_class")
         VALUES ($1, $2, $3, 'image/jpeg', 1024, $4, 'full_res_90d')
         ON CONFLICT ("id") DO NOTHING`,
        [id, orgId, `${orgId}/${id}.jpg`, uploadedByUserId],
      );
      return id;
    },

    async seedPhotoIngestionItem(orgId, photoId, opts = {}): Promise<string> {
      const id = opts.id ?? randomUUID();
      const kind = opts.kind ?? 'product';
      const status = opts.status ?? 'signed';
      await dataSource.query(
        `INSERT INTO "photo_ingestion_items"
           ("id","organization_id","photo_id","kind","status","model_version","prompt_version")
         VALUES ($1, $2, $3, $4, $5, 'm-int-1', 'p-int-1')
         ON CONFLICT ("id") DO NOTHING`,
        [id, orgId, photoId, kind, status],
      );
      return id;
    },

    async seedLot(orgId, locationId, opts = {}): Promise<string> {
      const id = opts.id ?? randomUUID();
      await dataSource.query(
        `INSERT INTO "lots"
           ("id","organization_id","location_id","supplier_id",
            "received_at","quantity_received","quantity_remaining",
            "unit","source_photo_ingestion_id")
         VALUES ($1, $2, $3, $4, now(), 10.0000, 10.0000, 'kg', $5)
         ON CONFLICT ("id") DO NOTHING`,
        [
          id,
          orgId,
          locationId,
          opts.supplierId ?? null,
          opts.sourcePhotoIngestionId ?? null,
        ],
      );
      return id;
    },

    async fetchLotById(lotId) {
      const rows: Array<{
        id: string;
        organization_id: string;
        requires_review: boolean;
        source_photo_ingestion_id: string | null;
      }> = await dataSource.query(
        `SELECT "id","organization_id","requires_review","source_photo_ingestion_id"
         FROM "lots" WHERE "id" = $1 LIMIT 1`,
        [lotId],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        organizationId: r.organization_id,
        requiresReview: r.requires_review,
        sourcePhotoIngestionId: r.source_photo_ingestion_id,
      };
    },
  };

  return harness;
}
