import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { LabelsModule } from './labels/labels.module';
import { MenusModule } from './menus/menus.module';
import { ProcurementModule } from './procurement/procurement.module';
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

    // M3 procurement foundation (m3-po-aggregate, Wave 2.2, slice #6):
    // PurchaseOrder + PurchaseOrderLine entities, six-state machine,
    // per-org row-locked PO-number counter, multi-tenant-gated repositories,
    // PoFactory + PoService. Foundation for FR-PO-1..3 (PO creation, send,
    // state transitions). GR confirmation (sent -> partially_received ->
    // received) is reserved for slice #7 m3-gr-aggregate-reconciliation;
    // operator UI for slice #8 m3-procurement-ui; audit-log emission for
    // slice #21 m3-audit-log-hash-chain-hardening per ADR-PO-NO-AUDIT-EMIT-HERE.
    ProcurementModule,

    // Future Bounded Contexts:
    // HaccpModule,       // M3 — HACCP / APPCC (slices #9-10)
    // RecallModule,      // M3 — Recall (slices #11-13)
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
