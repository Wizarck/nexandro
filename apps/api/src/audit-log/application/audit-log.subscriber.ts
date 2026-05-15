import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { AgentActionExecutedEvent } from '../../cost/application/cost.events';
import { AuditLogService } from './audit-log.service';
import {
  AuditEventEnvelope,
  AuditEventType,
  AuditEventTypeName,
  LOT_EXPIRY_NEAR_CHANNEL_NAME,
  LOT_EXPIRY_NEAR_EVENT_TYPE_NAME,
} from './types';

/**
 * Single subscriber: persists one audit_log row per emitted event.
 *
 * Two payload shape conventions:
 * 1. **Legacy events** (already on the bus before this slice): published as
 *    ad-hoc shapes by cost / ingredients / recipes / supplier-items /
 *    agent-middleware. Translated to envelope per type by this subscriber.
 * 2. **New events introduced by this slice** (AI suggestions accept/reject,
 *    recipe cost rebuilt): emitter publishes the canonical
 *    `AuditEventEnvelope` shape directly; subscriber persists as-is.
 *
 * Each handler is wrapped in try/catch — a transient DB failure logs + drops
 * the row but does NOT propagate to the emitter (per ADR-AUDIT-WRITER).
 */
@Injectable()
export class AuditLogSubscriber {
  private readonly logger = new Logger(AuditLogSubscriber.name);

  constructor(private readonly auditLog: AuditLogService) {}

  // ------------- New events (envelope shape) -------------

  @OnEvent(AuditEventType.AI_SUGGESTION_ACCEPTED)
  onAiSuggestionAccepted(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.AI_SUGGESTION_ACCEPTED, payload);
  }

  @OnEvent(AuditEventType.AI_SUGGESTION_REJECTED)
  onAiSuggestionRejected(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.AI_SUGGESTION_REJECTED, payload);
  }

  @OnEvent(AuditEventType.RECIPE_COST_REBUILT)
  onRecipeCostRebuilt(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.RECIPE_COST_REBUILT, payload);
  }

  // ------------- Cost-domain channels (post-Wave-1.18 envelope shape) -------------
  //
  // Per ADR (m2-audit-log-emitter-migration Wave 1.18), the 5 cost.* channels
  // now publish AuditEventEnvelope directly from their source services. The
  // subscriber persists each as-is; per-type translation has been removed.
  // Channel-name documentation is preserved by keeping one @OnEvent per
  // channel rather than collapsing into a generic handler.

  @OnEvent(AuditEventType.INGREDIENT_OVERRIDE_CHANGED)
  onIngredientOverrideChanged(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.INGREDIENT_OVERRIDE_CHANGED, payload);
  }

  @OnEvent(AuditEventType.RECIPE_ALLERGENS_OVERRIDE_CHANGED)
  onRecipeAllergensOverrideChanged(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.RECIPE_ALLERGENS_OVERRIDE_CHANGED, payload);
  }

  @OnEvent(AuditEventType.RECIPE_SOURCE_OVERRIDE_CHANGED)
  onRecipeSourceOverrideChanged(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.RECIPE_SOURCE_OVERRIDE_CHANGED, payload);
  }

  @OnEvent(AuditEventType.RECIPE_INGREDIENT_UPDATED)
  onRecipeIngredientUpdated(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.RECIPE_INGREDIENT_UPDATED, payload);
  }

  @OnEvent(AuditEventType.SUPPLIER_PRICE_UPDATED)
  onSupplierPriceUpdated(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.SUPPLIER_PRICE_UPDATED, payload);
  }

  @OnEvent(AuditEventType.AGENT_ACTION_EXECUTED)
  onAgentActionExecuted(event: AgentActionExecutedEvent): Promise<void> {
    // Lean, request-anchored row from `AgentAuditMiddleware`. Per ADR-026
    // (Wave 1.14 m2-audit-log-forensic-split) this channel carries ONLY the
    // lean shape; rich aggregate-anchored emissions go to
    // AGENT_ACTION_FORENSIC. `aggregate_type='organization'` because the lean
    // payload has no aggregate.
    if (!event.organizationId) {
      this.logger.debug(
        `audit-log.subscriber.skipped: AGENT_ACTION_EXECUTED — no organizationId (pre-auth probe)`,
      );
      return Promise.resolve();
    }
    return this.persistTranslated(AuditEventType.AGENT_ACTION_EXECUTED, () => ({
      organizationId: event.organizationId as string,
      aggregateType: 'organization',
      aggregateId: event.organizationId as string,
      actorUserId: event.executedBy,
      actorKind: 'agent',
      agentName: event.agentName,
      payloadAfter: {
        capabilityName: event.capabilityName,
        timestamp: event.timestamp,
      },
    }));
  }

  @OnEvent(AuditEventType.AGENT_ACTION_FORENSIC)
  onAgentActionForensic(payload: AuditEventEnvelope): Promise<void> {
    // Rich, aggregate-anchored row from `BeforeAfterAuditInterceptor` (write
    // RPCs) and `AgentChatService` (chat turns; per ADR-027 streaming-handler
    // pattern). Persisted as-is — no per-type translation. See ADR-026 for
    // the channel split rationale.
    return this.persistEnvelope(AuditEventType.AGENT_ACTION_FORENSIC, payload);
  }

  // ------------- M3 channels (slice #21 m3-audit-log-hash-chain-hardening) -------------
  //
  // Per ADR-SUBSCRIBER-FAN-OUT (design.md), all M3 deferred event types are
  // wired onto this single subscriber class. Each handler is 3-5 LOC of
  // envelope mapping; the audit-log BC is the sole owner of audit_log
  // writes per ADR-CROSS-BC-SUBSCRIBER-LOCATION.

  /** Slice #1 m3-lot-aggregate — emit-side deferred to ops follow-up. */
  @OnEvent(AuditEventType.LOT_CREATED)
  onLotCreated(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.LOT_CREATED, payload);
  }

  /** Slice #1 m3-lot-aggregate — emit-side deferred to ops follow-up. */
  @OnEvent(AuditEventType.STOCK_MOVE_CREATED)
  onStockMoveCreated(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.STOCK_MOVE_CREATED, payload);
  }

  /**
   * Slice #2 m3-lot-consumption-events — `ConsumptionService.recordConsumption()`
   * emits a `LotConsumedEvent` with the slice-local inline shape:
   * `{ aggregateType: 'lot', organizationId, aggregateId, actorUserId,
   *    actorKind, eventType, payloadBefore: null, payloadAfter, createdAt }`.
   * The shape already matches `AuditEventEnvelope`; we persist as-is via
   * `persistEnvelope` (the extra `eventType` + `createdAt` fields are
   * tolerated — they're not part of the envelope contract but cause no
   * harm at persistence).
   */
  @OnEvent(AuditEventType.LOT_CONSUMED)
  onLotConsumed(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.LOT_CONSUMED, payload);
  }

  /**
   * Slice #3 m3-lot-expiry-alerts — `ExpiryScannerService.scan()` emits
   * on the shared `audit.event` channel. The payload carries
   * `payloadAfter.alert_band` to disambiguate from any other future
   * `audit.event` producer. This handler routes by the producing slice's
   * inline shape (envelope-compatible) and pins the persisted event_type
   * to `LOT_EXPIRY_NEAR`.
   */
  @OnEvent(LOT_EXPIRY_NEAR_CHANNEL_NAME)
  onLotExpiryNear(payload: AuditEventEnvelope): Promise<void> {
    // Direct persistence path that bypasses the channel→eventTypeName
    // lookup because LOT_EXPIRY_NEAR ships on the shared `audit.event`
    // channel (slice #3 ADR-EXPIRY-EVENT-CHANNEL). The persisted
    // event_type is pinned to `LOT_EXPIRY_NEAR`.
    return this.persistDirect(LOT_EXPIRY_NEAR_EVENT_TYPE_NAME, payload);
  }

  /** Slice #5 m3-cost-snapshot-persistence — already envelope-shaped. */
  @OnEvent(AuditEventType.COST_SNAPSHOT_RECORDED)
  onCostSnapshotRecorded(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.COST_SNAPSHOT_RECORDED, payload);
  }

  // ---- Slice #6 m3-po-aggregate (emit-side TBD by ops follow-up) ----

  @OnEvent(AuditEventType.PO_CREATED)
  onPoCreated(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PO_CREATED, payload);
  }

  @OnEvent(AuditEventType.PO_SENT)
  onPoSent(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PO_SENT, payload);
  }

  @OnEvent(AuditEventType.PO_RECEIVED_PARTIAL)
  onPoReceivedPartial(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PO_RECEIVED_PARTIAL, payload);
  }

  @OnEvent(AuditEventType.PO_RECEIVED_FULL)
  onPoReceivedFull(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PO_RECEIVED_FULL, payload);
  }

  @OnEvent(AuditEventType.PO_CANCELLED)
  onPoCancelled(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PO_CANCELLED, payload);
  }

  @OnEvent(AuditEventType.PO_CLOSED)
  onPoClosed(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PO_CLOSED, payload);
  }

  // ---- Slice #7 m3-gr-aggregate-reconciliation ----

  /**
   * Slice #7 emits `GrConfirmedEventPayload` (slice-local shape with
   * `grId`, `organizationId`, `poId`, `supplierId`, `receivedAt`,
   * `lines[]`). We translate to the canonical envelope: `aggregate_type
   * = 'goods_receipt'`, `aggregate_id = grId`, `payload_after` = the
   * full producing payload.
   */
  @OnEvent(AuditEventType.GR_CONFIRMED)
  onGrConfirmed(payload: unknown): Promise<void> {
    return this.persistTranslated(AuditEventType.GR_CONFIRMED, () =>
      this.translateGrPayload(payload, 'goods_receipt'),
    );
  }

  @OnEvent(AuditEventType.GR_LINE_QTY_VARIANCE)
  onGrLineQtyVariance(payload: unknown): Promise<void> {
    return this.persistTranslated(AuditEventType.GR_LINE_QTY_VARIANCE, () =>
      this.translateGrPayload(payload, 'goods_receipt_line'),
    );
  }

  @OnEvent(AuditEventType.GR_LINE_PRICE_VARIANCE)
  onGrLinePriceVariance(payload: unknown): Promise<void> {
    return this.persistTranslated(AuditEventType.GR_LINE_PRICE_VARIANCE, () =>
      this.translateGrPayload(payload, 'goods_receipt_line'),
    );
  }

  // ---- Slice #22 m3-email-dispatch-di — already envelope-shaped ----

  @OnEvent(AuditEventType.EMAIL_DISPATCHED)
  onEmailDispatched(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.EMAIL_DISPATCHED, payload);
  }

  @OnEvent(AuditEventType.EMAIL_FAILED)
  onEmailFailed(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.EMAIL_FAILED, payload);
  }

  // ---- Slice #18 m3-photo-storage-lifecycle (Wave 2.4) ----
  //
  // Per ADR-AUDIT-EMIT-EVENTS (slice #18 design.md), the photo-storage BC
  // extends this subscriber with 2 new envelope-shaped channels:
  //   - PHOTO_UPLOADED  — emitted by PhotoStorageService.registerUpload
  //   - PHOTO_DELETED   — emitted by retention cron Phase 1 + future manual
  //                       deletion. `payload_after.reason` distinguishes
  //                       'retention_90d' (actor_kind='system') from 'manual'
  //                       (actor_kind='user').
  // Retention class for both events defaults to 'operational' via
  // computeRetentionClass() — photo events are not regulatory themselves;
  // the upstream event that references the photo URL gets the regulatory
  // class.

  @OnEvent(AuditEventType.PHOTO_UPLOADED)
  onPhotoUploaded(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PHOTO_UPLOADED, payload);
  }

  @OnEvent(AuditEventType.PHOTO_DELETED)
  onPhotoDeleted(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PHOTO_DELETED, payload);
  }

  // ---- Slice #19 m3-ai-obs-budget-tier-emitter (Wave 2.4) ----
  //
  // `RollupSchedulerService.processOrg()` emits `AI_BUDGET_TIER_CROSSED`
  // already in the canonical envelope shape (per
  // `apps/api/src/ai-observability/budget/domain/events.ts` +
  // ADR-BUDGET-TIER-CROSSED-EVENT). Persist as-is via `persistEnvelope`.

  @OnEvent(AuditEventType.AI_BUDGET_TIER_CROSSED)
  onAiBudgetTierCrossed(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.AI_BUDGET_TIER_CROSSED, payload);
  }

  // ---- Slice #13 m3-recall-86-flag-dispatch (Wave 2.5) ----
  //
  // Five new event types covering the J6 + J7 recall surface. All carry
  // `aggregate_type='recall_incident'` + `aggregate_id=<incidentUuid>` so
  // the chronology projection uses the existing `ix_audit_log_aggregate`
  // index. Per ADR-RECALL-INCIDENT-VIA-AUDIT-LOG (slice #13 design.md),
  // these envelopes ARE the canonical incident record — no side table.

  @OnEvent(AuditEventType.RECALL_INVESTIGATION_OPENED)
  onRecallInvestigationOpened(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.RECALL_INVESTIGATION_OPENED, payload);
  }

  @OnEvent(AuditEventType.RECALL_86_FLAG_DISPATCHED)
  onRecall86FlagDispatched(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.RECALL_86_FLAG_DISPATCHED, payload);
  }

  @OnEvent(AuditEventType.RECALL_DOSSIER_GENERATED)
  onRecallDossierGenerated(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.RECALL_DOSSIER_GENERATED, payload);
  }

  @OnEvent(AuditEventType.RECALL_DOSSIER_REDISPATCHED)
  onRecallDossierRedispatched(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.RECALL_DOSSIER_REDISPATCHED, payload);
  }

  @OnEvent(AuditEventType.RECALL_ADDENDUM_ATTACHED)
  onRecallAddendumAttached(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.RECALL_ADDENDUM_ATTACHED, payload);
  }

  // ---- Slice #9 m3-ccp-reading-aggregate (Wave 2.6) ----
  //
  // HACCP BC emits 3 envelope-shaped channels per slice #9 design.md
  // Decision E. All carry `aggregate_type='haccp_record'` so the
  // existing `ix_audit_log_aggregate` index drives per-aggregate
  // chronology projections. Retention class is `regulatory` (EU 852/2004
  // + national APPCC chain of custody).

  @OnEvent(AuditEventType.CCP_READING_RECORDED)
  onCcpReadingRecorded(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.CCP_READING_RECORDED, payload);
  }

  @OnEvent(AuditEventType.CCP_CORRECTIVE_ACTION_RECORDED)
  onCcpCorrectiveActionRecorded(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(
      AuditEventType.CCP_CORRECTIVE_ACTION_RECORDED,
      payload,
    );
  }

  @OnEvent(AuditEventType.FSMS_STANDARD_CONFIGURED)
  onFsmsStandardConfigured(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(
      AuditEventType.FSMS_STANDARD_CONFIGURED,
      payload,
    );
  }

  // ---- Slice #14 m3-appcc-export-bundle-service (Wave 2.7) ----
  //
  // Two envelope-shaped channels emitted by BundleGeneratorService:
  //  - EXPORT_BUNDLE_GENERATED — one envelope per generated bundle
  //  - EXPORT_BUNDLE_DISPATCHED — one envelope per recipient
  // Both carry `aggregate_type='compliance_export'` + `aggregate_id=bundleId`
  // so the existing `ix_audit_log_aggregate` index drives chronology
  // projections. Retention class is `regulatory` (regulator-facing
  // dossier of the chain of custody).

  @OnEvent(AuditEventType.EXPORT_BUNDLE_GENERATED)
  onExportBundleGenerated(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.EXPORT_BUNDLE_GENERATED, payload);
  }

  @OnEvent(AuditEventType.EXPORT_BUNDLE_DISPATCHED)
  onExportBundleDispatched(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.EXPORT_BUNDLE_DISPATCHED, payload);
  }

  // ---- Slice #17a m3-photo-ingest-backend (Wave 2.8) ----
  //
  // Seven envelope-shaped channels covering the FR28-FR31 + FR44 photo
  // ingest HITL surface. All carry
  // `aggregate_type='photo_ingestion_item'` +
  // `aggregate_id=<ingestionItemUuid>`. Retention class is `regulatory` —
  // ALL llmExtraction + operatorCorrection co-stored on `payload_after`
  // per the EU AI Act forensic foundation (j12 §Decisions).

  @OnEvent(AuditEventType.PHOTO_INGESTION_AUTO_FILLED)
  onPhotoIngestionAutoFilled(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(
      AuditEventType.PHOTO_INGESTION_AUTO_FILLED,
      payload,
    );
  }

  @OnEvent(AuditEventType.PHOTO_INGESTION_AWAITING_REVIEW)
  onPhotoIngestionAwaitingReview(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(
      AuditEventType.PHOTO_INGESTION_AWAITING_REVIEW,
      payload,
    );
  }

  @OnEvent(AuditEventType.PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE)
  onPhotoIngestionRejectedLowConfidence(
    payload: AuditEventEnvelope,
  ): Promise<void> {
    return this.persistEnvelope(
      AuditEventType.PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE,
      payload,
    );
  }

  @OnEvent(AuditEventType.PHOTO_EXTRACTION_FAILED)
  onPhotoExtractionFailed(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(
      AuditEventType.PHOTO_EXTRACTION_FAILED,
      payload,
    );
  }

  @OnEvent(AuditEventType.PHOTO_INGESTION_SIGNED)
  onPhotoIngestionSigned(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.PHOTO_INGESTION_SIGNED, payload);
  }

  @OnEvent(AuditEventType.PHOTO_INGESTION_RECLASSIFIED)
  onPhotoIngestionReclassified(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(
      AuditEventType.PHOTO_INGESTION_RECLASSIFIED,
      payload,
    );
  }

  @OnEvent(AuditEventType.HITL_RETROACTIVE_CORRECTION)
  onHitlRetroactiveCorrection(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(
      AuditEventType.HITL_RETROACTIVE_CORRECTION,
      payload,
    );
  }

  // ---- M3 hardening H1a m3-photo-ingest-downstream-routing ----
  //
  // Two new envelope-shaped channels emitted by `PhotoIngestionRoutingService`:
  //  - PHOTO_INGESTION_DOWNSTREAM_ROUTED — one envelope per successful route
  //    (including idempotent re-fires that return the existing aggregate;
  //    `payload_after.alreadyRouted = true` in that case).
  //  - PHOTO_INGESTION_ROUTING_SKIPPED — one envelope per skipped route
  //    (missing critical field OR Lot/GR factory invariant violation).
  // Both carry `aggregate_type='photo_ingestion_item'` (the envelope describes
  // a decision ABOUT the ingestion item, not a state change on the downstream
  // aggregate). Retention class is `regulatory` per
  // ADR-ROUTING-AUDIT-EVENT-NAMING.

  @OnEvent(AuditEventType.PHOTO_INGESTION_DOWNSTREAM_ROUTED)
  onPhotoIngestionDownstreamRouted(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(
      AuditEventType.PHOTO_INGESTION_DOWNSTREAM_ROUTED,
      payload,
    );
  }

  @OnEvent(AuditEventType.PHOTO_INGESTION_ROUTING_SKIPPED)
  onPhotoIngestionRoutingSkipped(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(
      AuditEventType.PHOTO_INGESTION_ROUTING_SKIPPED,
      payload,
    );
  }

  // ---- m3.x-photo-ingest-downstream-revocation-listener (H1b followup) ----
  //
  // Three regulatory envelopes carrying the downstream-revocation chain of
  // custody when a signed photo-ingestion item is retro-corrected:
  //  - LOT_FLAGGED_FOR_REVIEW: aggregateType='lot', aggregateId=<lotId>
  //  - GR_FLAGGED_FOR_REVIEW: aggregateType='goods_receipt',
  //    aggregateId=<grId>
  //  - DOWNSTREAM_REVOCATION_DEFERRED: aggregateType='photo_ingestion_item',
  //    aggregateId=<itemId> — only fires when the lots/goods_receipts probe
  //    surfaces Postgres error 42703 (column does not exist), which guards
  //    against deployments that have not yet run migration 0041.

  @OnEvent(AuditEventType.LOT_FLAGGED_FOR_REVIEW)
  onLotFlaggedForReview(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.LOT_FLAGGED_FOR_REVIEW, payload);
  }

  @OnEvent(AuditEventType.GR_FLAGGED_FOR_REVIEW)
  onGrFlaggedForReview(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.GR_FLAGGED_FOR_REVIEW, payload);
  }

  @OnEvent(AuditEventType.DOWNSTREAM_REVOCATION_DEFERRED)
  onDownstreamRevocationDeferred(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(
      AuditEventType.DOWNSTREAM_REVOCATION_DEFERRED,
      payload,
    );
  }

  // Review-queue clear envelopes (m3.x-review-queue-backend):
  //  - LOT_REVIEW_CLEARED: aggregateType='lot', aggregateId=<lotId>
  //  - GR_REVIEW_CLEARED:  aggregateType='goods_receipt',
  //                         aggregateId=<grId>
  // Operator-triggered; payloadAfter carries `reviewedByUserId`,
  // `reviewedAt`, `sourcePhotoIngestionId`.
  @OnEvent(AuditEventType.LOT_REVIEW_CLEARED)
  onLotReviewCleared(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.LOT_REVIEW_CLEARED, payload);
  }

  @OnEvent(AuditEventType.GR_REVIEW_CLEARED)
  onGrReviewCleared(payload: AuditEventEnvelope): Promise<void> {
    return this.persistEnvelope(AuditEventType.GR_REVIEW_CLEARED, payload);
  }

  // ------------- Internals -------------

  /**
   * Persist directly by canonical `eventTypeName`, bypassing the
   * channel→name lookup. Used by handlers whose bus channel name does
   * NOT map 1:1 to a persisted name (slice #3 `LOT_EXPIRY_NEAR` on the
   * shared `audit.event` channel).
   */
  private async persistDirect(
    eventTypeName: string,
    envelope: unknown,
  ): Promise<void> {
    const validated = this.validateEnvelope(envelope);
    if (validated === null) {
      this.logger.warn(
        `audit-log.subscriber.skipped: ${eventTypeName} — payload missing envelope shape`,
      );
      return;
    }
    try {
      await this.auditLog.record(eventTypeName, validated);
    } catch (err) {
      this.logError(eventTypeName, validated.aggregateId, err);
    }
  }

  private async persistEnvelope(
    channel: AuditEventType,
    envelope: unknown,
  ): Promise<void> {
    const validated = this.validateEnvelope(envelope);
    if (validated === null) {
      this.logger.warn(
        `audit-log.subscriber.skipped: ${channel} — payload missing envelope shape`,
      );
      return;
    }
    try {
      await this.auditLog.record(AuditEventTypeName[channel], validated);
    } catch (err) {
      this.logError(channel, validated.aggregateId, err);
    }
  }

  /**
   * `persistTranslated` runs a slice-local translator function that maps
   * a producer-specific shape into the canonical envelope. The optional
   * `eventTypeNameOverride` lets handlers like `onLotExpiryNear` pin a
   * canonical persisted name that differs from `AuditEventTypeName[channel]`
   * (the channel is the generic bus name; the persisted event_type names
   * the actual event).
   */
  private async persistTranslated(
    channel: AuditEventType,
    translate: () => AuditEventEnvelope,
    eventTypeNameOverride?: string,
  ): Promise<void> {
    let envelope: AuditEventEnvelope;
    try {
      envelope = translate();
    } catch (err) {
      this.logError(channel, '<unknown>', err);
      return;
    }
    const eventTypeName = eventTypeNameOverride ?? AuditEventTypeName[channel];
    try {
      await this.auditLog.record(eventTypeName, envelope);
    } catch (err) {
      this.logError(channel, envelope.aggregateId, err);
    }
  }

  /**
   * Map slice #7's GR event payload (slice-local shape with `grId`,
   * `organizationId`, `lines[]`, …) into the canonical `AuditEventEnvelope`.
   * Per ADR-EVENT-ENVELOPE-SHAPE (design.md), the audit-log BC translates
   * at the subscriber boundary so the producer can keep emitting its
   * domain-natural shape.
   */
  private translateGrPayload(
    payload: unknown,
    aggregateType: 'goods_receipt' | 'goods_receipt_line',
  ): AuditEventEnvelope {
    if (!payload || typeof payload !== 'object') {
      throw new Error('GR event payload is not an object');
    }
    const p = payload as Record<string, unknown>;
    const organizationId = typeof p.organizationId === 'string' ? p.organizationId : '';
    const aggregateId =
      aggregateType === 'goods_receipt'
        ? typeof p.grId === 'string'
          ? p.grId
          : ''
        : typeof p.grLineId === 'string'
          ? p.grLineId
          : typeof p.grId === 'string'
            ? p.grId
            : '';
    if (!organizationId || !aggregateId) {
      throw new Error(
        `GR event payload missing required fields: organizationId=${organizationId} aggregateId=${aggregateId}`,
      );
    }
    return {
      organizationId,
      aggregateType,
      aggregateId,
      actorUserId: null,
      actorKind: 'system',
      payloadBefore: null,
      payloadAfter: p,
    };
  }

  private logError(channel: string, aggregateId: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(
      `audit-log.subscriber.error: ${channel} aggregate=${aggregateId} ${message}`,
    );
  }

  private validateEnvelope(payload: unknown): AuditEventEnvelope | null {
    if (!payload || typeof payload !== 'object') return null;
    const candidate = payload as Partial<AuditEventEnvelope>;
    if (
      typeof candidate.organizationId !== 'string' ||
      typeof candidate.aggregateType !== 'string' ||
      typeof candidate.aggregateId !== 'string' ||
      (candidate.actorUserId !== null && typeof candidate.actorUserId !== 'string') ||
      (candidate.actorKind !== 'user' &&
        candidate.actorKind !== 'agent' &&
        candidate.actorKind !== 'system')
    ) {
      return null;
    }
    return candidate as AuditEventEnvelope;
  }
}
