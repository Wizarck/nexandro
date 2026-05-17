import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PHOTO_DELETED_CHANNEL,
} from '../domain/events';
import { Photo, PhotoRetentionClass } from '../domain/photo.entity';
import { PhotoRetentionScheduler } from './photo-retention.scheduler';
import {
  PHOTO_S3_CLIENT,
  PHOTO_STORAGE_CONFIG,
  PhotoS3Client,
  PhotoStorageConfig,
  PhotoStorageService,
} from './photo-storage.service';
import { PhotoRepository } from './photo.repository';

const ORG_A = '00000000-0000-4000-8000-00000000aaa1';
const USER = '00000000-0000-4000-8000-00000000c001';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function buildPhoto(overrides: Partial<Photo> = {}): Photo {
  const p = new Photo();
  p.id = overrides.id ?? randomUUID();
  p.organizationId = overrides.organizationId ?? ORG_A;
  p.s3Key = overrides.s3Key ?? `org/${p.organizationId}/photos/${p.id}.jpg`;
  p.mimeType = overrides.mimeType ?? 'image/jpeg';
  p.byteSize = overrides.byteSize ?? 1024;
  p.uploadedByUserId = overrides.uploadedByUserId ?? USER;
  p.retentionClass = overrides.retentionClass ?? 'full_res_90d';
  p.deletedAt = overrides.deletedAt ?? null;
  p.createdAt = overrides.createdAt ?? new Date();
  p.updatedAt = overrides.updatedAt ?? new Date();
  return p;
}

interface Harness {
  scheduler: PhotoRetentionScheduler;
  store: Map<string, Photo>;
  s3Store: Map<string, { byteSize: number }>;
  emitted: Array<{ channel: string; payload: unknown }>;
  s3DeleteCalls: string[];
}

async function makeHarness(): Promise<Harness> {
  const store = new Map<string, Photo>();
  const s3Store = new Map<string, { byteSize: number }>();
  const emitted: Array<{ channel: string; payload: unknown }> = [];
  const s3DeleteCalls: string[] = [];

  const repo: Partial<PhotoRepository> = {
    findById: jest.fn(async (org: string, id: string) => {
      const row = store.get(id);
      if (row === undefined || row.organizationId !== org) return null;
      return row;
    }),
    save: jest.fn(async (photo: Photo) => {
      store.set(photo.id, photo);
      return photo;
    }),
    softDelete: jest.fn(async (id: string, deletedAt: Date) => {
      const row = store.get(id);
      if (row !== undefined) {
        row.deletedAt = deletedAt;
        row.updatedAt = deletedAt;
      }
    }),
    hardDelete: jest.fn(async (id: string) => {
      const row = store.get(id);
      if (row === undefined) return;
      if (row.deletedAt === null) {
        throw new Error('hardDelete called on active row');
      }
      store.delete(id);
    }),
    findCandidatesForSoftDelete: jest.fn(
      async (
        beforeCreatedAt: Date,
        batchSize: number,
        retentionClass: PhotoRetentionClass = 'full_res_90d',
      ) => {
        const matches = Array.from(store.values()).filter(
          (p) =>
            p.retentionClass === retentionClass &&
            p.deletedAt === null &&
            p.createdAt.getTime() < beforeCreatedAt.getTime(),
        );
        return matches.slice(0, batchSize);
      },
    ),
    findCandidatesForHardDelete: jest.fn(
      async (beforeDeletedAt: Date, batchSize: number) => {
        const matches = Array.from(store.values()).filter(
          (p) =>
            p.deletedAt !== null &&
            p.deletedAt.getTime() < beforeDeletedAt.getTime(),
        );
        return matches.slice(0, batchSize);
      },
    ),
  };

  const events: Partial<EventEmitter2> = {
    emitAsync: jest.fn(async (channel: string, payload: unknown) => {
      emitted.push({ channel, payload });
      return [];
    }) as unknown as EventEmitter2['emitAsync'],
  };

  const config: PhotoStorageConfig = {
    endpoint: 'minio.local:9000',
    bucket: 'nexandro-photos-test',
    region: 'us-east-1',
    accessKeyId: 'AK',
    secretAccessKey: 'SK',
    scheme: 'http',
  };

  const s3: PhotoS3Client = {
    headObject: jest.fn(async (objectKey: string) => {
      return s3Store.get(objectKey) ?? null;
    }),
    deleteObject: jest.fn(async (objectKey: string) => {
      s3DeleteCalls.push(objectKey);
      s3Store.delete(objectKey);
    }),
  };

  const mod: TestingModule = await Test.createTestingModule({
    providers: [
      {
        provide: PhotoStorageService,
        useFactory: (
          r: PhotoRepository,
          e: EventEmitter2,
          c: PhotoStorageConfig,
          c2: PhotoS3Client,
        ): PhotoStorageService => new PhotoStorageService(r, e, c, c2),
        inject: [PhotoRepository, EventEmitter2, PHOTO_STORAGE_CONFIG, PHOTO_S3_CLIENT],
      },
      PhotoRetentionScheduler,
      { provide: PhotoRepository, useValue: repo },
      { provide: EventEmitter2, useValue: events },
      { provide: PHOTO_STORAGE_CONFIG, useValue: config },
      { provide: PHOTO_S3_CLIENT, useValue: s3 },
    ],
  }).compile();

  return {
    scheduler: mod.get(PhotoRetentionScheduler),
    store,
    s3Store,
    emitted,
    s3DeleteCalls,
  };
}

describe('PhotoRetentionScheduler', () => {
  const ORIG_ENV = process.env.NEXANDRO_PHOTO_RETENTION_ENABLED;

  beforeEach(() => {
    process.env.NEXANDRO_PHOTO_RETENTION_ENABLED = 'true';
  });

  afterAll(() => {
    if (ORIG_ENV === undefined) {
      delete process.env.NEXANDRO_PHOTO_RETENTION_ENABLED;
    } else {
      process.env.NEXANDRO_PHOTO_RETENTION_ENABLED = ORIG_ENV;
    }
  });

  describe('runPhase1SoftDelete', () => {
    it('soft-deletes 91-day-old full_res_90d photo + emits PHOTO_DELETED', async () => {
      const h = await makeHarness();
      const now = new Date('2026-05-14T03:00:00.000Z');
      const old = buildPhoto({
        organizationId: ORG_A,
        retentionClass: 'full_res_90d',
        createdAt: new Date(now.getTime() - 91 * MS_PER_DAY),
      });
      h.store.set(old.id, old);

      await h.scheduler.runPhase1SoftDelete(now);

      expect(h.store.get(old.id)?.deletedAt).toEqual(now);
      expect(h.emitted).toHaveLength(1);
      expect(h.emitted[0].channel).toBe(PHOTO_DELETED_CHANNEL);
      const env = h.emitted[0].payload as {
        payloadAfter: { reason: string };
      };
      expect(env.payloadAfter.reason).toBe('retention_90d');
      // Critically: S3 object NOT deleted in Phase 1
      expect(h.s3DeleteCalls).toHaveLength(0);
    });

    it('does NOT soft-delete a 89-day-old photo (within window)', async () => {
      const h = await makeHarness();
      const now = new Date('2026-05-14T03:00:00.000Z');
      const recent = buildPhoto({
        organizationId: ORG_A,
        createdAt: new Date(now.getTime() - 89 * MS_PER_DAY),
      });
      h.store.set(recent.id, recent);

      await h.scheduler.runPhase1SoftDelete(now);

      expect(h.store.get(recent.id)?.deletedAt).toBeNull();
      expect(h.emitted).toHaveLength(0);
    });

    it('skips thumbnail_indefinite photos regardless of age', async () => {
      const h = await makeHarness();
      const now = new Date('2026-05-14T03:00:00.000Z');
      const thumb = buildPhoto({
        organizationId: ORG_A,
        retentionClass: 'thumbnail_indefinite',
        createdAt: new Date(now.getTime() - 5 * 365 * MS_PER_DAY),
      });
      h.store.set(thumb.id, thumb);

      await h.scheduler.runPhase1SoftDelete(now);

      expect(h.store.get(thumb.id)?.deletedAt).toBeNull();
      expect(h.emitted).toHaveLength(0);
    });

    it('skips legal_hold photos regardless of age', async () => {
      const h = await makeHarness();
      const now = new Date('2026-05-14T03:00:00.000Z');
      const legal = buildPhoto({
        organizationId: ORG_A,
        retentionClass: 'legal_hold',
        createdAt: new Date(now.getTime() - 100 * 365 * MS_PER_DAY),
      });
      h.store.set(legal.id, legal);

      await h.scheduler.runPhase1SoftDelete(now);

      expect(h.store.get(legal.id)?.deletedAt).toBeNull();
      expect(h.emitted).toHaveLength(0);
    });
  });

  describe('runPhase2HardDelete', () => {
    it('hard-deletes 8-day-old soft-deleted photo + calls S3 DELETE', async () => {
      const h = await makeHarness();
      const now = new Date('2026-05-14T03:00:00.000Z');
      const old = buildPhoto({
        organizationId: ORG_A,
        deletedAt: new Date(now.getTime() - 8 * MS_PER_DAY),
      });
      h.store.set(old.id, old);
      h.s3Store.set(old.s3Key, { byteSize: 1024 });

      await h.scheduler.runPhase2HardDelete(now);

      expect(h.store.get(old.id)).toBeUndefined();
      expect(h.s3DeleteCalls).toEqual([old.s3Key]);
      // No additional event from Phase 2 (REQ + design)
      expect(h.emitted).toHaveLength(0);
    });

    it('does NOT hard-delete a 6-day-old soft-deleted photo (within grace)', async () => {
      const h = await makeHarness();
      const now = new Date('2026-05-14T03:00:00.000Z');
      const recent = buildPhoto({
        organizationId: ORG_A,
        deletedAt: new Date(now.getTime() - 6 * MS_PER_DAY),
      });
      h.store.set(recent.id, recent);

      await h.scheduler.runPhase2HardDelete(now);

      expect(h.store.get(recent.id)).toBeDefined();
      expect(h.s3DeleteCalls).toHaveLength(0);
    });
  });

  describe('runRetention (end-to-end)', () => {
    it('Phase 1 first, then Phase 2', async () => {
      const h = await makeHarness();
      const now = new Date('2026-05-14T03:00:00.000Z');

      // Candidate for Phase 1: 95-day-old active
      const phase1 = buildPhoto({
        organizationId: ORG_A,
        createdAt: new Date(now.getTime() - 95 * MS_PER_DAY),
      });
      h.store.set(phase1.id, phase1);

      // Candidate for Phase 2: 10-day-old soft-deleted
      const phase2 = buildPhoto({
        organizationId: ORG_A,
        deletedAt: new Date(now.getTime() - 10 * MS_PER_DAY),
      });
      h.store.set(phase2.id, phase2);
      h.s3Store.set(phase2.s3Key, { byteSize: 2048 });

      await h.scheduler.runRetention(now);

      // Phase 1 effect: phase1 now soft-deleted
      expect(h.store.get(phase1.id)?.deletedAt).toEqual(now);
      // Phase 2 effect: phase2 hard-deleted
      expect(h.store.get(phase2.id)).toBeUndefined();
      expect(h.s3DeleteCalls).toEqual([phase2.s3Key]);
    });

    it('is idempotent — second run on the same input is a no-op', async () => {
      const h = await makeHarness();
      const now = new Date('2026-05-14T03:00:00.000Z');
      const old = buildPhoto({
        organizationId: ORG_A,
        createdAt: new Date(now.getTime() - 95 * MS_PER_DAY),
      });
      h.store.set(old.id, old);

      await h.scheduler.runRetention(now);
      const eventsAfterFirst = h.emitted.length;
      await h.scheduler.runRetention(now);
      // Second run yields no new soft-delete event (already deleted_at set)
      expect(h.emitted.length).toBe(eventsAfterFirst);
    });
  });

  describe('runTick (cron entry)', () => {
    it('short-circuits when env flag is off', async () => {
      const h = await makeHarness();
      process.env.NEXANDRO_PHOTO_RETENTION_ENABLED = 'false';
      const old = buildPhoto({
        organizationId: ORG_A,
        createdAt: new Date(Date.now() - 95 * MS_PER_DAY),
      });
      h.store.set(old.id, old);

      await h.scheduler.runTick();

      expect(h.store.get(old.id)?.deletedAt).toBeNull();
      expect(h.emitted).toHaveLength(0);
    });
  });
});
