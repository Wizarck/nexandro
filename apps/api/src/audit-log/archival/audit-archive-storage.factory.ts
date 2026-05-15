import type { AuditArchiveStorage } from './audit-archive-storage';
import { FilesystemArchiveStorage } from './filesystem-archive-storage';
import { S3CompatibleArchiveStorage } from './s3-archive-storage';

/**
 * Backend-selection factory wired into `AuditLogModule` providers as
 * the `AUDIT_ARCHIVE_STORAGE` symbol's `useFactory`. Backend is
 * picked once at module instantiation:
 *
 *  - `OPENTRATTOS_AUDIT_ARCHIVE_BACKEND=s3` → `S3CompatibleArchiveStorage`.
 *  - anything else (incl. unset / `filesystem`) → `FilesystemArchiveStorage`.
 *
 * Per slice design picks, `S3CompatibleArchiveStorage` lazy-initialises
 * its S3 client on first `write()`, so selecting `backend=s3` without
 * the runtime ever calling `write()` does NOT require S3 credentials
 * to be set.
 */
export function createAuditArchiveStorage(): AuditArchiveStorage {
  const backend = process.env.OPENTRATTOS_AUDIT_ARCHIVE_BACKEND ?? 'filesystem';
  if (backend === 's3') {
    return new S3CompatibleArchiveStorage();
  }
  return new FilesystemArchiveStorage();
}
