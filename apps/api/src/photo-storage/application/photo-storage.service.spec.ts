import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PhotoCrossTenantError,
  PhotoNotFoundError,
  PhotoUploadNotConfirmedError,
} from '../domain/errors';
import {
  PHOTO_DELETED_CHANNEL,
  PHOTO_UPLOADED_CHANNEL,
} from '../domain/events';
import { Photo } from '../domain/photo.entity';
import {
  PHOTO_S3_CLIENT,
  PHOTO_STORAGE_CONFIG,
  PhotoS3Client,
  PhotoStorageConfig,
  PhotoStorageService,
} from './photo-storage.service';
import { PhotoRepository } from './photo.repository';

const ORG_A = '00000000-0000-4000-8000-00000000aaa1';
const ORG_B = '00000000-0000-4000-8000-00000000bbb1';
const USER = '00000000-0000-4000-8000-00000000c001';

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
  service: PhotoStorageService;
  repoStore: Map<string, Photo>;
  emitted: Array<{ channel: string; payload: unknown }>;
  s3Store: Map<string, { byteSize: number }>;
}

async function makeHarness(): Promise<Harness> {
  const repoStore = new Map<string, Photo>();
  const emitted: Array<{ channel: string; payload: unknown }> = [];
  const s3Store = new Map<string, { byteSize: number }>();

  const repo: Partial<PhotoRepository> = {
    findById: jest.fn(async (org: string, id: string) => {
      const row = repoStore.get(id);
      if (row === undefined || row.organizationId !== org) return null;
      return row;
    }),
    save: jest.fn(async (photo: Photo) => {
      repoStore.set(photo.id, photo);
      return photo;
    }),
    softDelete: jest.fn(async (id: string, deletedAt: Date) => {
      const row = repoStore.get(id);
      if (row !== undefined) {
        row.deletedAt = deletedAt;
        row.updatedAt = deletedAt;
      }
    }),
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
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    scheme: 'http',
  };

  const s3: PhotoS3Client = {
    headObject: jest.fn(async (objectKey: string) => {
      return s3Store.get(objectKey) ?? null;
    }),
    deleteObject: jest.fn(async (objectKey: string) => {
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
      { provide: PhotoRepository, useValue: repo },
      { provide: EventEmitter2, useValue: events },
      { provide: PHOTO_STORAGE_CONFIG, useValue: config },
      { provide: PHOTO_S3_CLIENT, useValue: s3 },
    ],
  }).compile();

  return {
    service: mod.get(PhotoStorageService),
    repoStore,
    emitted,
    s3Store,
  };
}

describe('PhotoStorageService', () => {
  describe('generateUploadUrl', () => {
    it('returns a 1-hour signed PUT URL with expected s3_key', async () => {
      const h = await makeHarness();
      const id = randomUUID();
      const now = new Date('2026-05-14T03:00:00.000Z');
      const result = h.service.generateUploadUrl(ORG_A, id, 'image/jpeg', now);
      expect(result.s3Key).toBe(`org/${ORG_A}/photos/${id}.jpg`);
      expect(result.photoId).toBe(id);
      expect(result.url).toContain('X-Amz-Expires=3600');
      // expiresAt should be 1 hour after now
      expect(result.expiresAt.getTime() - now.getTime()).toBe(3600 * 1000);
    });
  });

  describe('generateReadUrl', () => {
    it('returns a 24-hour signed GET URL for an owned active photo', async () => {
      const h = await makeHarness();
      const photo = buildPhoto({ organizationId: ORG_A });
      h.repoStore.set(photo.id, photo);
      const now = new Date('2026-05-14T03:00:00.000Z');
      const result = await h.service.generateReadUrl(ORG_A, photo.id, now);
      expect(result.url).toContain('X-Amz-Expires=86400');
      expect(result.expiresAt.getTime() - now.getTime()).toBe(86400 * 1000);
    });

    it('throws PhotoCrossTenantError for cross-org access', async () => {
      const h = await makeHarness();
      const photo = buildPhoto({ organizationId: ORG_B });
      h.repoStore.set(photo.id, photo);
      await expect(
        h.service.generateReadUrl(ORG_A, photo.id),
      ).rejects.toBeInstanceOf(PhotoCrossTenantError);
    });

    it('throws PhotoNotFoundError for soft-deleted photo', async () => {
      const h = await makeHarness();
      const photo = buildPhoto({
        organizationId: ORG_A,
        deletedAt: new Date(),
      });
      h.repoStore.set(photo.id, photo);
      await expect(
        h.service.generateReadUrl(ORG_A, photo.id),
      ).rejects.toBeInstanceOf(PhotoNotFoundError);
    });

    it('throws PhotoCrossTenantError when photo absent (no existence disclosure)', async () => {
      const h = await makeHarness();
      await expect(
        h.service.generateReadUrl(ORG_A, randomUUID()),
      ).rejects.toBeInstanceOf(PhotoCrossTenantError);
    });
  });

  describe('registerUpload', () => {
    it('persists row + emits PHOTO_UPLOADED after S3 HEAD confirms', async () => {
      const h = await makeHarness();
      const id = randomUUID();
      const s3Key = `org/${ORG_A}/photos/${id}.jpg`;
      h.s3Store.set(s3Key, { byteSize: 1024 });

      const saved = await h.service.registerUpload({
        organizationId: ORG_A,
        photoId: id,
        mimeType: 'image/jpeg',
        byteSize: 1024,
        uploadedByUserId: USER,
        retentionClass: 'full_res_90d',
      });

      expect(saved.id).toBe(id);
      expect(saved.s3Key).toBe(s3Key);
      expect(h.repoStore.get(id)).toBeDefined();
      expect(h.emitted).toHaveLength(1);
      expect(h.emitted[0].channel).toBe(PHOTO_UPLOADED_CHANNEL);
      const env = h.emitted[0].payload as {
        aggregateType: string;
        aggregateId: string;
        actorKind: string;
        payloadAfter: { photo_id: string; byte_size: number };
      };
      expect(env.aggregateType).toBe('photo');
      expect(env.aggregateId).toBe(id);
      expect(env.actorKind).toBe('user');
      expect(env.payloadAfter.byte_size).toBe(1024);
    });

    it('throws PhotoUploadNotConfirmedError when S3 object missing (NFR-REL-3)', async () => {
      const h = await makeHarness();
      const id = randomUUID();
      await expect(
        h.service.registerUpload({
          organizationId: ORG_A,
          photoId: id,
          mimeType: 'image/jpeg',
          byteSize: 1024,
          uploadedByUserId: USER,
          retentionClass: 'full_res_90d',
        }),
      ).rejects.toBeInstanceOf(PhotoUploadNotConfirmedError);
      expect(h.repoStore.size).toBe(0);
      expect(h.emitted).toHaveLength(0);
    });

    it('throws PhotoUploadNotConfirmedError on byte_size mismatch', async () => {
      const h = await makeHarness();
      const id = randomUUID();
      const s3Key = `org/${ORG_A}/photos/${id}.jpg`;
      h.s3Store.set(s3Key, { byteSize: 999 });

      await expect(
        h.service.registerUpload({
          organizationId: ORG_A,
          photoId: id,
          mimeType: 'image/jpeg',
          byteSize: 1024,
          uploadedByUserId: USER,
          retentionClass: 'full_res_90d',
        }),
      ).rejects.toBeInstanceOf(PhotoUploadNotConfirmedError);
      expect(h.repoStore.size).toBe(0);
    });
  });

  describe('softDeletePhoto', () => {
    it('soft-deletes + emits PHOTO_DELETED with reason=retention_90d (system actor)', async () => {
      const h = await makeHarness();
      const photo = buildPhoto({ organizationId: ORG_A });
      h.repoStore.set(photo.id, photo);

      const now = new Date('2026-05-14T03:00:00.000Z');
      await h.service.softDeletePhoto({
        organizationId: ORG_A,
        photoId: photo.id,
        reason: 'retention_90d',
        now,
      });

      expect(h.repoStore.get(photo.id)?.deletedAt).toEqual(now);
      expect(h.emitted).toHaveLength(1);
      expect(h.emitted[0].channel).toBe(PHOTO_DELETED_CHANNEL);
      const env = h.emitted[0].payload as {
        actorKind: string;
        actorUserId: string | null;
        payloadAfter: { reason: string };
      };
      expect(env.actorKind).toBe('system');
      expect(env.actorUserId).toBeNull();
      expect(env.payloadAfter.reason).toBe('retention_90d');
    });

    it('soft-deletes + emits PHOTO_DELETED with reason=manual (user actor)', async () => {
      const h = await makeHarness();
      const photo = buildPhoto({ organizationId: ORG_A });
      h.repoStore.set(photo.id, photo);

      await h.service.softDeletePhoto({
        organizationId: ORG_A,
        photoId: photo.id,
        reason: 'manual',
        actorUserId: USER,
      });

      const env = h.emitted[0].payload as {
        actorKind: string;
        actorUserId: string | null;
        payloadAfter: { reason: string };
      };
      expect(env.actorKind).toBe('user');
      expect(env.actorUserId).toBe(USER);
      expect(env.payloadAfter.reason).toBe('manual');
    });

    it('is idempotent — already-soft-deleted row emits no event', async () => {
      const h = await makeHarness();
      const photo = buildPhoto({
        organizationId: ORG_A,
        deletedAt: new Date('2026-05-01T00:00:00Z'),
      });
      h.repoStore.set(photo.id, photo);

      await h.service.softDeletePhoto({
        organizationId: ORG_A,
        photoId: photo.id,
        reason: 'retention_90d',
      });

      expect(h.emitted).toHaveLength(0);
    });

    it('throws PhotoNotFoundError for unknown photo', async () => {
      const h = await makeHarness();
      await expect(
        h.service.softDeletePhoto({
          organizationId: ORG_A,
          photoId: randomUUID(),
          reason: 'manual',
        }),
      ).rejects.toBeInstanceOf(PhotoNotFoundError);
    });
  });
});
