import { COMPLIANCE_WRITE_CAPABILITIES } from './compliance.js';

describe('COMPLIANCE_WRITE_CAPABILITIES', () => {
  it('registers exactly one capability', () => {
    expect(COMPLIANCE_WRITE_CAPABILITIES).toHaveLength(1);
  });

  it('shape includes compliance.generate-export with the right path', () => {
    const cap = COMPLIANCE_WRITE_CAPABILITIES[0];
    expect(cap.name).toBe('compliance.generate-export');
    expect(cap.restMethod).toBe('POST');
    expect(cap.restPathTemplate).toBe('/m3/compliance/exports');
  });

  it('schema includes an optional idempotencyKey field', () => {
    const cap = COMPLIANCE_WRITE_CAPABILITIES[0];
    expect(cap.schema['idempotencyKey']).toBeDefined();
  });

  it('restBodyExtractor strips idempotencyKey out of the body', () => {
    const cap = COMPLIANCE_WRITE_CAPABILITIES[0];
    const body = cap.restBodyExtractor!({
      organizationId: 'org-1',
      rangeStart: '2026-02-01T00:00:00Z',
      rangeEnd: '2026-04-30T23:59:59Z',
      locale: 'es-ES',
      scope: ['haccp'],
      idempotencyKey: 'k1',
    }) as Record<string, unknown>;
    expect(body.idempotencyKey).toBeUndefined();
    expect(body.organizationId).toBe('org-1');
    expect(body.scope).toEqual(['haccp']);
  });
});
