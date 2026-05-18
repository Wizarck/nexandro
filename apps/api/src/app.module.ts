import { join } from 'path';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './database-options';
import { HealthModule } from './health/health.module';
import { AgentChatModule } from './agent-chat/agent-chat.module';
import { AgentCredentialsModule } from './agent-credentials/agent-credentials.module';
import { AiObservabilityModule } from './ai-observability/ai-observability.module';
import { AiSuggestionsModule } from './ai-suggestions/ai-suggestions.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { BrandAssetsModule } from './brand-assets/brand-assets.module';
import { ComplianceExportModule } from './compliance-export/compliance-export.module';
import { CostModule } from './cost/cost.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EmailDispatchModule } from './shared/email-dispatch/email-dispatch.module';
import { ExternalCatalogModule } from './external-catalog/external-catalog.module';
import { IamModule } from './iam/iam.module';
import { IngredientsModule } from './ingredients/ingredients.module';
import { InventoryModule } from './inventory/inventory.module';
import { CostSnapshotModule } from './inventory/cost/snapshot/cost-snapshot.module';
import { LabelsModule } from './labels/labels.module';
import { MenusModule } from './menus/menus.module';
import { PhotoStorageModule } from './photo-storage/photo-storage.module';
import { PrivacyModule } from './privacy/privacy.module';
import { PhotoIngestionModule } from './photo-ingestion/photo-ingestion.module';
import { PhotoIngestionRoutingModule } from './photo-ingestion-routing/photo-ingestion-routing.module';
import { PhotoIngestionRevocationModule } from './photo-ingestion-revocation/photo-ingestion-revocation.module';
import { ReviewQueueModule } from './review-queue/review-queue.module';
import { ProcurementModule } from './procurement/procurement.module';
import { HaccpModule } from './haccp/haccp.module';
import { I18nM3ExportModule } from './i18n/m3-export/i18n.module';
import { RecallModule } from './recall/recall.module';
import { RecipesModule } from './recipes/recipes.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { AgentCapabilityGuard } from './shared/guards/agent-capability.guard';
import { RolesGuard } from './shared/guards/roles.guard';
import { AuditInterceptor } from './shared/interceptors/audit.interceptor';
import { BeforeAfterAuditInterceptor } from './shared/interceptors/before-after-audit.interceptor';
import { AgentAuditMiddleware } from './shared/middleware/agent-audit.middleware';
import { AgentSignatureMiddleware } from './shared/middleware/agent-signature.middleware';
import { DemoAuthMiddleware } from './shared/middleware/demo-auth.middleware';
import { IdempotencyMiddleware } from './shared/middleware/idempotency.middleware';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    // m3.x-app-bootstrap-and-vps-deploy slice §1.3 + ADR-BOOTSTRAP-FORROOT-IN-APP-MODULE:
    // Single shared DataSource resolved at app root from DATABASE_URL. Every BC
    // module's TypeOrmModule.forFeature([...]) call below depends on this. The
    // factory is the single source of truth shared with the migrations CLI
    // (apps/api/src/data-source.ts).
    TypeOrmModule.forRootAsync({ useFactory: buildDataSourceOptions }),

    // m3.x-app-bootstrap-and-vps-deploy slice §1.12 + ADR-SINGLE-IMAGE-OMNIBUS:
    // Serve the Vite-built SPA from the same Node process. The relative
    // join works in both dev (apps/api/dist/... → apps/web/dist) and the
    // omnibus container (/app/api/dist/... → /app/web/dist). Backend routes
    // (/api/*) and the health endpoint (/health) are excluded so they reach
    // their real handlers. Per ADR-028 in docs/architecture-decisions.md.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/{*splat}', '/health', '/static/{*splat}'],
      serveStaticOptions: {
        // index.html → no-cache so future deploys are immediately visible
        // (no manual Cloudflare purge required). /assets/* → Vite emits
        // content-hashed filenames → cache-immutable for 1 year.
        setHeaders: (res: { setHeader: (k: string, v: string) => void }, p: string) => {
          if (p.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          } else if (p.includes('/assets/') || p.includes('\\assets\\')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      },
    }),

    // Static-file mount for the local-fs brand-asset storage adapter
    // (`NEXANDRO_BRAND_ASSET_STORAGE=local`, default). Serves whatever lives
    // under NEXANDRO_BRAND_ASSET_LOCAL_DIR at NEXANDRO_BRAND_ASSET_PUBLIC_URL_BASE.
    // No-op (404) when the dir doesn't exist yet (no upload happened). The S3
    // adapter bypasses this entirely — its public URLs point at the bucket's
    // own CDN/host.
    ServeStaticModule.forRoot({
      rootPath: process.env.NEXANDRO_BRAND_ASSET_LOCAL_DIR ?? '/var/lib/nexandro/brand-marks',
      serveRoot: process.env.NEXANDRO_BRAND_ASSET_PUBLIC_URL_BASE ?? '/static/brand-marks',
      serveStaticOptions: {
        fallthrough: true,
        setHeaders: (res: { setHeader: (k: string, v: string) => void }) => {
          // Brand marks are re-uploaded rarely; cache 1h at the edge but allow
          // revalidation. The upload URL is cache-busted with ?v=<ts> anyway.
          res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
        },
      },
    }),

    // m3.x-app-bootstrap-and-vps-deploy slice §1.10: /health endpoint
    // mounted at root (excluded from /api prefix in main.ts).
    HealthModule,

    EventEmitterModule.forRoot(),

    // M3 Wave 2.2 — m3-lot-expiry-alerts (slice #3): registers cron
    // discovery at the app root so `@Cron`-decorated providers across
    // feature modules (`ExpiryScannerService`, `OffSyncService`, etc)
    // share the same scheduler. Idempotent: NestJS deduplicates the
    // forRoot import — feature modules MAY still `imports: [ScheduleModule]`
    // for type hints but the root registration is canonical.
    ScheduleModule.forRoot(),

    // m2-mcp-write-capabilities (Wave 1.13): @Global() module exporting
    // AuditResolverRegistry + AgentIdempotencyService + the
    // AgentIdempotencyKey TypeORM repo. Reachable from every module's DI
    // graph without explicit imports.
    SharedModule,

    // M1 Foundation
    IamModule,
    IngredientsModule,
    SuppliersModule,

    // M2 Foundation (m2-data-model — schema only; controllers land in m2-recipes-core, m2-cost-rollup, etc.)
    RecipesModule,
    MenusModule,

    // M2 cost rollup + audit (m2-cost-rollup-and-audit — owns the InventoryCostResolver binding).
    CostModule,

    // M2 OFF mirror (m2-off-mirror — local mirror + REST fallback for Open Food Facts).
    ExternalCatalogModule,

    // M2 Owner dashboard (m2-owner-dashboard — Journey 3 read-only ranking endpoint).
    DashboardModule,

    // M2 labels (m2-labels-rendering — EU 1169/2011 PDF + PrintAdapter abstraction).
    LabelsModule,

    // Brand-mark uploads (Owner settings UX — Master review 2026-05-18).
    // Storage adapter env-gated: `NEXANDRO_BRAND_ASSET_STORAGE=local` (default,
    // writes to /var/lib/nexandro/brand-marks volume) or `=s3` (R2/AWS/MinIO).
    // Static-file serving for the local-fs mode is wired further down in this
    // same imports[] via a second ServeStaticModule.forRoot() call.
    BrandAssetsModule,

    // M2 AI yield + waste suggestions (m2-ai-yield-suggestions — provider + iron-rule guard + chef override).
    AiSuggestionsModule,

    // M2 canonical audit log (m2-audit-log — single audit_log table; @OnEvent subscriber across BCs).
    AuditLogModule,

    // m2-mcp-agent-chat-widget (Wave 1.13 [3b]): SSE relay to Hermes' web_via_http_sse platform.
    // Feature-flagged on NEXANDRO_AGENT_ENABLED — endpoint returns 404 when off.
    AgentChatModule,

    // m2-mcp-agent-registry-bench (Wave 1.13 [3c]): per-org Ed25519 agent
    // credential registry. Owner-only REST surface for create/list/revoke
    // /delete; the AgentSignatureMiddleware (also wired in this slice via
    // SharedModule) verifies signatures against rows from this table.
    AgentCredentialsModule,

    // M3 inventory foundation (m3-lot-aggregate, Wave 2.1, slice #1):
    // Lot + StockMove entities, repository (read-only public surface), factory.
    // Foundation for FR4 (lot generation, slice #7), FR6 (consumption, slice #2),
    // FR7 (cost resolver, slice #4), FR8 (expiry alerts, slice #3), recall trace
    // (slices #11-13). Mutation flows reserved for downstream slices.
    InventoryModule,

    // M3 cost snapshot persistence (m3-cost-snapshot-persistence, Wave 2.2, slice #5):
    // Append-only cost_snapshots ledger + CostSnapshotService write path + the
    // @OnEvent('inventory.lot-consumed') subscriber that bridges slice #2's
    // emitter into the slice #4 resolver and persists one snapshot per
    // consumption (per ADR-SNAPSHOT-IMMUTABLE + REQ-SS-1). The
    // INVENTORY_COST_RESOLVER DI token is bound inside this module with a
    // placeholder that throws at runtime; slice #4's merge replaces it with
    // the FIFO/FEFO implementation. Audit-log subscriber registration for
    // COST_SNAPSHOT_RECORDED is reserved for slice #21 per
    // ADR-SNAPSHOT-NO-EMIT-HERE.
    CostSnapshotModule,

    // M3 AI observability (m3-vision-llm-provider-di-otel, Wave 2.1, slice #16):
    // OTel SDK + tracer service + global span-enricher interceptor (nexandro.tag)
    // + vision-LLM provider DI surface (3 adapter stubs throw NotImplementedError;
    // real implementations land in slice #17a m3-photo-ingest-backend).
    // Downstream consumers: slice #17a (photo ingest), slice #19 (rollup + budget),
    // slice #20 (dashboard UI).
    AiObservabilityModule,

    // M3 email dispatch infrastructure (m3-email-dispatch-di, Wave 2.1, slice #22):
    // Provider-agnostic EmailDispatchService DI token + 3 adapters
    // (SMTP default / SendGrid Enterprise / Postmark lazy-imported)
    // + 3-retry exponential backoff + failure alerter cascade.
    // Consumed by slices #13 (recall dossier), #15 (APPCC export),
    // #19 (AI budget tier alerts) per ADR-039.
    EmailDispatchModule,

    // M3 procurement (Wave 2.2, slices #6 m3-po-aggregate + #7 m3-gr-aggregate-
    // reconciliation): PurchaseOrder + PurchaseOrderLine + state machine + PO
    // counter, plus GoodsReceipt aggregate + Lot creation seam + variance
    // events. GR confirmation is the single code path that materialises new
    // `lots` rows in M3. PO/GR state-transition integration gated behind
    // `M3_PO_AGGREGATE_ENABLED=true` env flag (ADR-GR-PO-STATE-TRANSITION).
    // Operator UI for slice #8 m3-procurement-ui; audit-log emission for
    // slice #21 m3-audit-log-hash-chain-hardening.
    ProcurementModule,

    // M3 photo storage lifecycle (m3-photo-storage-lifecycle, Wave 2.4, slice #18):
    // S3-compat object storage (MinIO local / S3 production) + inline AWS Sigv4
    // pre-signed URLs (1h upload, 24h read) + 90-day retention via daily 03:00 UTC
    // cron (2-phase soft-then-hard delete with 7-day grace) + audit_log linking
    // via PHOTO_UPLOADED + PHOTO_DELETED events on the slice-#21 subscriber.
    // Backend-only; downstream UX consumers are slice #17 (photo-ingest HITL),
    // #13 (recall dossier signed URLs), #15 (APPCC export bundle).
    PhotoStorageModule,

    // M3 photo-ingestion BC (m3-photo-ingest-backend, Wave 2.8, slice #17a):
    // vision-LLM extraction (slice #16 VISION_LLM_PROVIDER) + ADR-034
    // confidence-band classifier (0.85/0.60 inclusive thresholds, code-level
    // locked) + HITL queue persistence on `photo_ingestion_items`. Seven
    // new audit envelopes (PHOTO_INGESTION_AUTO_FILLED,
    // PHOTO_INGESTION_AWAITING_REVIEW, PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE,
    // PHOTO_EXTRACTION_FAILED, PHOTO_INGESTION_SIGNED,
    // PHOTO_INGESTION_RECLASSIFIED, HITL_RETROACTIVE_CORRECTION) all
    // `retention_class='regulatory'`. Three MCP write capabilities (ingest-
    // invoice-photo, ingest-product-photo, sign-photo-ingestion). Consumes
    // slice #18 PhotoStorageService for signed read URLs. The j12 UI surface
    // (PhotoViewer, HitlReviewQueue, BoundingBoxOverlay) lives in slice #17b
    // (m3-photo-review-ui, parallel sibling). Downstream routing chain
    // (GR-draft / Lot creation) materialized by `PhotoIngestionRoutingModule`
    // (M3 hardening H1a, immediately below).
    PhotoIngestionModule,

    // M3 hardening H1a photo-ingestion-routing BC
    // (m3-photo-ingest-downstream-routing): backend wire that subscribes
    // to PHOTO_INGESTION_SIGNED and materializes the downstream aggregate
    // — Lot row for `kind='product'` (inventory BC), GoodsReceipt draft
    // for `kind='invoice'` (procurement BC). Idempotent via two new
    // `source_photo_ingestion_id` columns + UNIQUE partial indexes
    // (migration 0040) per ADR-DOWNSTREAM-ROUTING-IDEMPOTENCY. Two new
    // audit envelopes (PHOTO_INGESTION_DOWNSTREAM_ROUTED,
    // PHOTO_INGESTION_ROUTING_SKIPPED) both `retention_class='regulatory'`
    // per ADR-ROUTING-AUDIT-EVENT-NAMING. Missing critical fields fail
    // open: emit SKIPPED + halt (no throw) per ADR-FIELD-MAPPING-FAIL-OPEN.
    PhotoIngestionRoutingModule,

    // M3 hardening followup `m3.x-photo-ingest-downstream-revocation-listener`:
    // listens on `HITL_RETROACTIVE_CORRECTION` (emitted by H1b's
    // `RetroactiveCorrectionService`) and flips `requires_review=true` on
    // every downstream Lot / GR-draft row whose `source_photo_ingestion_id`
    // matches the corrected ingestion item. Three new regulatory audit
    // envelopes (LOT_FLAGGED_FOR_REVIEW, GR_FLAGGED_FOR_REVIEW,
    // DOWNSTREAM_REVOCATION_DEFERRED). Per ADR-NEVER-AUTO-CASCADE-DOWNSTREAM
    // the downstream snapshot is NOT mutated — operator review required.
    PhotoIngestionRevocationModule,

    // M3 review-queue BC (m3.x-review-queue-backend): operator-facing
    // read + clear API for downstream Lot + GR rows the revocation
    // listener flagged. GET /m3/review-queue + POST
    // /m3/review-queue/:aggregateType/:aggregateId/clear. Emits
    // LOT_REVIEW_CLEARED / GR_REVIEW_CLEARED audit envelopes on manual
    // clears (regulatory; idempotent — no-ops emit nothing).
    ReviewQueueModule,

    // M3 recall BC (Wave 2.5, slices #11+#12+#13): canonical Recall BC at
    // `apps/api/src/recall/` per ADR-028. Slice #11 ships incident search
    // (multi-anchor lot/supplier/ingredient/aggregate, 8-result cap). Slice
    // #12 ships forward+reverse consumption traversal via SQL recursive CTE
    // (depth-capped at RECALL_TRACE_MAX_DEPTH=10, per-org override). Slice
    // #13 ships incident lifecycle (open/dispatch/redispatch/addendum)
    // anchored to `audit_log` via `aggregate_type='recall_incident'`
    // (ADR-RECALL-INCIDENT-VIA-AUDIT-LOG — NO new table), dossier PDF, and
    // 86-flag dispatch via slice #22 email + slice #21 hash chain validation.
    RecallModule,

    // M3 HACCP backend BC (m3-ccp-reading-aggregate, Wave 2.6, slice #9):
    // CCP reading capture + in-spec validation + corrective-action linkage +
    // FSMS standard versioning. Three audit-log envelopes
    // (CCP_READING_RECORDED, CCP_CORRECTIVE_ACTION_RECORDED,
    // FSMS_STANDARD_CONFIGURED), three MCP write capabilities (read-ccp-
    // reading, record-corrective-action, configure-fsms-standards), all
    // pinned to `aggregate_type='haccp_record'` per design.md Decision E.
    // The j10 UI surface (RecentReadingsStrip, SpecRangeReadback,
    // OutOfSpecStickyWarning, CorrectiveActionPicker) lives in slice #10
    // (`m3-haccp-ui`, parallel sibling). This BC is consumed by the future
    // APPCC export bundle (slice #14) via aggregate-type filter.
    HaccpModule,

    // M3 APPCC compliance-export BC (m3-appcc-export-bundle-service, Wave
    // 2.7, slice #14): bundle generator producing PDF + CSV pair sealed by
    // SHA-256 over the concatenated bytes. Chapter 0 = raw audit_log
    // unedited (FR25 trust principle); 5 derivative chapters per requested
    // scope. Two new audit envelopes (EXPORT_BUNDLE_GENERATED,
    // EXPORT_BUNDLE_DISPATCHED) both `retention_class='regulatory'`. One
    // MCP capability `compliance.generate-export`. Email dispatch via slice
    // #22 EmailDispatchService per ADR-039.
    ComplianceExportModule,

    // Sprint 2 P4 — GDPR legal core (feat/sprint2-p4-gdpr-legal-core):
    // Owner-only Privacidad backend backing OwnerPrivacySection.tsx.
    // Five regulatory audit envelopes (PRIVACY_EXPORT_REQUESTED,
    // PRIVACY_DELETE_SCHEDULED, PRIVACY_DELETE_CANCELLED,
    // PRIVACY_RETENTION_POLICY_CHANGED, PRIVACY_DPO_CONTACT_UPDATED) all
    // wired on the AuditLogSubscriber. Adds 3 columns to organizations
    // via migration 0043 (deletion_scheduled_at + retention_policy +
    // dpo_contact). Real physical-deletion cron is a follow-up slice.
    PrivacyModule,

    // M3 APPCC export i18n infrastructure (m3-appcc-i18n-ui, Wave 2.7,
    // slice #15): four-locale ICU MessageFormat template seed (es-ES
    // default + ca-ES + eu-ES + gl-ES), EU 1169 Annex II allergen
    // vocabulary lookup table (14 codes × 4 locales = 56 entries), and
    // the `TranslatorService` with the contractual `locale → es-ES →
    // «key»` fallback chain per ADR-035. Consumed by slice #14's bundle
    // generator at integration time to render locale-bound strings.
    I18nM3ExportModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    // m2-mcp-write-capabilities: per-capability kill-switch — runs AFTER
    // RolesGuard (NestJS executes APP_GUARDs in registration order, but for
    // safety the guard is itself no-op when viaAgent !== true so order is
    // moot for direct REST/UI traffic).
    { provide: APP_GUARD, useClass: AgentCapabilityGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // m2-mcp-write-capabilities: forensic before/after capture for agent
    // writes. Skips entirely when viaAgent !== true.
    { provide: APP_INTERCEPTOR, useClass: BeforeAfterAuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  // m2-mcp-server: AgentAuditMiddleware reads `X-Via-Agent` + `X-Agent-Name`
  // headers, populates `req.agentContext`, and emits `AGENT_ACTION_EXECUTED`.
  // Wired against `forRoutes('*')` so it runs ahead of every controller; it
  // is a no-op for non-agent traffic.
  //
  // m2-mcp-write-capabilities: IdempotencyMiddleware runs AFTER
  // AgentAuditMiddleware so `req.user.organizationId` is available (auth
  // populates user before NestJS middleware chain — the order between these
  // two middleware is not load-bearing as long as auth has populated user).
  configure(consumer: MiddlewareConsumer): void {
    // m2-mcp-agent-registry-bench (Wave 1.13 [3c]): AgentSignatureMiddleware
    // runs FIRST so a verified signature stamps `req.agentContext` before
    // AgentAuditMiddleware reads it. AgentAuditMiddleware is idempotent —
    // it leaves a context with `signatureVerified=true` untouched.
    // DemoAuthMiddleware runs FIRST so `req.user` is populated before any
    // downstream middleware/guard reads it. No-op when DEMO_MODE !== 'true'.
    // Pairs with `apps/api/src/cli/seed-demo.ts` so the injected IDs match
    // real DB rows. Remove (or make a no-op) when real auth ships per R8.
    consumer
      .apply(
        DemoAuthMiddleware,
        AgentSignatureMiddleware,
        AgentAuditMiddleware,
        IdempotencyMiddleware,
      )
      .forRoutes('*');
  }
}
