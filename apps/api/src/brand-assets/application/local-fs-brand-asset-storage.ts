import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { BrandAssetStorage } from './brand-asset-storage';

export interface LocalFsBrandAssetStorageConfig {
  /**
   * Absolute path on the container filesystem where brand marks are written.
   * MUST be mounted as a Docker volume in compose so the asset survives
   * container restarts. Default: `/var/lib/nexandro/brand-marks`.
   */
  rootDir: string;
  /**
   * Public URL prefix the SPA / label renderer fetches. Should match the
   * static-file mount point in `app.module.ts`. Default: `/static/brand-marks`.
   */
  publicUrlBase: string;
}

/**
 * Filesystem adapter — default for self-hosted deploys. One file per
 * organization, overwritten on re-upload. Layout:
 *   {rootDir}/{organizationId}.{ext}
 *
 * The URL is RELATIVE (e.g. `/static/brand-marks/{orgId}.png`) so the
 * adapter works the same behind cloudflared, localhost, custom domain etc.
 */
export class LocalFsBrandAssetStorage implements BrandAssetStorage {
  private readonly logger = new Logger(LocalFsBrandAssetStorage.name);

  constructor(private readonly config: LocalFsBrandAssetStorageConfig) {}

  async put(
    organizationId: string,
    bytes: Buffer,
    _contentType: 'image/png' | 'image/jpeg' | 'image/webp',
    extension: 'png' | 'jpg' | 'webp',
  ): Promise<{ url: string }> {
    await fs.mkdir(this.config.rootDir, { recursive: true });

    // Defensive: clean any previous extension variants so we don't keep stale copies.
    for (const oldExt of ['png', 'jpg', 'webp'] as const) {
      if (oldExt === extension) continue;
      const oldPath = join(this.config.rootDir, `${organizationId}.${oldExt}`);
      await fs.rm(oldPath, { force: true });
    }

    const filename = `${organizationId}.${extension}`;
    const fullPath = join(this.config.rootDir, filename);
    await fs.writeFile(fullPath, bytes);

    // Cache-bust query so the SPA fetches the fresh asset after upload.
    const url = `${this.config.publicUrlBase}/${filename}?v=${Date.now()}`;
    this.logger.log(`brand-asset: wrote ${bytes.length}B to ${fullPath}`);
    return { url };
  }

  async delete(organizationId: string): Promise<void> {
    for (const ext of ['png', 'jpg', 'webp'] as const) {
      await fs.rm(join(this.config.rootDir, `${organizationId}.${ext}`), { force: true });
    }
  }
}
