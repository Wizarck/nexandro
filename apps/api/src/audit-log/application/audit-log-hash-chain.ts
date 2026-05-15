import { createHash } from 'node:crypto';
import type { AuditLog } from '../domain/audit-log.entity';

/**
 * Hash chain primitives for the `audit_log` tamper-evident substrate.
 *
 * Per ADR-AUDIT-HASH-CHAIN + ADR-HASH-CHAIN-VALIDATION-PER-WRITE (design.md
 * of m3-audit-log-hash-chain-hardening, slice #21 Wave 2.3):
 *
 *  - Every row's `row_hash` is SHA-256 over `(prev_hash || canonical_json)`.
 *  - `prev_hash` is the previous row's `row_hash` within the same tenant.
 *  - Canonicalisation is deterministic (sorted keys, ISO timestamps, no
 *    NaN) so two correctly-equivalent rows produce identical hashes.
 *  - Validation runs on every append over the previous 100 rows
 *    (bounded latency: ≤5 ms p95 at 1 M rows/org).
 *
 * This module is intentionally pure / stateless / pure-fn so it is trivial
 * to unit-test without any Nest infrastructure or DB harness.
 */

/**
 * Subset of `AuditLog` fields included in the canonical hash payload.
 * Excludes `rowHash`, `prevHash`, `retentionClass` (those are derived,
 * not source-of-truth) and `id` (chain is order-of-creation, not id-keyed,
 * so id divergence under reseeding doesn't break the chain).
 */
export interface CanonicalAuditRow {
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string | null;
  actorKind: string;
  agentName: string | null;
  payloadBefore: unknown;
  payloadAfter: unknown;
  reason: string | null;
  citationUrl: string | null;
  snippet: string | null;
  createdAt: Date;
}

/**
 * Canonicalise an audit row to a deterministic JSON string for hashing.
 *
 * Determinism rules (per ADR-AUDIT-HASH-CHAIN):
 *  - Top-level keys sorted alphabetically.
 *  - Date values serialised as ISO-8601 UTC (`toISOString()`).
 *  - `null` values explicitly serialised (never elided).
 *  - JSONB payloads canonicalised recursively (sorted keys at every depth).
 *  - Numbers serialised via `JSON.stringify` (NaN/Infinity excluded by
 *    contract — the entity-layer Zod schemas reject them).
 */
export function canonicaliseRow(row: CanonicalAuditRow): string {
  const ordered: Record<string, unknown> = {
    actorKind: row.actorKind,
    actorUserId: row.actorUserId,
    aggregateId: row.aggregateId,
    aggregateType: row.aggregateType,
    agentName: row.agentName,
    citationUrl: row.citationUrl,
    createdAt: row.createdAt.toISOString(),
    eventType: row.eventType,
    organizationId: row.organizationId,
    payloadAfter: canonicaliseValue(row.payloadAfter),
    payloadBefore: canonicaliseValue(row.payloadBefore),
    reason: row.reason,
    snippet: row.snippet,
  };
  return JSON.stringify(ordered);
}

/**
 * Recursively canonicalise a JSONB-shaped value: object keys sorted at
 * every depth; arrays preserved in order; primitives unchanged.
 */
function canonicaliseValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicaliseValue);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicaliseValue(obj[key]);
    }
    return sorted;
  }
  // Primitive — string / number / boolean.
  return value;
}

/**
 * Compute SHA-256 over `(prev_hash || canonical_json_utf8)`.
 *
 * `prevHash` is `null` for the first row per tenant; the seed bytes are
 * an empty buffer in that case so the chain still hashes deterministically.
 */
export function computeRowHash(
  prevHash: Buffer | null,
  canonicalJson: string,
): Buffer {
  const h = createHash('sha256');
  h.update(prevHash ?? Buffer.alloc(0));
  h.update(canonicalJson, 'utf8');
  return h.digest();
}

/**
 * Validate a sequence of `AuditLog` rows oldest-to-newest. Returns
 * `{ ok: true }` if every row's stored `row_hash` matches the recomputed
 * value; otherwise returns `{ ok: false, firstBrokenRowId }` naming the
 * earliest row whose hash diverges from the expected value.
 *
 * Caller is responsible for ordering the input by `(created_at ASC, id
 * ASC)`. The function does NOT sort internally — sorting bytea hashes
 * post-hoc would mask tampering that changed the timestamp.
 *
 * The chain is validated **within** the supplied window. The seed
 * `prevHash` is taken from the first row's stored `prev_hash` column so
 * that callers passing a sliding lookback (e.g. the per-write 100-row
 * window from `AuditLogService.loadChainLookback`) get self-consistent
 * validation when the window does NOT begin at the chain root. Older
 * tampers outside the window are caught by the offline full-chain D1
 * audit per ADR-HASH-CHAIN-VALIDATION-PER-WRITE.
 */
export function validateChainIntegrity(
  rows: ReadonlyArray<AuditLog>,
): { ok: true } | { ok: false; firstBrokenRowId: string } {
  let prevHash: Buffer | null = rows.length > 0 ? rows[0].prevHash : null;
  for (const row of rows) {
    if (row.rowHash === null) {
      // Legacy unbackfilled row — treat as chain root continuation.
      // Backfill migration 0023 should have populated every row; if a
      // null slips through, accept it but reset the chain expectation.
      prevHash = null;
      continue;
    }
    const expected = computeRowHash(prevHash, canonicaliseRow(toCanonical(row)));
    if (!buffersEqual(expected, row.rowHash)) {
      return { ok: false, firstBrokenRowId: row.id };
    }
    prevHash = row.rowHash;
  }
  return { ok: true };
}

function toCanonical(row: AuditLog): CanonicalAuditRow {
  return {
    organizationId: row.organizationId,
    eventType: row.eventType,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    actorUserId: row.actorUserId,
    actorKind: row.actorKind,
    agentName: row.agentName,
    payloadBefore: row.payloadBefore,
    payloadAfter: row.payloadAfter,
    reason: row.reason,
    citationUrl: row.citationUrl,
    snippet: row.snippet,
    createdAt: row.createdAt,
  };
}

function buffersEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  // Constant-time-ish — we don't have crypto-grade timing constraints
  // here (the hash chain isn't a secret-comparison surface) but a simple
  // loop is fine.
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
