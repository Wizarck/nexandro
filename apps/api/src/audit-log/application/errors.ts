export class AuditLogQueryError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_DATE_RANGE' | 'LIMIT_OUT_OF_RANGE' | 'OFFSET_NEGATIVE',
  ) {
    super(message);
    this.name = 'AuditLogQueryError';
  }
}

/**
 * Thrown by `AuditLogService.record()` when per-write hash chain validation
 * (ADR-HASH-CHAIN-VALIDATION-PER-WRITE) detects a mismatch between the stored
 * `row_hash` of a row in the 100-row lookback window and the value
 * recomputed from `(prev_hash, canonicaliseRow(row))`.
 *
 * Per ADR-HASH-CHAIN-RECOVERY the surface is fail-the-write: the API
 * returns HTTP 500, a structured log line `audit-log.chain-broken` is
 * emitted, and downstream ops alerts pick up the row id of the first
 * detected break (`firstBrokenRowId`) for forensic investigation.
 */
export class HashChainBrokenError extends Error {
  readonly name = 'HashChainBrokenError';
  constructor(
    readonly organizationId: string,
    readonly firstBrokenRowId: string,
  ) {
    super(
      `audit-log hash chain broken: organizationId=${organizationId} firstBrokenRowId=${firstBrokenRowId}`,
    );
  }
}
