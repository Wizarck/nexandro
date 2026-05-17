/**
 * Pluggable bundle storage interface. The MVP implementation
 * (`LocalBundleStorage`) writes to the local filesystem under
 * `NEXANDRO_BUNDLE_STORAGE_ROOT`. A future S3 backend swaps via this
 * interface without touching the generator.
 */

export type BundleAsset = 'pdf' | 'csv';

export interface BundleStorage {
  /**
   * Persist `bytes` for `(organizationId, bundleId, kind)` and return the
   * canonical storage path. Implementations MUST be deterministic — the
   * same `(orgId, bundleId, kind)` triple produces the same path so the
   * row's stored path is stable across retries.
   */
  putBundle(
    organizationId: string,
    bundleId: string,
    kind: BundleAsset,
    bytes: Buffer,
  ): Promise<string>;

  /**
   * Read the bytes at a previously-stored path. Implementations MUST
   * verify the path is under the storage root (no path traversal).
   * Returns the buffer; throws if the path doesn't exist OR escapes the
   * root.
   */
  readBundle(storagePath: string): Promise<Buffer>;

  /**
   * Generate a signed read URL for the asset at `storagePath`. The
   * local-filesystem implementation HMAC-signs a token that the
   * controller validates before streaming. TTL defaults to 1 hour.
   */
  signedReadUrl(storagePath: string, ttlSeconds?: number): Promise<string>;
}

export const BUNDLE_STORAGE = Symbol('BUNDLE_STORAGE');
