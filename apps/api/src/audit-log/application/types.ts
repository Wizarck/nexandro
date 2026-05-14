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
  // Ephemeral — lean per-request log; 90-day rolling
  AGENT_ACTION_EXECUTED: 'ephemeral',
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
