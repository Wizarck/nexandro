import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Photo } from './domain/photo.entity';
import { PhotoRepository } from './application/photo.repository';
import {
  PHOTO_S3_CLIENT,
  PHOTO_STORAGE_CONFIG,
  PhotoS3Client,
  PhotoStorageConfig,
  PhotoStorageService,
} from './application/photo-storage.service';
import { PhotoRetentionScheduler } from './application/photo-retention.scheduler';

/**
 * Photo storage bounded context (M3 Wave 2.4, slice #18).
 *
 * Exports `PhotoStorageService` for downstream slices to consume:
 *   - slice #17 m3-photo-ingest-hitl-review (invoice + product photos)
 *   - slice #13 m3-recall-86-flag-dispatch (dossier signed URLs)
 *   - slice #15 m3-appcc-export-multilingual (corrective-action photos)
 *
 * Wires:
 *  - `Photo` TypeORM entity (metadata row; image bytes live in S3-compat object storage)
 *  - `PhotoRepository` (multi-tenant gated + cron-scoped queries)
 *  - `PhotoStorageService` (signed-URL gen + register + soft-delete)
 *  - `PhotoRetentionScheduler` (`@Cron('0 3 * * *')` daily; env-flag gated)
 *
 * Config-from-env wiring:
 *  - `PHOTO_STORAGE_CONFIG`: built from env vars `NEXANDRO_PHOTO_STORAGE_*`.
 *  - `PHOTO_S3_CLIENT`: built from a `fetch`-based implementation that uses
 *    the same env credentials for HEAD + DELETE against the storage backend.
 *
 * Audit subscriber registration for `PHOTO_UPLOADED` + `PHOTO_DELETED` is
 * NOT wired here — it lives in `apps/api/src/audit-log/application/audit-log.subscriber.ts`
 * per ADR-AUDIT-EMIT-EVENTS + slice #21's ADR-SUBSCRIBER-FAN-OUT (the
 * audit-log BC is the sole owner of audit_log writes).
 *
 * `ScheduleModule.forRoot()` is registered at the app root (see
 * `app.module.ts`); this module does NOT register it locally for the same
 * reasons as slice #3 ExpiryModule (process-wide registration + idempotency).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Photo])],
  providers: [
    PhotoRepository,
    {
      provide: PHOTO_STORAGE_CONFIG,
      useFactory: (): PhotoStorageConfig => {
        const endpoint = process.env.NEXANDRO_PHOTO_STORAGE_ENDPOINT ?? '';
        const bucket = process.env.NEXANDRO_PHOTO_STORAGE_BUCKET ?? '';
        const region =
          process.env.NEXANDRO_PHOTO_STORAGE_REGION ?? 'us-east-1';
        const accessKeyId =
          process.env.NEXANDRO_PHOTO_STORAGE_ACCESS_KEY_ID ?? '';
        const secretAccessKey =
          process.env.NEXANDRO_PHOTO_STORAGE_SECRET_ACCESS_KEY ?? '';
        const scheme =
          process.env.NEXANDRO_PHOTO_STORAGE_SCHEME === 'http'
            ? 'http'
            : 'https';
        return {
          endpoint,
          bucket,
          region,
          accessKeyId,
          secretAccessKey,
          scheme,
        };
      },
    },
    {
      provide: PHOTO_S3_CLIENT,
      useFactory: (config: PhotoStorageConfig): PhotoS3Client => {
        // Minimal fetch-based S3 client. Self-contained — pre-signs HEAD +
        // DELETE per request. Sufficient for HEAD (existence + Content-Length)
        // and DELETE (idempotent object removal).
        return buildFetchS3Client(config);
      },
      inject: [PHOTO_STORAGE_CONFIG],
    },
    {
      provide: PhotoStorageService,
      useFactory: (
        repo: PhotoRepository,
        events: EventEmitter2,
        config: PhotoStorageConfig,
        s3: PhotoS3Client,
      ): PhotoStorageService =>
        new PhotoStorageService(repo, events, config, s3),
      inject: [
        PhotoRepository,
        EventEmitter2,
        PHOTO_STORAGE_CONFIG,
        PHOTO_S3_CLIENT,
      ],
    },
    PhotoRetentionScheduler,
  ],
  exports: [PhotoStorageService, PhotoRepository],
})
export class PhotoStorageModule {}

/**
 * Minimal fetch-based S3 client. Exposed at module scope so the factory
 * above can build it without bloating the module class. Uses Sigv4
 * pre-signed URLs for HEAD + DELETE — same primitive the service uses
 * for client-facing PUT/GET URLs.
 */
function buildFetchS3Client(config: PhotoStorageConfig): PhotoS3Client {
  // Lazy import to keep startup lean + avoid TS rootDir issues.
  const { presignUrl } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./application/sigv4') as typeof import('./application/sigv4');

  return {
    async headObject(
      objectKey: string,
    ): Promise<{ byteSize: number } | null> {
      const url = presignUrl({
        method: 'GET', // S3 HEAD can be signed as GET; the request method is HEAD
        bucket: config.bucket,
        objectKey,
        host: config.endpoint,
        region: config.region,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        expiresInSeconds: 60,
        scheme: config.scheme,
      });
      const res = await fetch(url, { method: 'HEAD' });
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(
          `S3 HEAD ${objectKey} failed: ${res.status} ${res.statusText}`,
        );
      }
      const lengthHeader = res.headers.get('content-length');
      const byteSize = lengthHeader ? Number.parseInt(lengthHeader, 10) : 0;
      return { byteSize };
    },
    async deleteObject(objectKey: string): Promise<void> {
      const url = presignUrl({
        method: 'PUT', // pre-sign supports GET/PUT; DELETE uses GET-signed URL with method override
        bucket: config.bucket,
        objectKey,
        host: config.endpoint,
        region: config.region,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        expiresInSeconds: 60,
        scheme: config.scheme,
      });
      const res = await fetch(url, { method: 'DELETE' });
      // 404 = already deleted (idempotent); 204 = success
      if (res.status !== 204 && res.status !== 404) {
        throw new Error(
          `S3 DELETE ${objectKey} failed: ${res.status} ${res.statusText}`,
        );
      }
    },
  };
}
