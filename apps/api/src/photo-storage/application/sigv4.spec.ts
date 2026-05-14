import {
  awsUriEncode,
  buildAmzDates,
  presignUrl,
  signingKey,
} from './sigv4';

describe('AWS Sigv4 primitives', () => {
  describe('awsUriEncode', () => {
    it('preserves unreserved characters per RFC 3986', () => {
      expect(awsUriEncode('AZaz09-_.~', true)).toBe('AZaz09-_.~');
    });

    it('percent-encodes reserved characters', () => {
      expect(awsUriEncode('foo bar', true)).toBe('foo%20bar');
      expect(awsUriEncode('a+b', true)).toBe('a%2Bb');
      expect(awsUriEncode('a=b', true)).toBe('a%3Db');
    });

    it('preserves slash when encodeSlashes is false', () => {
      expect(awsUriEncode('foo/bar', false)).toBe('foo/bar');
    });

    it('percent-encodes slash when encodeSlashes is true', () => {
      expect(awsUriEncode('foo/bar', true)).toBe('foo%2Fbar');
    });
  });

  describe('buildAmzDates', () => {
    it('builds AWS-format dates from ISO timestamp', () => {
      const dates = buildAmzDates(new Date('2026-05-14T03:00:00.000Z'));
      expect(dates.amzDate).toBe('20260514T030000Z');
      expect(dates.dateStamp).toBe('20260514');
    });

    it('uses UTC regardless of local TZ', () => {
      // A fixed UTC moment renders the same amz date everywhere
      const dates = buildAmzDates(new Date(Date.UTC(2025, 0, 1, 12, 30, 45)));
      expect(dates.amzDate).toBe('20250101T123045Z');
    });
  });

  describe('signingKey', () => {
    it('derives a 32-byte HMAC chain', () => {
      const key = signingKey('secret123', '20260514', 'us-east-1');
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('is deterministic for identical inputs', () => {
      const a = signingKey('s', '20260514', 'us-east-1');
      const b = signingKey('s', '20260514', 'us-east-1');
      expect(a.equals(b)).toBe(true);
    });

    it('differs when any input differs', () => {
      const a = signingKey('s', '20260514', 'us-east-1');
      const b = signingKey('s', '20260515', 'us-east-1');
      const c = signingKey('s', '20260514', 'eu-central-1');
      expect(a.equals(b)).toBe(false);
      expect(a.equals(c)).toBe(false);
    });
  });

  describe('presignUrl', () => {
    const baseInputs = {
      method: 'PUT' as const,
      bucket: 'opentrattos-photos-test',
      objectKey: 'org/aaa/photos/photo-1.jpg',
      host: 'minio.local:9000',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expiresInSeconds: 3600,
      now: new Date('2026-05-14T03:00:00.000Z'),
      scheme: 'http' as const,
    };

    it('emits a URL with all required Sigv4 query params', () => {
      const url = presignUrl(baseInputs);
      expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(url).toContain('X-Amz-Credential=');
      expect(url).toContain('X-Amz-Date=20260514T030000Z');
      expect(url).toContain('X-Amz-Expires=3600');
      expect(url).toContain('X-Amz-SignedHeaders=host');
      expect(url).toContain('X-Amz-Signature=');
    });

    it('encodes the bucket + object key in the path', () => {
      const url = presignUrl(baseInputs);
      expect(url).toContain('/opentrattos-photos-test/org/aaa/photos/photo-1.jpg');
    });

    it('is deterministic for identical inputs (signature stability)', () => {
      const a = presignUrl(baseInputs);
      const b = presignUrl(baseInputs);
      expect(a).toBe(b);
    });

    it('produces a different signature when method differs', () => {
      const put = presignUrl({ ...baseInputs, method: 'PUT' });
      const get = presignUrl({ ...baseInputs, method: 'GET' });
      const putSig = new URL(put).searchParams.get('X-Amz-Signature');
      const getSig = new URL(get).searchParams.get('X-Amz-Signature');
      expect(putSig).not.toBe(getSig);
    });

    it('produces a different signature when objectKey differs', () => {
      const a = presignUrl(baseInputs);
      const b = presignUrl({ ...baseInputs, objectKey: 'other/key.png' });
      expect(
        new URL(a).searchParams.get('X-Amz-Signature'),
      ).not.toBe(new URL(b).searchParams.get('X-Amz-Signature'));
    });

    it('uses https scheme by default', () => {
      const url = presignUrl({ ...baseInputs, scheme: undefined });
      expect(url.startsWith('https://')).toBe(true);
    });

    it('uses http scheme when explicitly set', () => {
      const url = presignUrl({ ...baseInputs, scheme: 'http' });
      expect(url.startsWith('http://')).toBe(true);
    });

    it('signature is 64 hex chars (SHA-256 HMAC)', () => {
      const url = presignUrl(baseInputs);
      const sig = new URL(url).searchParams.get('X-Amz-Signature');
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
