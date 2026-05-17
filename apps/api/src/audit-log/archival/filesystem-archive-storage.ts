import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuditArchiveStorage } from './audit-archive-storage';

/**
 * Default storage backend — writes gzipped JSONL files to a
 * local-filesystem layout suitable for either a single-host install
 * or a network mount (NFS, EFS) for HA setups.
 *
 * Env:
 *  - `NEXANDRO_AUDIT_ARCHIVE_DIR` — root directory; default
 *    `/var/nexandro/audit-archive`.
 *
 * Layout: `{root}/{organizationId}/{YYYY-MM}/audit-log.jsonl.gz`
 *
 * **v1 constraint (intentional):** if a bucket file already exists
 * for the same (orgId, yearMonth), this implementation OVERWRITES
 * it. Gzip streams are not trivially appendable — concatenating two
 * gzipped buffers produces a multi-member gzip that not all readers
 * tolerate, and a streaming append requires a fully streaming
 * scanner architecture. Since the daily cron buckets rows by month
 * and the threshold is in months/years, no two ticks should ever
 * produce a new bucket for the same (org, month) under normal
 * operation. The overwrite is the safe choice during back-fill /
 * re-runs.
 *
 * A v2 follow-up may switch to gzip stream append (multi-member) or
 * generate per-tick suffixed files (`audit-log.jsonl.gz.001`,
 * `.002`, ...) if observability shows repeat writes.
 */
export class FilesystemArchiveStorage implements AuditArchiveStorage {
  private readonly root: string;

  constructor(root?: string) {
    this.root =
      root ??
      process.env.NEXANDRO_AUDIT_ARCHIVE_DIR ??
      '/var/nexandro/audit-archive';
  }

  async write(
    organizationId: string,
    yearMonth: string,
    gzippedLines: Buffer,
  ): Promise<{ path: string; bytes: number }> {
    const dir = join(this.root, organizationId, yearMonth);
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'audit-log.jsonl.gz');
    await writeFile(path, gzippedLines);
    return { path, bytes: gzippedLines.length };
  }
}
