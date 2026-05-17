import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalBundleStorage } from './local-bundle-storage';

const ORG = '11111111-1111-4111-8111-111111111111';
const BUNDLE = '33333333-3333-4333-8333-333333333333';

describe('LocalBundleStorage', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'nexandro-bundle-test-'));
    process.env.NEXANDRO_BUNDLE_STORAGE_ROOT = root;
    process.env.NEXANDRO_BUNDLE_SIGNING_SECRET = 'test-secret';
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    delete process.env.NEXANDRO_BUNDLE_STORAGE_ROOT;
    delete process.env.NEXANDRO_BUNDLE_SIGNING_SECRET;
  });

  it('round-trips put → read for both pdf and csv assets', async () => {
    const storage = new LocalBundleStorage();
    const pdf = Buffer.from('PDF-content');
    const csv = Buffer.from('CSV-content');
    const pdfPath = await storage.putBundle(ORG, BUNDLE, 'pdf', pdf);
    const csvPath = await storage.putBundle(ORG, BUNDLE, 'csv', csv);

    expect(pdfPath).toBe(`${ORG}/${BUNDLE}/pdf.bin`);
    expect(csvPath).toBe(`${ORG}/${BUNDLE}/csv.bin`);
    expect(await storage.readBundle(pdfPath)).toEqual(pdf);
    expect(await storage.readBundle(csvPath)).toEqual(csv);
  });

  it('produces a signed URL whose token verifies before expiry', async () => {
    const storage = new LocalBundleStorage();
    const path = `${ORG}/${BUNDLE}/pdf.bin`;
    const url = await storage.signedReadUrl(path, 60);
    const parsed = new URL(url, 'http://placeholder.invalid');
    const exp = Number(parsed.searchParams.get('exp'));
    const token = parsed.searchParams.get('token')!;
    expect(storage.verify(path, exp, token)).toBe(true);
    expect(storage.verify(path, exp - 1, token)).toBe(false);
    // Flip the last char to one guaranteed-different from itself —
    // hex token ending in '0' would collide with the previous '+ "0"'
    // and pass verify (~1/16 flake). Use any non-equal char.
    const last = token[token.length - 1];
    const tampered = token.slice(0, -1) + (last === '0' ? '1' : '0');
    expect(storage.verify(path, exp, tampered)).toBe(false);
  });

  it('rejects an expired signed URL', async () => {
    const storage = new LocalBundleStorage();
    const path = `${ORG}/${BUNDLE}/pdf.bin`;
    const expiredAt = Math.floor(Date.now() / 1000) - 10;
    const url = await storage.signedReadUrl(path, 0);
    const parsed = new URL(url, 'http://placeholder.invalid');
    const token = parsed.searchParams.get('token')!;
    expect(storage.verify(path, expiredAt, token)).toBe(false);
  });

  it('rejects path-traversal attempts at read time', async () => {
    const storage = new LocalBundleStorage();
    await expect(storage.readBundle('../../../etc/passwd')).rejects.toThrow();
  });
});
