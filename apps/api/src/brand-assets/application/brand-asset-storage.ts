/**
 * Storage adapter interface for brand-mark assets. Two implementations land
 * in the same module: a local-filesystem adapter (default — writes inside
 * the container's persistent volume) and an S3-compatible adapter (env-gated
 * for SaaS / multi-VPS deploys via Cloudflare R2 or AWS S3).
 *
 * Brand marks are PUBLIC + PERMANENT (overwritten when the Owner re-uploads).
 * No retention/cron, no pre-signed URLs — direct backend write + public URL.
 * This makes the contract much simpler than `PhotoStorageService`.
 */

export const BRAND_ASSET_STORAGE = Symbol('BRAND_ASSET_STORAGE');

export interface BrandAssetStorage {
  /**
   * Persist `bytes` as the brand mark for `organizationId`, overwriting any
   * previous asset. Returns a publicly resolvable URL the SPA can put into
   * `<img src>` and the label PDF renderer can fetch.
   */
  put(
    organizationId: string,
    bytes: Buffer,
    contentType: 'image/png' | 'image/jpeg' | 'image/webp',
    extension: 'png' | 'jpg' | 'webp',
  ): Promise<{ url: string }>;

  /** Remove the brand mark for `organizationId`. Idempotent. */
  delete(organizationId: string): Promise<void>;
}
