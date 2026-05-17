import { gunzipSync } from 'node:zlib';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilesystemArchiveStorage } from './filesystem-archive-storage';

describe('FilesystemArchiveStorage', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'audit-archive-fs-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes gzipped JSONL to {root}/{org}/{ym}/audit-log.jsonl.gz', async () => {
    const storage = new FilesystemArchiveStorage(root);
    const buf = Buffer.from('payload');
    const gzippedInput = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xde, 0xad]);

    const result = await storage.write(
      '11111111-1111-1111-1111-111111111111',
      '2025-04',
      gzippedInput,
    );

    expect(result.path).toContain('11111111-1111-1111-1111-111111111111');
    expect(result.path).toContain('2025-04');
    expect(result.path).toMatch(/audit-log\.jsonl\.gz$/);
    expect(result.bytes).toBe(gzippedInput.length);

    const onDisk = readFileSync(result.path);
    expect(onDisk).toEqual(gzippedInput);
    // Confirm the buf reference variable is unused-warning-free in case
    // the linter complains.
    void buf;
  });

  it('content round-trips through gunzip', async () => {
    const { gzipSync } = await import('node:zlib');
    const storage = new FilesystemArchiveStorage(root);
    const original = '{"id":"row-1"}\n{"id":"row-2"}';
    const gz = gzipSync(Buffer.from(original, 'utf8'));

    const result = await storage.write('org-1', '2024-12', gz);

    const restored = gunzipSync(readFileSync(result.path)).toString('utf8');
    expect(restored).toBe(original);
  });

  it('creates nested directories recursively', async () => {
    const storage = new FilesystemArchiveStorage(root);
    const gz = Buffer.from('x');
    const result = await storage.write(
      'deep-org',
      '2030-01',
      gz,
    );
    expect(result.path).toBe(
      join(root, 'deep-org', '2030-01', 'audit-log.jsonl.gz'),
    );
  });

  it('overwrites an existing file for the same (org, ym) bucket (v1 contract)', async () => {
    const storage = new FilesystemArchiveStorage(root);
    await storage.write('org-x', '2025-01', Buffer.from('first'));
    const result = await storage.write(
      'org-x',
      '2025-01',
      Buffer.from('second-bigger'),
    );
    expect(readFileSync(result.path).toString('utf8')).toBe('second-bigger');
  });

  it('falls back to NEXANDRO_AUDIT_ARCHIVE_DIR env when no root passed', () => {
    const prev = process.env.NEXANDRO_AUDIT_ARCHIVE_DIR;
    try {
      process.env.NEXANDRO_AUDIT_ARCHIVE_DIR = root;
      const storage = new FilesystemArchiveStorage();
      // Implementation detail — read the resolved root via a write to a
      // known location and inspect the result path.
      return storage
        .write('env-org', '2025-06', Buffer.from('x'))
        .then((result) => {
          expect(result.path.startsWith(root)).toBe(true);
        });
    } finally {
      if (prev === undefined) {
        delete process.env.NEXANDRO_AUDIT_ARCHIVE_DIR;
      } else {
        process.env.NEXANDRO_AUDIT_ARCHIVE_DIR = prev;
      }
    }
  });
});
