import type { AuditArchiveStorage } from './audit-archive-storage';

// `@aws-sdk/client-s3` is `import type`d at the top level so that the
// runtime require() is lazy — when `OPENTRATTOS_AUDIT_ARCHIVE_BACKEND`
// is `filesystem` (default), the SDK does NOT load and the app starts
// without any S3 env vars set.
type S3ClientCtor = new (config: Record<string, unknown>) => {
  send: (cmd: unknown) => Promise<unknown>;
};
type PutObjectCommandCtor = new (input: Record<string, unknown>) => unknown;

interface S3Module {
  S3Client: S3ClientCtor;
  PutObjectCommand: PutObjectCommandCtor;
}

/**
 * S3-compatible storage backend. Works with AWS S3, MinIO, or any
 * S3-API-compatible service (Cloudflare R2, Backblaze B2,
 * Azure-Blob-via-S3-compat). Env:
 *
 *  - `OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET`   (required)
 *  - `OPENTRATTOS_AUDIT_ARCHIVE_S3_ENDPOINT` (optional — MinIO / R2 /
 *    Azure custom endpoint URL; omit for AWS S3)
 *  - `OPENTRATTOS_AUDIT_ARCHIVE_S3_REGION`   (default `us-east-1`)
 *  - `OPENTRATTOS_AUDIT_ARCHIVE_S3_ACCESS_KEY` + `_SECRET_KEY`
 *    (optional — falls back to default AWS credential chain when
 *    omitted)
 *
 * Object key: `{organizationId}/{YYYY-MM}/audit-log.jsonl.gz`.
 *
 * Implementation notes:
 *  - The S3 client is constructed LAZILY on first `write()` so
 *    `AuditLogModule` instantiation does not fail when
 *    `backend=filesystem` is selected and no S3 env vars are set.
 *  - `forcePathStyle: true` is set when a custom endpoint is
 *    configured — MinIO + most non-AWS providers require path-style
 *    addressing (`endpoint/bucket/key` instead of
 *    `bucket.endpoint/key`).
 */
export class S3CompatibleArchiveStorage implements AuditArchiveStorage {
  private client: { send: (cmd: unknown) => Promise<unknown> } | null = null;
  private putObjectCommand: PutObjectCommandCtor | null = null;
  private readonly bucket: string;

  constructor() {
    const bucket = process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET;
    if (!bucket) {
      throw new Error(
        'S3CompatibleArchiveStorage: OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET is required',
      );
    }
    this.bucket = bucket;
  }

  async write(
    organizationId: string,
    yearMonth: string,
    gzippedLines: Buffer,
  ): Promise<{ path: string; bytes: number }> {
    const { client, PutObjectCommand } = this.resolveClient();
    const key = `${organizationId}/${yearMonth}/audit-log.jsonl.gz`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: gzippedLines,
      ContentEncoding: 'gzip',
      ContentType: 'application/x-ndjson',
    });
    await client.send(command);
    return { path: `s3://${this.bucket}/${key}`, bytes: gzippedLines.length };
  }

  private resolveClient(): {
    client: { send: (cmd: unknown) => Promise<unknown> };
    PutObjectCommand: PutObjectCommandCtor;
  } {
    if (this.client !== null && this.putObjectCommand !== null) {
      return { client: this.client, PutObjectCommand: this.putObjectCommand };
    }
    // Lazy require — avoids breaking app startup when backend=filesystem.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk = require('@aws-sdk/client-s3') as S3Module;
    const endpoint = process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_ENDPOINT;
    const region =
      process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_REGION ?? 'us-east-1';
    const accessKeyId = process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_ACCESS_KEY;
    const secretAccessKey =
      process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_SECRET_KEY;
    const config: Record<string, unknown> = { region };
    if (endpoint) {
      config.endpoint = endpoint;
      config.forcePathStyle = true;
    }
    if (accessKeyId && secretAccessKey) {
      config.credentials = { accessKeyId, secretAccessKey };
    }
    this.client = new sdk.S3Client(config);
    this.putObjectCommand = sdk.PutObjectCommand;
    return { client: this.client, PutObjectCommand: this.putObjectCommand };
  }
}
