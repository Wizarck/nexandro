import { normalizeTag } from './span-enricher.interceptor';

describe('normalizeTag (opentrattos.tag canonicalization)', () => {
  it('passes already-canonical tags unchanged', () => {
    const result = normalizeTag('photo-ingest-batch');
    expect(result.value).toBe('photo-ingest-batch');
    expect(result.reason).toBe('unchanged');
  });

  it('lowercases capitalized inputs', () => {
    const result = normalizeTag('Photo-Ingest-BATCH');
    expect(result.value).toBe('photo-ingest-batch');
    expect(result.reason).toBe('normalized-case');
  });

  it('replaces spaces with hyphens', () => {
    const result = normalizeTag('Photo Ingest Batch');
    expect(result.value).toBe('photo-ingest-batch');
  });

  it('strips punctuation', () => {
    const result = normalizeTag('Photo!Ingest@Batch?');
    expect(result.value).toBe('photo-ingest-batch');
  });

  it('collapses consecutive separators', () => {
    const result = normalizeTag('photo___ingest---batch');
    expect(result.value).toBe('photo-ingest-batch');
  });

  it('strips leading and trailing hyphens', () => {
    const result = normalizeTag('---photo-ingest---');
    expect(result.value).toBe('photo-ingest');
  });

  it('truncates inputs over 64 chars', () => {
    const long = 'a'.repeat(70);
    const result = normalizeTag(long);
    expect(result.value.length).toBeLessThanOrEqual(64);
    expect(result.value).toBe('a'.repeat(64));
  });

  it('falls back to "untagged" when input has no valid chars', () => {
    const result = normalizeTag('!!!---???');
    expect(result.value).toBe('untagged');
  });

  it('falls back to "untagged" on empty input', () => {
    const result = normalizeTag('');
    expect(result.value).toBe('untagged');
  });
});
