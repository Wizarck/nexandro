import { AuditLog } from '../domain/audit-log.entity';
import {
  CanonicalAuditRow,
  canonicaliseRow,
  computeRowHash,
  validateChainIntegrity,
} from './audit-log-hash-chain';

const FIXED_DATE = new Date('2026-05-14T00:00:00.000Z');

function makeCanonical(overrides: Partial<CanonicalAuditRow> = {}): CanonicalAuditRow {
  return {
    organizationId: '00000000-0000-4000-8000-00000000aaaa',
    eventType: 'AI_SUGGESTION_ACCEPTED',
    aggregateType: 'ai_suggestion',
    aggregateId: '00000000-0000-4000-8000-00000000bbbb',
    actorUserId: '00000000-0000-4000-8000-00000000cccc',
    actorKind: 'user',
    agentName: null,
    payloadBefore: null,
    payloadAfter: { foo: 'bar' },
    reason: null,
    citationUrl: null,
    snippet: null,
    createdAt: FIXED_DATE,
    ...overrides,
  };
}

function makeEntity(rowHash: Buffer | null, overrides: Partial<AuditLog> = {}): AuditLog {
  const a = new AuditLog();
  a.id = overrides.id ?? '00000000-0000-4000-8000-000000000001';
  a.organizationId = overrides.organizationId ?? '00000000-0000-4000-8000-00000000aaaa';
  a.eventType = overrides.eventType ?? 'AI_SUGGESTION_ACCEPTED';
  a.aggregateType = overrides.aggregateType ?? 'ai_suggestion';
  a.aggregateId = overrides.aggregateId ?? '00000000-0000-4000-8000-00000000bbbb';
  a.actorUserId = overrides.actorUserId ?? '00000000-0000-4000-8000-00000000cccc';
  a.actorKind = overrides.actorKind ?? 'user';
  a.agentName = overrides.agentName ?? null;
  a.payloadBefore = overrides.payloadBefore ?? null;
  a.payloadAfter = overrides.payloadAfter ?? { foo: 'bar' };
  a.reason = overrides.reason ?? null;
  a.citationUrl = overrides.citationUrl ?? null;
  a.snippet = overrides.snippet ?? null;
  a.createdAt = overrides.createdAt ?? FIXED_DATE;
  a.rowHash = rowHash;
  a.prevHash = overrides.prevHash ?? null;
  a.retentionClass = overrides.retentionClass ?? 'operational';
  return a;
}

describe('audit-log-hash-chain', () => {
  describe('canonicaliseRow', () => {
    it('produces deterministic output regardless of object key ordering', () => {
      const a = canonicaliseRow(makeCanonical({ payloadAfter: { a: 1, b: 2 } }));
      const b = canonicaliseRow(makeCanonical({ payloadAfter: { b: 2, a: 1 } }));
      expect(a).toBe(b);
    });

    it('serialises Date as ISO-8601 UTC', () => {
      const json = canonicaliseRow(makeCanonical());
      expect(json).toContain('"createdAt":"2026-05-14T00:00:00.000Z"');
    });

    it('serialises null fields explicitly (does not elide)', () => {
      const json = canonicaliseRow(makeCanonical({ payloadAfter: null }));
      expect(json).toContain('"payloadAfter":null');
    });

    it('canonicalises nested object keys recursively', () => {
      const json = canonicaliseRow(
        makeCanonical({ payloadAfter: { z: { c: 1, a: 2 }, m: 3 } }),
      );
      // Inner object's keys are sorted: a then c.
      expect(json).toContain('"payloadAfter":{"m":3,"z":{"a":2,"c":1}}');
    });

    it('preserves array element order', () => {
      const json = canonicaliseRow(makeCanonical({ payloadAfter: [3, 1, 2] }));
      expect(json).toContain('"payloadAfter":[3,1,2]');
    });
  });

  describe('computeRowHash', () => {
    it('returns a 32-byte Buffer (SHA-256 digest length)', () => {
      const h = computeRowHash(null, 'hello');
      expect(h).toBeInstanceOf(Buffer);
      expect(h.length).toBe(32);
    });

    it('is deterministic for the same input', () => {
      const a = computeRowHash(null, 'hello');
      const b = computeRowHash(null, 'hello');
      expect(a.equals(b)).toBe(true);
    });

    it('differs when prevHash differs', () => {
      const a = computeRowHash(null, 'hello');
      const b = computeRowHash(Buffer.from('seed'), 'hello');
      expect(a.equals(b)).toBe(false);
    });

    it('differs when canonical content differs', () => {
      const a = computeRowHash(null, 'hello');
      const b = computeRowHash(null, 'world');
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('validateChainIntegrity', () => {
    function buildValidChain(n: number): AuditLog[] {
      const rows: AuditLog[] = [];
      let prevHash: Buffer | null = null;
      for (let i = 0; i < n; i++) {
        const canonical = canonicaliseRow(
          makeCanonical({ aggregateId: `agg-${i}`, payloadAfter: { idx: i } }),
        );
        const rowHash = computeRowHash(prevHash, canonical);
        const entity = makeEntity(rowHash, {
          id: `row-${i}`,
          aggregateId: `agg-${i}`,
          payloadAfter: { idx: i },
          prevHash,
        });
        rows.push(entity);
        prevHash = rowHash;
      }
      return rows;
    }

    it('returns ok=true for an empty chain', () => {
      const result = validateChainIntegrity([]);
      expect(result.ok).toBe(true);
    });

    it('returns ok=true for a valid 50-row chain', () => {
      const result = validateChainIntegrity(buildValidChain(50));
      expect(result.ok).toBe(true);
    });

    it('returns ok=false with firstBrokenRowId on tampered middle row', () => {
      const rows = buildValidChain(10);
      // Tamper: change row 5's payloadAfter without updating row_hash.
      rows[5].payloadAfter = { idx: 999 };
      const result = validateChainIntegrity(rows);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.firstBrokenRowId).toBe('row-5');
      }
    });

    it('returns ok=false on tampered first row', () => {
      const rows = buildValidChain(3);
      rows[0].payloadAfter = { tampered: true };
      const result = validateChainIntegrity(rows);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.firstBrokenRowId).toBe('row-0');
      }
    });

    it('skips legacy unbackfilled rows (rowHash=null) without false-positive', () => {
      const legacy = makeEntity(null, { id: 'legacy-1' });
      const subsequent = buildValidChain(1)[0];
      // After legacy, the subsequent row's prev_hash will be null (chain
      // reset). Its row_hash was computed against prev=null in buildValidChain,
      // so the chain is valid.
      const result = validateChainIntegrity([legacy, subsequent]);
      expect(result.ok).toBe(true);
    });
  });
});
