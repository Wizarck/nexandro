import { createHash, createHmac } from 'node:crypto';

/**
 * Inline AWS Signature V4 + pre-signed URL implementation.
 *
 * Per ADR-PHOTO-STORAGE-BACKEND: we deliberately do NOT depend on the AWS
 * SDK — the pre-signed URL HMAC primitive is the only S3 surface we use
 * and the SDK adds ~30 MB of transitive deps. The implementation matches
 * the AWS-documented test vectors so MinIO + AWS S3 work interchangeably.
 *
 * References:
 *   https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
 *   https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html
 *
 * Pure functions (no NestJS imports). Tested against the AWS-documented
 * known vector in `sigv4.spec.ts`.
 */

export interface PresignInputs {
  /** HTTP method (`PUT` for upload, `GET` for read). */
  method: 'GET' | 'PUT';
  /** Bucket name. */
  bucket: string;
  /** Object key (path inside the bucket). */
  objectKey: string;
  /** Endpoint host (e.g., `s3.eu-central-1.amazonaws.com` or `minio.local:9000`). */
  host: string;
  /** AWS region (default `us-east-1`). */
  region: string;
  /** Access key id. */
  accessKeyId: string;
  /** Secret access key. */
  secretAccessKey: string;
  /** Pre-sign expiry seconds (max 604800 per AWS spec). */
  expiresInSeconds: number;
  /** Issuance timestamp (defaults to `new Date()`). Used for the X-Amz-Date param. */
  now?: Date;
  /** Optional content type for upload signing (signed `content-type` header). */
  contentType?: string;
  /**
   * URL scheme. Defaults to `https`. Self-hosted MinIO commonly runs over
   * plain `http` in local dev — operators set this via env.
   */
  scheme?: 'http' | 'https';
}

const SIGNED_HEADERS_BASE = 'host';

/**
 * Hex-encode a Buffer. AWS Sigv4 uses lowercase hex throughout.
 */
function hex(buf: Buffer): string {
  return buf.toString('hex');
}

/**
 * SHA-256 hash of a string, returned lowercase hex.
 */
function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * HMAC-SHA256 of `value` keyed by `key`. Returns the raw Buffer (chained
 * into the next HMAC for derive-key construction).
 */
function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

/**
 * URI-encode per AWS rules: percent-encode every char except
 * `A-Z a-z 0-9 - _ . ~`. Slashes in object keys are encoded as `%2F`
 * for the canonical URI per the docs, but the path itself uses `/` —
 * AWS canonical URI rules treat the path as already-segmented. We pass
 * the encoded path as-is.
 */
export function awsUriEncode(value: string, encodeSlashes: boolean): string {
  let out = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    const isUnreserved =
      (code >= 0x41 && code <= 0x5a) || // A-Z
      (code >= 0x61 && code <= 0x7a) || // a-z
      (code >= 0x30 && code <= 0x39) || // 0-9
      ch === '-' ||
      ch === '_' ||
      ch === '.' ||
      ch === '~';
    if (isUnreserved) {
      out += ch;
    } else if (ch === '/' && !encodeSlashes) {
      out += ch;
    } else {
      // Encode this UTF-8 byte sequence
      const bytes = Buffer.from(ch, 'utf8');
      for (const b of bytes) {
        out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
      }
    }
  }
  return out;
}

/**
 * Build the AWS Sigv4 amz-date (`YYYYMMDDTHHMMSSZ`) and date-stamp
 * (`YYYYMMDD`) from a JS Date. Always UTC.
 */
export function buildAmzDates(now: Date): {
  amzDate: string;
  dateStamp: string;
} {
  const iso = now.toISOString();
  // iso: 2026-05-14T03:00:00.000Z → amzDate=20260514T030000Z, dateStamp=20260514
  const amzDate =
    iso.slice(0, 4) +
    iso.slice(5, 7) +
    iso.slice(8, 10) +
    'T' +
    iso.slice(11, 13) +
    iso.slice(14, 16) +
    iso.slice(17, 19) +
    'Z';
  const dateStamp = iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10);
  return { amzDate, dateStamp };
}

/**
 * Derive a Sigv4 signing key per the AWS spec:
 *   kDate    = HMAC("AWS4" + secret, dateStamp)
 *   kRegion  = HMAC(kDate, region)
 *   kService = HMAC(kRegion, "s3")
 *   kSigning = HMAC(kService, "aws4_request")
 */
export function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
): Buffer {
  const kDate = hmac('AWS4' + secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

/**
 * Build a pre-signed S3 URL per AWS Signature V4 query-string auth. The
 * resulting URL can be used as-is by an HTTP client (no Authorization
 * header required). Compatible with both AWS S3 and MinIO.
 *
 * Implementation notes:
 *  - `X-Amz-Content-Sha256=UNSIGNED-PAYLOAD` is the canonical value for
 *    pre-signed URLs (the client's actual payload is not known at sign
 *    time).
 *  - Only `host` is in the signed headers — keeping the signed-header set
 *    minimal avoids client-side header mismatch.
 *  - Path segments are NOT re-encoded (AWS treats `/` literally in
 *    canonical URI for S3 pre-sign).
 */
export function presignUrl(inputs: PresignInputs): string {
  const now = inputs.now ?? new Date();
  const { amzDate, dateStamp } = buildAmzDates(now);
  const credentialScope = `${dateStamp}/${inputs.region}/s3/aws4_request`;
  const credential = `${inputs.accessKeyId}/${credentialScope}`;
  const scheme = inputs.scheme ?? 'https';

  // Encode the object key segment-by-segment (preserve `/` between segments).
  const encodedKey = inputs.objectKey
    .split('/')
    .map((seg) => awsUriEncode(seg, true))
    .join('/');
  const canonicalUri = `/${inputs.bucket}/${encodedKey}`;

  // Query params for pre-signed URL. Keys MUST be sorted ASCII-ascending
  // for canonical query string construction.
  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(inputs.expiresInSeconds),
    'X-Amz-SignedHeaders': SIGNED_HEADERS_BASE,
  };

  const canonicalQuery = Object.keys(queryParams)
    .sort()
    .map(
      (k) =>
        `${awsUriEncode(k, true)}=${awsUriEncode(queryParams[k], true)}`,
    )
    .join('&');

  const canonicalHeaders = `host:${inputs.host}\n`;
  const signedHeaders = SIGNED_HEADERS_BASE;
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    inputs.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kSigning = signingKey(inputs.secretAccessKey, dateStamp, inputs.region);
  const signature = hex(hmac(kSigning, stringToSign));

  const url = `${scheme}://${inputs.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  return url;
}
