import { RECALL_WRITE_CAPABILITIES } from './recall.js';

describe('RECALL_WRITE_CAPABILITIES', () => {
  it('exposes two capability entries', () => {
    expect(RECALL_WRITE_CAPABILITIES).toHaveLength(2);
  });

  it('contains recall.dispatch-86-flag', () => {
    const cap = RECALL_WRITE_CAPABILITIES.find(
      (c) => c.name === 'recall.dispatch-86-flag',
    );
    expect(cap).toBeDefined();
    expect(cap?.restMethod).toBe('POST');
    expect(cap?.restPathTemplate).toBe('/m3/recall/incidents/:id/dispatch');
  });

  it('contains recall.generate-dossier', () => {
    const cap = RECALL_WRITE_CAPABILITIES.find(
      (c) => c.name === 'recall.generate-dossier',
    );
    expect(cap).toBeDefined();
    expect(cap?.restMethod).toBe('POST');
    expect(cap?.restPathTemplate).toBe('/m3/recall/incidents/:id/dispatch');
  });

  it('both entries surface restPathParams for :id', () => {
    for (const cap of RECALL_WRITE_CAPABILITIES) {
      expect(typeof cap.restPathParams).toBe('function');
      const params = cap.restPathParams!({
        id: '00000000-0000-0000-0000-000000000001',
      } as unknown);
      expect(params).toEqual({ id: '00000000-0000-0000-0000-000000000001' });
    }
  });

  it('both entries strip id + idempotencyKey from body', () => {
    for (const cap of RECALL_WRITE_CAPABILITIES) {
      const body = cap.restBodyExtractor!({
        id: 'abc',
        idempotencyKey: 'xyz',
        organizationId: 'org-1',
        recipientList: ['ops@example.org'],
      } as unknown);
      expect(body).toEqual({
        organizationId: 'org-1',
        recipientList: ['ops@example.org'],
      });
    }
  });

  it('every entry exposes the idempotencyKey schema field', () => {
    for (const cap of RECALL_WRITE_CAPABILITIES) {
      expect(cap.schema['idempotencyKey']).toBeDefined();
    }
  });

  it('every entry rejects empty recipient lists via Zod', () => {
    for (const cap of RECALL_WRITE_CAPABILITIES) {
      const schema = cap.schema as Record<string, { safeParse: (v: unknown) => { success: boolean } }>;
      const result = schema['recipientList'].safeParse([]);
      expect(result.success).toBe(false);
    }
  });
});
