import { S3CompatibleArchiveStorage } from './s3-archive-storage';

interface CapturedCommand {
  ctor: string;
  input: Record<string, unknown>;
}

const sendCalls: Array<{ command: CapturedCommand }> = [];
const clientConfigs: Array<Record<string, unknown>> = [];

jest.mock('@aws-sdk/client-s3', () => {
  class FakeS3Client {
    constructor(config: Record<string, unknown>) {
      clientConfigs.push(config);
    }
    async send(command: unknown): Promise<unknown> {
      sendCalls.push({ command: command as CapturedCommand });
      return { ETag: '"deadbeef"' };
    }
  }
  class FakePutObjectCommand {
    public readonly ctor = 'PutObjectCommand';
    public readonly input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  return { S3Client: FakeS3Client, PutObjectCommand: FakePutObjectCommand };
});

describe('S3CompatibleArchiveStorage', () => {
  let prevEnv: Record<string, string | undefined>;

  beforeEach(() => {
    sendCalls.length = 0;
    clientConfigs.length = 0;
    prevEnv = {
      bucket: process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET,
      endpoint: process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_ENDPOINT,
      region: process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_REGION,
      access: process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_ACCESS_KEY,
      secret: process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_SECRET_KEY,
    };
  });

  afterEach(() => {
    for (const [key, prev] of Object.entries({
      OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET: prevEnv.bucket,
      OPENTRATTOS_AUDIT_ARCHIVE_S3_ENDPOINT: prevEnv.endpoint,
      OPENTRATTOS_AUDIT_ARCHIVE_S3_REGION: prevEnv.region,
      OPENTRATTOS_AUDIT_ARCHIVE_S3_ACCESS_KEY: prevEnv.access,
      OPENTRATTOS_AUDIT_ARCHIVE_S3_SECRET_KEY: prevEnv.secret,
    })) {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  });

  it('throws on construction when bucket env is missing', () => {
    delete process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET;
    expect(() => new S3CompatibleArchiveStorage()).toThrow(
      /OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET is required/,
    );
  });

  it('lazy-inits the S3 client only on first write()', () => {
    process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET = 'my-bucket';
    new S3CompatibleArchiveStorage();
    expect(clientConfigs).toEqual([]);
  });

  it('PutObject contract: Key = {org}/{ym}/audit-log.jsonl.gz, ContentEncoding=gzip, ContentType=application/x-ndjson', async () => {
    process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET = 'my-bucket';
    const storage = new S3CompatibleArchiveStorage();
    const gz = Buffer.from('gz-payload');

    const result = await storage.write('org-abc', '2025-04', gz);

    expect(sendCalls).toHaveLength(1);
    const cmd = sendCalls[0].command;
    expect(cmd.input).toMatchObject({
      Bucket: 'my-bucket',
      Key: 'org-abc/2025-04/audit-log.jsonl.gz',
      Body: gz,
      ContentEncoding: 'gzip',
      ContentType: 'application/x-ndjson',
    });
    expect(result.path).toBe('s3://my-bucket/org-abc/2025-04/audit-log.jsonl.gz');
    expect(result.bytes).toBe(gz.length);
  });

  it('forces path-style addressing when custom endpoint is set', async () => {
    process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET = 'my-bucket';
    process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_ENDPOINT = 'http://minio.local:9000';
    const storage = new S3CompatibleArchiveStorage();
    await storage.write('org-x', '2025-01', Buffer.from('z'));

    expect(clientConfigs).toHaveLength(1);
    expect(clientConfigs[0]).toMatchObject({
      endpoint: 'http://minio.local:9000',
      forcePathStyle: true,
    });
  });

  it('does NOT set forcePathStyle when endpoint is omitted (AWS S3)', async () => {
    process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET = 'my-bucket';
    delete process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_ENDPOINT;
    const storage = new S3CompatibleArchiveStorage();
    await storage.write('org-x', '2025-01', Buffer.from('z'));

    expect(clientConfigs[0].forcePathStyle).toBeUndefined();
    expect(clientConfigs[0].endpoint).toBeUndefined();
  });

  it('wires access/secret credentials when both env vars are present', async () => {
    process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET = 'my-bucket';
    process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_ACCESS_KEY = 'AKIA-fake';
    process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_SECRET_KEY = 'shh';
    const storage = new S3CompatibleArchiveStorage();
    await storage.write('org-x', '2025-01', Buffer.from('z'));

    expect(clientConfigs[0].credentials).toEqual({
      accessKeyId: 'AKIA-fake',
      secretAccessKey: 'shh',
    });
  });

  it('falls back to default credential chain when access/secret omitted', async () => {
    process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET = 'my-bucket';
    delete process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_ACCESS_KEY;
    delete process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_SECRET_KEY;
    const storage = new S3CompatibleArchiveStorage();
    await storage.write('org-x', '2025-01', Buffer.from('z'));

    expect(clientConfigs[0].credentials).toBeUndefined();
  });

  it('defaults region to us-east-1 when env unset', async () => {
    process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_BUCKET = 'my-bucket';
    delete process.env.OPENTRATTOS_AUDIT_ARCHIVE_S3_REGION;
    const storage = new S3CompatibleArchiveStorage();
    await storage.write('org-x', '2025-01', Buffer.from('z'));

    expect(clientConfigs[0].region).toBe('us-east-1');
  });
});
