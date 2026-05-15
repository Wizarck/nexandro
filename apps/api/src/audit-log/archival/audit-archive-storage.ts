/**
 * Storage abstraction for `AuditLogArchivalScanner`. Implementations
 * write a gzipped JSONL blob to a backend (filesystem, S3, or any
 * S3-compatible service such as MinIO / Azure Blob over S3-compat).
 *
 * The contract is intentionally narrow: one write per (organization,
 * yearMonth) bucket. The scanner sequentially writes-then-deletes, so
 * the storage MUST NOT return success until the data has been durably
 * persisted (`writeFile` for filesystem, `PutObjectCommand` success
 * for S3). Failures MUST throw so the scanner's per-bucket try/catch
 * can preserve the rows for the next tick.
 *
 * Per slice m3.x-audit-log-archival design picks:
 *  - Layout: `{root}/{organizationId}/{YYYY-MM}/audit-log.jsonl.gz`
 *  - Content-Encoding `gzip`, Content-Type `application/x-ndjson`
 *  - For a re-archived bucket (multi-tick run for the same org+month
 *    in the same day), the v1 contract OVERWRITES the previous file.
 *    Gzip streams are not trivially appendable; v2 may stream-append
 *    via a multi-member gzip layout.
 */
export interface AuditArchiveStorage {
  write(
    organizationId: string,
    yearMonth: string,
    gzippedLines: Buffer,
  ): Promise<{ path: string; bytes: number }>;
}

/**
 * DI token for the storage implementation. Resolved at module
 * construction time by the factory in
 * `audit-archive-storage.factory.ts` based on the
 * `OPENTRATTOS_AUDIT_ARCHIVE_BACKEND` env var.
 */
export const AUDIT_ARCHIVE_STORAGE = Symbol('AUDIT_ARCHIVE_STORAGE');
