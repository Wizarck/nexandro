import type { AuditActorKind } from '../domain/audit-log.entity.js';

/**
 * Canonical event-type constants. The values match the existing channel names
 * already in use across the bus (defined in `cost/application/cost.events.ts`)
 * so the AuditLogSubscriber listens on the same channels existing subscribers
 * (cost.service rollup rebuild, labels.service cache invalidation,
 * dashboard.service cache invalidation) already use. New events introduced by
 * THIS slice (ai-suggestion accept/reject + recipe cost rebuilt) follow a
 * `<bc>.<verb>` convention.
 *
 * The set is open — adding a new event in M3+ is one constant + one
 * `@OnEvent` handler in `AuditLogSubscriber`. The DB column is
 * `text NOT NULL CHECK (length 1..100)` rather than an enum, so extending the
 * set requires no migration.
 */
export const AuditEventType = {
  // ---- M2 (Waves 1.9 - 1.18) ----
  AI_SUGGESTION_ACCEPTED: 'ai-suggestions.accepted',
  AI_SUGGESTION_REJECTED: 'ai-suggestions.rejected',
  INGREDIENT_OVERRIDE_CHANGED: 'cost.ingredient-override-changed',
  RECIPE_ALLERGENS_OVERRIDE_CHANGED: 'cost.recipe-allergens-override-changed',
  RECIPE_SOURCE_OVERRIDE_CHANGED: 'cost.recipe-source-override-changed',
  RECIPE_INGREDIENT_UPDATED: 'cost.recipe-ingredient-updated',
  RECIPE_COST_REBUILT: 'cost.recipe-cost-rebuilt',
  SUPPLIER_PRICE_UPDATED: 'cost.supplier-price-updated',
  AGENT_ACTION_EXECUTED: 'agent.action-executed',
  AGENT_ACTION_FORENSIC: 'agent.action-forensic',
  // ---- M3 (Waves 2.1 - 2.2 — wired by slice #21 cross-cutting) ----
  LOT_CREATED: 'm3.inventory.lot-created',
  STOCK_MOVE_CREATED: 'm3.inventory.stock-move-created',
  LOT_CONSUMED: 'm3.inventory.lot-consumed',
  COST_SNAPSHOT_RECORDED: 'cost.cost-snapshot-recorded',
  PO_CREATED: 'procurement-po.created',
  PO_SENT: 'procurement-po.sent',
  PO_RECEIVED_PARTIAL: 'procurement-po.received-partial',
  PO_RECEIVED_FULL: 'procurement-po.received-full',
  PO_CANCELLED: 'procurement-po.cancelled',
  PO_CLOSED: 'procurement-po.closed',
  GR_CONFIRMED: 'procurement-gr.confirmed',
  GR_LINE_QTY_VARIANCE: 'procurement-gr.line-qty-variance',
  GR_LINE_PRICE_VARIANCE: 'procurement-gr.line-price-variance',
  EMAIL_DISPATCHED: 'shared.email.dispatched',
  EMAIL_FAILED: 'shared.email.failed',
  // ---- Slice #18 m3-photo-storage-lifecycle (Wave 2.4) ----
  PHOTO_UPLOADED: 'm3.photo-storage.photo-uploaded',
  PHOTO_DELETED: 'm3.photo-storage.photo-deleted',
  // ---- Slice #19 m3-ai-obs-budget-tier-emitter (Wave 2.4) ----
  AI_BUDGET_TIER_CROSSED: 'ai-observability.budget-tier-crossed',
  // ---- Slice #13 m3-recall-86-flag-dispatch (Wave 2.5) ----
  RECALL_INVESTIGATION_OPENED: 'recall.investigation-opened',
  RECALL_86_FLAG_DISPATCHED: 'recall.86-flag-dispatched',
  RECALL_DOSSIER_GENERATED: 'recall.dossier-generated',
  RECALL_DOSSIER_REDISPATCHED: 'recall.dossier-redispatched',
  RECALL_ADDENDUM_ATTACHED: 'recall.addendum-attached',
  // ---- Slice #9 m3-ccp-reading-aggregate (Wave 2.6) ----
  CCP_READING_RECORDED: 'haccp.ccp-reading-recorded',
  CCP_CORRECTIVE_ACTION_RECORDED: 'haccp.corrective-action-recorded',
  FSMS_STANDARD_CONFIGURED: 'haccp.fsms-standard-configured',
  // ---- Slice #14 m3-appcc-export-bundle-service (Wave 2.7) ----
  EXPORT_BUNDLE_GENERATED: 'compliance.export-bundle-generated',
  EXPORT_BUNDLE_DISPATCHED: 'compliance.export-bundle-dispatched',
  // ---- Slice #17a m3-photo-ingest-backend (Wave 2.8) ----
  PHOTO_INGESTION_AUTO_FILLED: 'm3.photo-ingestion.auto-filled',
  PHOTO_INGESTION_AWAITING_REVIEW: 'm3.photo-ingestion.awaiting-review',
  PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE: 'm3.photo-ingestion.rejected-low-confidence',
  PHOTO_EXTRACTION_FAILED: 'm3.photo-ingestion.extraction-failed',
  PHOTO_INGESTION_SIGNED: 'm3.photo-ingestion.signed',
  PHOTO_INGESTION_RECLASSIFIED: 'm3.photo-ingestion.reclassified',
  HITL_RETROACTIVE_CORRECTION: 'm3.photo-ingestion.hitl-retroactive-correction',
  // ---- M3 hardening H1a m3-photo-ingest-downstream-routing ----
  PHOTO_INGESTION_DOWNSTREAM_ROUTED: 'm3.photo-ingestion.downstream-routed',
  PHOTO_INGESTION_ROUTING_SKIPPED: 'm3.photo-ingestion.routing-skipped',
  // ---- m3.x-photo-ingest-downstream-revocation-listener (H1b followup) ----
  LOT_FLAGGED_FOR_REVIEW: 'm3.inventory.lot-flagged-for-review',
  GR_FLAGGED_FOR_REVIEW: 'm3.procurement.gr-flagged-for-review',
  DOWNSTREAM_REVOCATION_DEFERRED: 'm3.photo-ingestion.downstream-revocation-deferred',
  // ---- m3.x-review-queue-backend (manual operator clear) ----
  LOT_REVIEW_CLEARED: 'm3.inventory.lot-review-cleared',
  GR_REVIEW_CLEARED: 'm3.procurement.gr-review-cleared',
  // ---- m3.x-requires-review-clear-cron (stale-notifier; no auto-clear) ----
  REVIEW_QUEUE_STALE_AGGREGATES: 'm3.review-queue.stale-aggregates',
  // ---- m3.x-audit-log-archival (daily cold-storage batch) ----
  AUDIT_LOG_ARCHIVAL_BATCH: 'm3.audit-log.archival-batch',
} as const;

/**
 * The audit log canonicalises each event-type channel into a stable, public
 * `event_type` string stored on the audit row. Persisting the bus channel name
 * directly would leak module structure (e.g. `cost.ingredient-override-changed`
 * implies the cost module owns ingredient overrides, which is incorrect).
 * The persisted name lives in `AuditEventTypeName`.
 */
export const AuditEventTypeName: Record<AuditEventType, string> = {
  // ---- M2 ----
  'ai-suggestions.accepted': 'AI_SUGGESTION_ACCEPTED',
  'ai-suggestions.rejected': 'AI_SUGGESTION_REJECTED',
  'cost.ingredient-override-changed': 'INGREDIENT_OVERRIDE_CHANGED',
  'cost.recipe-allergens-override-changed': 'RECIPE_ALLERGENS_OVERRIDE_CHANGED',
  'cost.recipe-source-override-changed': 'RECIPE_SOURCE_OVERRIDE_CHANGED',
  'cost.recipe-ingredient-updated': 'RECIPE_INGREDIENT_UPDATED',
  'cost.recipe-cost-rebuilt': 'RECIPE_COST_REBUILT',
  'cost.supplier-price-updated': 'SUPPLIER_PRICE_UPDATED',
  'agent.action-executed': 'AGENT_ACTION_EXECUTED',
  'agent.action-forensic': 'AGENT_ACTION_FORENSIC',
  // ---- M3 ----
  'm3.inventory.lot-created': 'LOT_CREATED',
  'm3.inventory.stock-move-created': 'STOCK_MOVE_CREATED',
  'm3.inventory.lot-consumed': 'LOT_CONSUMED',
  'cost.cost-snapshot-recorded': 'COST_SNAPSHOT_RECORDED',
  'procurement-po.created': 'PO_CREATED',
  'procurement-po.sent': 'PO_SENT',
  'procurement-po.received-partial': 'PO_RECEIVED_PARTIAL',
  'procurement-po.received-full': 'PO_RECEIVED_FULL',
  'procurement-po.cancelled': 'PO_CANCELLED',
  'procurement-po.closed': 'PO_CLOSED',
  'procurement-gr.confirmed': 'GR_CONFIRMED',
  'procurement-gr.line-qty-variance': 'GR_LINE_QTY_VARIANCE',
  'procurement-gr.line-price-variance': 'GR_LINE_PRICE_VARIANCE',
  'shared.email.dispatched': 'EMAIL_DISPATCHED',
  'shared.email.failed': 'EMAIL_FAILED',
  // ---- Slice #18 m3-photo-storage-lifecycle ----
  'm3.photo-storage.photo-uploaded': 'PHOTO_UPLOADED',
  'm3.photo-storage.photo-deleted': 'PHOTO_DELETED',
  // ---- Slice #19 m3-ai-obs-budget-tier-emitter ----
  'ai-observability.budget-tier-crossed': 'AI_BUDGET_TIER_CROSSED',
  // ---- Slice #13 m3-recall-86-flag-dispatch ----
  'recall.investigation-opened': 'RECALL_INVESTIGATION_OPENED',
  'recall.86-flag-dispatched': 'RECALL_86_FLAG_DISPATCHED',
  'recall.dossier-generated': 'RECALL_DOSSIER_GENERATED',
  'recall.dossier-redispatched': 'RECALL_DOSSIER_REDISPATCHED',
  'recall.addendum-attached': 'RECALL_ADDENDUM_ATTACHED',
  // ---- Slice #9 m3-ccp-reading-aggregate ----
  'haccp.ccp-reading-recorded': 'CCP_READING_RECORDED',
  'haccp.corrective-action-recorded': 'CCP_CORRECTIVE_ACTION_RECORDED',
  'haccp.fsms-standard-configured': 'FSMS_STANDARD_CONFIGURED',
  // ---- Slice #14 m3-appcc-export-bundle-service ----
  'compliance.export-bundle-generated': 'EXPORT_BUNDLE_GENERATED',
  'compliance.export-bundle-dispatched': 'EXPORT_BUNDLE_DISPATCHED',
  // ---- Slice #17a m3-photo-ingest-backend ----
  'm3.photo-ingestion.auto-filled': 'PHOTO_INGESTION_AUTO_FILLED',
  'm3.photo-ingestion.awaiting-review': 'PHOTO_INGESTION_AWAITING_REVIEW',
  'm3.photo-ingestion.rejected-low-confidence': 'PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE',
  'm3.photo-ingestion.extraction-failed': 'PHOTO_EXTRACTION_FAILED',
  'm3.photo-ingestion.signed': 'PHOTO_INGESTION_SIGNED',
  'm3.photo-ingestion.reclassified': 'PHOTO_INGESTION_RECLASSIFIED',
  'm3.photo-ingestion.hitl-retroactive-correction': 'HITL_RETROACTIVE_CORRECTION',
  // ---- M3 hardening H1a m3-photo-ingest-downstream-routing ----
  'm3.photo-ingestion.downstream-routed': 'PHOTO_INGESTION_DOWNSTREAM_ROUTED',
  'm3.photo-ingestion.routing-skipped': 'PHOTO_INGESTION_ROUTING_SKIPPED',
  // ---- m3.x-photo-ingest-downstream-revocation-listener (H1b followup) ----
  'm3.inventory.lot-flagged-for-review': 'LOT_FLAGGED_FOR_REVIEW',
  'm3.procurement.gr-flagged-for-review': 'GR_FLAGGED_FOR_REVIEW',
  'm3.photo-ingestion.downstream-revocation-deferred': 'DOWNSTREAM_REVOCATION_DEFERRED',
  // ---- m3.x-review-queue-backend (manual operator clear) ----
  'm3.inventory.lot-review-cleared': 'LOT_REVIEW_CLEARED',
  'm3.procurement.gr-review-cleared': 'GR_REVIEW_CLEARED',
  // ---- m3.x-requires-review-clear-cron (stale-notifier) ----
  'm3.review-queue.stale-aggregates': 'REVIEW_QUEUE_STALE_AGGREGATES',
  // ---- m3.x-audit-log-archival (daily cold-storage batch) ----
  'm3.audit-log.archival-batch': 'AUDIT_LOG_ARCHIVAL_BATCH',
};

/**
 * `LOT_EXPIRY_NEAR` ships per-row on the shared `audit.event` channel
 * emitted by `ExpiryScannerService.scan()` per slice #3
 * `m3-lot-expiry-alerts`. The envelope's `payloadAfter.alert_band`
 * disambiguates from any other future `audit.event` consumer. Slice #21
 * wires a generic `@OnEvent('audit.event')` handler that uses the
 * payload's eventType marker when present, otherwise defaults to
 * `LOT_EXPIRY_NEAR` (the only registered producer at slice #21 land
 * time).
 */
export const LOT_EXPIRY_NEAR_CHANNEL_NAME = 'audit.event' as const;
export const LOT_EXPIRY_NEAR_EVENT_TYPE_NAME = 'LOT_EXPIRY_NEAR' as const;

/**
 * Per ADR-AUDIT-RETENTION-CLASS (design.md, m3-audit-log-hash-chain-hardening
 * slice #21), every `audit_log` row carries a derived retention class. The
 * class is computed at write time from a lookup table keyed on event type
 * and pinned in the row so downstream cold-storage archival follow-ups
 * (M3.x) can partition by class.
 */
export type RetentionClass = 'regulatory' | 'operational' | 'ephemeral';
export const RETENTION_CLASSES: readonly RetentionClass[] = [
  'regulatory',
  'operational',
  'ephemeral',
];

/**
 * Retention windows in days, keyed by retention class. Consumed by the
 * `AuditLogArchivalScanner` (m3.x-audit-log-archival) to decide which
 * rows have aged past their hot-retention window and are eligible for
 * cold-storage archival on each daily tick.
 *
 *  - `regulatory` — 7 years (HACCP / EU 178/2002 + traceability chain of
 *    custody). 2555 days = 7 × 365.
 *  - `operational` — 1 year (default for everything else). Hot only;
 *    older rows go to cold storage.
 *  - `ephemeral` — 90 days rolling (lean per-request agent action log).
 */
export const AUDIT_RETENTION_DAYS: Record<RetentionClass, number> = {
  regulatory: 2555,
  operational: 365,
  ephemeral: 90,
};

/**
 * Lookup table from canonical event-type name to retention class. Events
 * with regulatory footprint (HACCP + EU 178/2002 + traceability) are
 * pinned `regulatory`; the lean agent-action request audit is pinned
 * `ephemeral` (90-day rolling); everything else defaults to `operational`
 * (7-year hot only).
 *
 * The fallback for an unknown event-type name is `operational` —
 * `computeRetentionClass()` MUST NOT throw on unknown event types because
 * the audit log accepts open-set event types per ADR-025.
 */
const RETENTION_BY_EVENT_NAME: Record<string, RetentionClass> = {
  // Regulatory — chain-of-custody / traceability footprint
  AGENT_ACTION_FORENSIC: 'regulatory',
  LOT_CONSUMED: 'regulatory',
  LOT_EXPIRY_NEAR: 'regulatory',
  GR_CONFIRMED: 'regulatory',
  COST_SNAPSHOT_RECORDED: 'regulatory',
  PO_RECEIVED_FULL: 'regulatory',
  PO_RECEIVED_PARTIAL: 'regulatory',
  LOT_CREATED: 'regulatory',
  STOCK_MOVE_CREATED: 'regulatory',
  // Recall envelopes — regulator-facing chain of custody.
  RECALL_INVESTIGATION_OPENED: 'regulatory',
  RECALL_86_FLAG_DISPATCHED: 'regulatory',
  RECALL_DOSSIER_GENERATED: 'regulatory',
  RECALL_DOSSIER_REDISPATCHED: 'regulatory',
  RECALL_ADDENDUM_ATTACHED: 'regulatory',
  // HACCP envelopes — EU 852/2004 + national APPCC chain of custody.
  CCP_READING_RECORDED: 'regulatory',
  CCP_CORRECTIVE_ACTION_RECORDED: 'regulatory',
  FSMS_STANDARD_CONFIGURED: 'regulatory',
  // APPCC export envelopes — regulator-facing dossier of the chain of custody.
  EXPORT_BUNDLE_GENERATED: 'regulatory',
  EXPORT_BUNDLE_DISPATCHED: 'regulatory',
  // Photo-ingestion envelopes — EU AI Act forensic chain of custody +
  // FR28-FR31 HITL audit trail. Both llmExtraction + operatorCorrection
  // are carried in `payload_after`.
  PHOTO_INGESTION_AUTO_FILLED: 'regulatory',
  PHOTO_INGESTION_AWAITING_REVIEW: 'regulatory',
  PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE: 'regulatory',
  PHOTO_EXTRACTION_FAILED: 'regulatory',
  PHOTO_INGESTION_SIGNED: 'regulatory',
  PHOTO_INGESTION_RECLASSIFIED: 'regulatory',
  HITL_RETROACTIVE_CORRECTION: 'regulatory',
  // Photo-ingestion routing envelopes — system-anchored decisions connecting
  // operator-signed extraction to downstream Lot / GR-draft creation. Both
  // are part of the EU AI Act chain of custody per
  // ADR-ROUTING-AUDIT-EVENT-NAMING (M3 hardening H1a).
  PHOTO_INGESTION_DOWNSTREAM_ROUTED: 'regulatory',
  PHOTO_INGESTION_ROUTING_SKIPPED: 'regulatory',
  // Downstream revocation envelopes — flips `requires_review=true` on a
  // Lot or GR draft whose source photo-ingestion item was retro-corrected
  // (m3.x-photo-ingest-downstream-revocation-listener). All three regulatory
  // per EU AI Act chain-of-custody.
  LOT_FLAGGED_FOR_REVIEW: 'regulatory',
  GR_FLAGGED_FOR_REVIEW: 'regulatory',
  DOWNSTREAM_REVOCATION_DEFERRED: 'regulatory',
  // Review-queue clear envelopes — operator marked a flagged Lot / GR
  // as reviewed (m3.x-review-queue-backend). Regulatory per EU AI Act
  // chain-of-custody: the clear is itself an attested operator decision
  // that closes the loop on the prior FLAGGED_FOR_REVIEW envelope.
  LOT_REVIEW_CLEARED: 'regulatory',
  GR_REVIEW_CLEARED: 'regulatory',
  // Ephemeral — lean per-request log; 90-day rolling
  AGENT_ACTION_EXECUTED: 'ephemeral',
  // Operational — daily archival batch summary; 1-year hot retention.
  // The envelope is itself written to audit_log with retention_class
  // = 'operational' so the archival run is observable via the same
  // query surface as every other operational event.
  AUDIT_LOG_ARCHIVAL_BATCH: 'operational',
};

/**
 * Compute the retention class for an `audit_log` row at write time. Pure
 * function; defaults to `'operational'` for unknown event type names so
 * adding a new event in M3+ does NOT require a code change to the
 * subscriber's retention-promotion path — the slice owner promotes their
 * event to regulatory by editing this map.
 */
export function computeRetentionClass(eventTypeName: string): RetentionClass {
  return RETENTION_BY_EVENT_NAME[eventTypeName] ?? 'operational';
}

export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];

/** All known audit event-type strings (for validation + iteration in tests). */
export const AUDIT_EVENT_TYPES = Object.values(AuditEventType);

/**
 * Typed envelope for emitting auditable events. Bounded contexts publish this
 * shape on `EventEmitter2` under one of `AuditEventType.*`. The subscriber
 * maps it to an `audit_log` row without per-event-type translation logic.
 */
export interface AuditEventEnvelope<TBefore = unknown, TAfter = unknown> {
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string | null;
  actorKind: AuditActorKind;
  agentName?: string;
  payloadBefore?: TBefore | null;
  payloadAfter?: TAfter | null;
  reason?: string;
  citationUrl?: string;
  snippet?: string;
  /** Sliding-24h dedup key per m3.x-audit-log-idempotency-required-mode; producers opt in per call site. */
  idempotencyKey?: string;
}

/** Filter shape consumed by `AuditLogService.query`. */
export interface AuditLogFilter {
  organizationId: string;
  aggregateType?: string;
  aggregateId?: string;
  eventTypes?: string[];
  actorUserId?: string;
  actorKind?: AuditActorKind;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
  /**
   * Optional full-text search term. When set, `query()` adds an OR'd
   * dual-config (Spanish + English) WHERE clause backed by the
   * `ix_audit_log_fts_es` + `ix_audit_log_fts_en` GIN indexes, and replaces
   * the default `created_at DESC` ordering with
   * `GREATEST(ts_rank_es, ts_rank_en) DESC, created_at DESC`. Length is
   * enforced at the DTO (≤200 chars).
   */
  q?: string;
}

export interface AuditLogPage<T> {
  rows: T[];
  total: number;
  limit: number;
  offset: number;
}
