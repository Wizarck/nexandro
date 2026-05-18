import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsBrandAssetStorage } from './local-fs-brand-asset-storage';

describe('LocalFsBrandAssetStorage', () => {
  let rootDir: string;
  let storage: LocalFsBrandAssetStorage;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(join(tmpdir(), 'brand-fs-'));
    storage = new LocalFsBrandAssetStorage({
      rootDir,
      publicUrlBase: '/static/brand-marks',
    });
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('writes the bytes and returns a cache-busted URL', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    const result = await storage.put('org-1', bytes, 'image/png', 'png');
    expect(result.url).toMatch(/^\/static\/brand-marks\/org-1\.png\?v=\d+$/);
    const written = await fs.readFile(join(rootDir, 'org-1.png'));
    expect(written.equals(bytes)).toBe(true);
  });

  it('removes prior-extension copies on re-upload (no stale assets left behind)', async () => {
    await storage.put('org-1', Buffer.from([0xff]), 'image/png', 'png');
    expect(await fileExists(join(rootDir, 'org-1.png'))).toBe(true);

    // Re-upload as webp; the .png copy must be gone.
    await storage.put('org-1', Buffer.from([0xff]), 'image/webp', 'webp');
    expect(await fileExists(join(rootDir, 'org-1.png'))).toBe(false);
    expect(await fileExists(join(rootDir, 'org-1.webp'))).toBe(true);
  });

  it('delete() is idempotent and removes every extension variant', async () => {
    await storage.put('org-1', Buffer.from([0xff]), 'image/png', 'png');
    await storage.delete('org-1');
    expect(await fileExists(join(rootDir, 'org-1.png'))).toBe(false);
    // Second delete must not throw on missing files.
    await expect(storage.delete('org-1')).resolves.toBeUndefined();
  });
});

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
