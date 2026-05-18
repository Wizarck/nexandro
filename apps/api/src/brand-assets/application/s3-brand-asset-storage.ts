import { Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { BrandAssetStorage } from './brand-asset-storage';

export interface S3BrandAssetStorageConfig {
  endpoint?: string; // e.g. https://<account>.r2.cloudflarestorage.com — omit for AWS S3
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Public URL prefix used to compose the returned URL.
   * Examples:
   *   - R2 custom domain: `https://cdn.example.com/brand-marks`
   *   - AWS S3 virtual-hosted: `https://{bucket}.s3.{region}.amazonaws.com/brand-marks`
   *   - MinIO path-style:      `https://minio.local/{bucket}/brand-marks`
   *
   * The adapter just appends `/{orgId}.{ext}?v=<ts>` to this base.
   */
  publicUrlBase: string;
  /** Key prefix inside the bucket. Default: `brand-marks`. */
  keyPrefix?: string;
  /** Force path-style addressing — required for MinIO + most R2 endpoint configs. */
  forcePathStyle?: boolean;
}

/**
 * S3-compatible adapter for SaaS / multi-host deploys. Reuses the same
 * `@aws-sdk/client-s3` that `apps/api/src/audit-log/archival/s3-archive-storage.ts`
 * already vendors, so no new transitive deps.
 *
 * Brand marks are PUBLIC: the adapter does NOT set ACLs (R2 buckets are
 * implicitly private + served via a public custom domain; AWS S3 requires
 * the bucket policy to allow public reads on `brand-marks/*`). Document
 * this in `docs/operations/brand-assets-s3.md`.
 */
export class S3BrandAssetStorage implements BrandAssetStorage {
  private readonly logger = new Logger(S3BrandAssetStorage.name);
  private readonly client: S3Client;
  private readonly keyPrefix: string;

  constructor(private readonly config: S3BrandAssetStorageConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.keyPrefix = (config.keyPrefix ?? 'brand-marks').replace(/^\/+|\/+$/g, '');
  }

  async put(
    organizationId: string,
    bytes: Buffer,
    contentType: 'image/png' | 'image/jpeg' | 'image/webp',
    extension: 'png' | 'jpg' | 'webp',
  ): Promise<{ url: string }> {
    const key = `${this.keyPrefix}/${organizationId}.${extension}`;

    // Best-effort delete of other extension variants so re-uploading png
    // after webp doesn't leave a stale webp object behind.
    for (const oldExt of ['png', 'jpg', 'webp'] as const) {
      if (oldExt === extension) continue;
      await this.client
        .send(
          new DeleteObjectCommand({
            Bucket: this.config.bucket,
            Key: `${this.keyPrefix}/${organizationId}.${oldExt}`,
          }),
        )
        .catch(() => undefined);
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    const base = this.config.publicUrlBase.replace(/\/+$/, '');
    const url = `${base}/${organizationId}.${extension}?v=${Date.now()}`;
    this.logger.log(`brand-asset: PUT s3://${this.config.bucket}/${key} (${bytes.length}B)`);
    return { url };
  }

  async delete(organizationId: string): Promise<void> {
    for (const ext of ['png', 'jpg', 'webp'] as const) {
      await this.client
        .send(
          new DeleteObjectCommand({
            Bucket: this.config.bucket,
            Key: `${this.keyPrefix}/${organizationId}.${ext}`,
          }),
        )
        .catch(() => undefined);
    }
  }
}
