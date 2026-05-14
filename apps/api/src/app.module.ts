import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AgentChatModule } from './agent-chat/agent-chat.module';
import { AgentCredentialsModule } from './agent-credentials/agent-credentials.module';
import { AiObservabilityModule } from './ai-observability/ai-observability.module';
import { AiSuggestionsModule } from './ai-suggestions/ai-suggestions.module';
import { AuditLogModule } from './audit-log/audit-log.module';
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
import { ProcurementModule } from './procurement/procurement.module';
import { RecallModule } from './recall/recall.module';
import { RecipesModule } from './recipes/recipes.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { AgentCapabilityGuard } from './shared/guards/agent-capability.guard';
import { RolesGuard } from './shared/guards/roles.guard';
import { AuditInterceptor } from './shared/interceptors/audit.interceptor';
import { BeforeAfterAuditInterceptor } from './shared/interceptors/before-after-audit.interceptor';
import { AgentAuditMiddleware } from './shared/middleware/agent-audit.middleware';
import { AgentSignatureMiddleware } from './shared/middleware/agent-signature.middleware';
import { IdempotencyMiddleware } from './shared/middleware/idempotency.middleware';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
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

    // M2 AI yield + waste suggestions (m2-ai-yield-suggestions — provider + iron-rule guard + chef override).
    AiSuggestionsModule,

    // M2 canonical audit log (m2-audit-log — single audit_log table; @OnEvent subscriber across BCs).
    AuditLogModule,

    // m2-mcp-agent-chat-widget (Wave 1.13 [3b]): SSE relay to Hermes' web_via_http_sse platform.
    // Feature-flagged on OPENTRATTOS_AGENT_ENABLED — endpoint returns 404 when off.
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
    // OTel SDK + tracer service + global span-enricher interceptor (opentrattos.tag)
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

    // M3 recall (m3-trace-tree-forward-reverse, Wave 2.5, slice #12):
    // Read-only traversal engine over the audit_log consumption ledger.
    // SQL recursive CTE walks lot → recipe → menu-item → service-window
    // (forward) or the same chain in reverse from an anchor. Depth-capped
    // at RECALL_TRACE_MAX_DEPTH=10 (per-org override via
    // organizations.recall_max_depth). Three partial B-tree expression
    // indexes on audit_log.payload_after->>{lot_id,recipe_id,menu_item_id}
    // provisioned by migration 0036.
    //
    // Parallel slice #11 (m3-incident-search-multi-anchor) also writes to
    // this module; resolver picks up both providers + both controllers
    // at master. Downstream consumers: slice #13 (dossier), slice #14
    // (PDF export), slice #15 (APPCC export).
    RecallModule,

    // Future Bounded Contexts:
    // HaccpModule,       // M3 — HACCP / APPCC (slices #9-10)
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
    consumer
      .apply(AgentSignatureMiddleware, AgentAuditMiddleware, IdempotencyMiddleware)
      .forRoutes('*');
  }
}
