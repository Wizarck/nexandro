import { createAuditArchiveStorage } from './audit-archive-storage.factory';
import { FilesystemArchiveStorage } from './filesystem-archive-storage';
import { S3CompatibleArchiveStorage } from './s3-archive-storage';

describe('createAuditArchiveStorage', () => {
  let prevBackend: string | undefined;
  let prevBucket: string | undefined;

  beforeEach(() => {
    prevBackend = process.env.OPENTRATTOS_AUDIT_ARCHIVE_BACKEND;
    prevBucket = process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET;
  });

  afterEach(() => {
    if (prevBackend === undefined) {
      delete process.env.OPENTRATTOS_AUDIT_ARCHIVE_BACKEND;
    } else {
      process.env.OPENTRATTOS_AUDIT_ARCHIVE_BACKEND = prevBackend;
    }
    if (prevBucket === undefined) {
      delete process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET;
    } else {
      process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET = prevBucket;
    }
  });

  it('returns FilesystemArchiveStorage when env is undefined', () => {
    delete process.env.OPENTRATTOS_AUDIT_ARCHIVE_BACKEND;
    expect(createAuditArchiveStorage()).toBeInstanceOf(
      FilesystemArchiveStorage,
    );
  });

  it('returns FilesystemArchiveStorage when env is "filesystem"', () => {
    process.env.OPENTRATTOS_AUDIT_ARCHIVE_BACKEND = 'filesystem';
    expect(createAuditArchiveStorage()).toBeInstanceOf(
      FilesystemArchiveStorage,
    );
  });

  it('returns FilesystemArchiveStorage for unknown backend values', () => {
    process.env.OPENTRATTOS_AUDIT_ARCHIVE_BACKEND = 'azure-direct';
    expect(createAuditArchiveStorage()).toBeInstanceOf(
      FilesystemArchiveStorage,
    );
  });

  it('returns S3CompatibleArchiveStorage when env is "s3"', () => {
    process.env.OPENTRATTOS_AUDIT_ARCHIVE_BACKEND = 's3';
    process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET = 'b';
    expect(createAuditArchiveStorage()).toBeInstanceOf(
      S3CompatibleArchiveStorage,
    );
  });
});
