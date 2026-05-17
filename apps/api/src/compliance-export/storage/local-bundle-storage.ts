import { createHmac } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { BundleAsset, BundleStorage } from './bundle-storage';

const DEFAULT_ROOT = './var/bundles';
const DEFAULT_TTL_SECONDS = 60 * 60; // 1h
const DEFAULT_SIGNING_SECRET = 'nexandro-bundle-signing-dev-only';

/**
 * Filesystem-backed `BundleStorage` for self-hosted MVP. Path layout:
 *
 *     <root>/<orgId>/<bundleId>/{pdf,csv}.bin
 *
 * Signed URLs are HMAC-signed (sha256) tokens of the form
 * `<storagePath>?token=<hex>&exp=<unix>`; the controller validates +
 * streams via `readBundle()`. The signing secret is read from env
 * `NEXANDRO_BUNDLE_SIGNING_SECRET` (defaulted for dev only — the
 * production deployment MUST override).
 */
@Injectable()
export class LocalBundleStorage implements BundleStorage {
  private readonly logger = new Logger(LocalBundleStorage.name);
  private readonly root: string;
  private readonly signingSecret: string;
  private readonly downloadBaseUrl: string;

  constructor() {
    this.root = resolve(process.env.NEXANDRO_BUNDLE_STORAGE_ROOT ?? DEFAULT_ROOT);
    this.signingSecret =
      process.env.NEXANDRO_BUNDLE_SIGNING_SECRET ?? DEFAULT_SIGNING_SECRET;
    this.downloadBaseUrl =
      process.env.NEXANDRO_API_BASE_URL ?? '';
  }

  async putBundle(
    organizationId: string,
    bundleId: string,
    kind: BundleAsset,
    bytes: Buffer,
  ): Promise<string> {
    const storagePath = this.buildPath(organizationId, bundleId, kind);
    const absolute = this.toAbsolute(storagePath);
    await fs.mkdir(dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, bytes);
    return storagePath;
  }

  async readBundle(storagePath: string): Promise<Buffer> {
    const absolute = this.toAbsolute(storagePath);
    return fs.readFile(absolute);
  }

  async signedReadUrl(
    storagePath: string,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const token = this.sign(storagePath, expiresAt);
    const base = this.downloadBaseUrl || '';
    const encoded = encodeURIComponent(storagePath);
    return `${base}/m3/compliance/exports/download?path=${encoded}&exp=${expiresAt}&token=${token}`;
  }

  /**
   * Verify a signed token + expiry against the configured secret. Returns
   * true when valid + not expired. The controller calls this before
   * streaming.
   */
  verify(storagePath: string, expiresAt: number, token: string): boolean {
    if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
      return false;
    }
    const expected = this.sign(storagePath, expiresAt);
    return constantTimeEquals(expected, token);
  }

  /** Compose the canonical storage path. Stable across retries. */
  private buildPath(
    organizationId: string,
    bundleId: string,
    kind: BundleAsset,
  ): string {
    return `${organizationId}/${bundleId}/${kind}.bin`;
  }

  private toAbsolute(storagePath: string): string {
    const absolute = resolve(this.root, storagePath);
    if (!absolute.startsWith(this.root)) {
      throw new Error(`storage path escapes root: ${storagePath}`);
    }
    return absolute;
  }

  private sign(storagePath: string, expiresAt: number): string {
    return createHmac('sha256', this.signingSecret)
      .update(`${storagePath}:${expiresAt}`)
      .digest('hex');
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let acc = 0;
  for (let i = 0; i < a.length; i++) {
    acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return acc === 0;
}
