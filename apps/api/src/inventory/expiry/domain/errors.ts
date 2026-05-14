/**
 * Domain errors for the inventory.expiry BC (slice #3, Wave 2.2).
 *
 * Per design.md ADR-EXPIRY-DEDUPLICATION + ADR-EXPIRY-EVENT-PAYLOAD.
 * Stable `code` field for app-side mapping (this slice is backend-only;
 * controllers wired by downstream slices map to HTTP statuses).
 */

export class ExpiryAlertsFiredImmutableError extends Error {
  public readonly code = 'EXPIRY_ALERTS_FIRED_IMMUTABLE';
  constructor(operation: string) {
    super(
      `expiry_alerts_fired is append-only at the application layer. ` +
        `Refused operation: ${operation}.`,
    );
    this.name = 'ExpiryAlertsFiredImmutableError';
  }
}

export class ExpiryDedupWindowConflictError extends Error {
  public readonly code = 'EXPIRY_DEDUP_WINDOW_CONFLICT';
  constructor(lotId: string, alertBand: string) {
    super(
      `Concurrent dedup INSERT lost the race for lot=${lotId} band=${alertBand}. ` +
        `Another replica won; this tick will skip emission for the (lot, band) pair.`,
    );
    this.name = 'ExpiryDedupWindowConflictError';
  }
}

export class InvalidAlertBandError extends Error {
  public readonly code = 'INVALID_ALERT_BAND';
  constructor(band: string) {
    super(`Invalid alert_band "${band}". Allowed: t-72h, t-24h.`);
    this.name = 'InvalidAlertBandError';
  }
}
