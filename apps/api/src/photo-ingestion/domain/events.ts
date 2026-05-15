/**
 * Photo-ingestion event channel constants. These mirror the bus channel
 * strings the BC publishes on via `EventEmitter2`. The canonical
 * `AuditEventType.*` constants in `apps/api/src/audit-log/application/types.ts`
 * use the SAME string values so `@OnEvent(AuditEventType.PHOTO_INGESTION_*)`
 * subscribers receive these envelopes.
 *
 * Per ADR-CROSS-BC-SUBSCRIBER-LOCATION (slice #21): the audit-log BC is the
 * sole owner of `audit_log` writes; emission lives here, persistence in
 * `AuditLogSubscriber`.
 */
export const PHOTO_INGESTION_AUTO_FILLED_CHANNEL =
  'm3.photo-ingestion.auto-filled' as const;
export const PHOTO_INGESTION_AWAITING_REVIEW_CHANNEL =
  'm3.photo-ingestion.awaiting-review' as const;
export const PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE_CHANNEL =
  'm3.photo-ingestion.rejected-low-confidence' as const;
export const PHOTO_EXTRACTION_FAILED_CHANNEL =
  'm3.photo-ingestion.extraction-failed' as const;
export const PHOTO_INGESTION_SIGNED_CHANNEL =
  'm3.photo-ingestion.signed' as const;
export const PHOTO_INGESTION_RECLASSIFIED_CHANNEL =
  'm3.photo-ingestion.reclassified' as const;
export const HITL_RETROACTIVE_CORRECTION_CHANNEL =
  'm3.photo-ingestion.hitl-retroactive-correction' as const;

/**
 * Stub channel for the downstream-routing handshake. Slice #17a is
 * backend-only; the downstream GR-draft creator and Lot-creator consumers
 * are out of scope. We emit this lean signal whenever a row reaches
 * `auto_filled` or `signed` so a future routing slice can consume it
 * without re-classifying. Documented in tasks.md §Deferred.
 */
export const PHOTO_INGESTION_READY_FOR_ROUTING_CHANNEL =
  'm3.photo-ingestion.ready-for-routing' as const;
