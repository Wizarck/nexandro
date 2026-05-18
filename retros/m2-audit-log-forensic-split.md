# retros/m2-audit-log-forensic-split.md

> **Slice**: `m2-audit-log-forensic-split` · **PR**: [#107](https://github.com/Wizarck/nexandro/pull/107) · **Merged**: 2026-05-07 · **Squash SHA**: `339b039`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **Wave 1.14 — first post-m2-mcp-extras slice**. Closes the longest-running tech-debt thread filed across 7 prior slices (Waves 1.9–1.13): the `AGENT_ACTION_EXECUTED` channel carried two payload shapes (lean from `AgentAuditMiddleware`; rich from `BeforeAfterAuditInterceptor` and `AgentChatService`) discriminated at runtime by `isRichAuditEnvelope()`. This slice splits the channel into type-system-distinct event types AND consolidates the audit-log architecture into 3 canonical ADRs + a single operator runbook. **Single-fix CI cycle**: only the INT-helper aggregation bug surfaced; all 5 stage commits passed everything else first try.

## What we shipped

**Channel split (apps/api):**
- `audit-log/application/types.ts` — added `AGENT_ACTION_FORENSIC: 'agent.action-forensic'` to `AuditEventType` and the persisted-name mapping. Open-enum text column means zero schema cost; the new event type is pure code.
- `cost/application/cost.events.ts` — added `AGENT_ACTION_FORENSIC` channel constant alongside the existing `AGENT_ACTION_EXECUTED`. The two share the cost.events file because it remains the de-facto cross-BC event constants home.
- `audit-log/application/audit-log.subscriber.ts` — new `@OnEvent(AGENT_ACTION_FORENSIC)` handler calls `persistEnvelope()` directly. The legacy `onAgentActionExecuted` handler dropped the `isRichAuditEnvelope()` discrimination; lean-only path. The 18-line `isRichAuditEnvelope()` helper deleted.
- `shared/interceptors/before-after-audit.interceptor.ts` — `events.emitAsync(AGENT_ACTION_EXECUTED, envelope)` → `events.emitAsync(AGENT_ACTION_FORENSIC, envelope)`. Single line change; payload unchanged.
- `agent-chat/application/agent-chat.service.ts` — same single-line emit-target change in the Observable terminal callback. `auditEmitted` flag + `randomUUID()` aggregate id semantics preserved (now codified as ADR-027).
- `shared/middleware/agent-audit.middleware.ts` — **unchanged**. Lean middleware keeps emitting `AGENT_ACTION_EXECUTED`.

**Migration `0022_audit_log_forensic_split` (apps/api):**
- `up()`: `UPDATE audit_log SET event_type='AGENT_ACTION_FORENSIC' WHERE event_type='AGENT_ACTION_EXECUTED' AND aggregate_type<>'organization'` — single-transaction backfill of historical rich rows.
- `down()`: symmetric reverse.
- `hasTable('audit_log')` guard for fresh-schema safety (per the ADR-025 pattern from migrations 0017 + 0018 + 0019).
- Zero schema change — open-enum text `event_type` per ADR-025.

**Canonical ADRs (`master/docs/architecture-decisions.md`):**
- **ADR-025** audit_log canonical architecture — promotes the subscriber-pattern + envelope shape + two-name pattern + polymorphic FK + UUID `aggregate_id` + open-enum text `event_type` + hybrid translation + hasTable-guard pattern from per-slice `design.md` files into the canonical project ADR document. First ADR about audit_log after 5 audit-log slices shipped.
- **ADR-026** Forensic agent-event split — the slice's own decision, recorded as it ships. Documents the lean/rich channel separation, migration strategy, operator-visible behaviour change, and the rejected alternative (renaming `AGENT_ACTION_EXECUTED` → `AGENT_REQUEST_RECEIVED`).
- **ADR-027** Streaming-handler audit pattern — codifies the Wave 1.13 [3b] discoveries (`@Sse()` handlers can't use `BeforeAfterAuditInterceptor`; emit from Observable terminal callback; `auditEmitted` flag; `randomUUID()` for UUID-typed `aggregate_id`; opaque session id in `payload_after`; `emitAsync` not `emit` for INT correctness). Reference implementation cited as `agent-chat.service.ts`.

**Operator runbook (`master/docs/operations/audit-log-runbook.md` ~270 LOC):**
- Section 1: Schema (table + 14 cols + 5 indexes + 4 migrations).
- Section 2: Query API (`GET /audit-log` filters, RBAC, pagination defaults, error contract).
- Section 3: Full-text search (dual-config, ranking, debugging).
- Section 4: CSV export (cap, truncation header, RFC 4180, cursor pagination internals).
- Section 5: Agent dual-channel emission (post-this-slice; the post-migration query semantics call-out).
- Section 6: Six troubleshooting recipes (R1 missing forensic row, R2 FTS no results, R3 CSV truncation, R4 migration didn't move rows, R5 audit row dropped silently, R6 streaming endpoint emits N rows).
- Section 7: Cross-references to per-slice runbooks for setup detail.
- Section 8: Eleven filed future tech-debt items with trigger conditions.

**Tests (net delta):**
- Unit: +3 new (`audit-log.subscriber.spec.ts` — `onAgentActionForensic` happy path + missing-fields skip + record-failure-swallow). 792 → 795 apps/api unit. Lint clean. Build clean.
- Adapted: 5 specs (subscriber + interceptor + chat service unit + agent-write-capabilities INT + agent-chat INT) for the new channel. Direct-REST-no-X-Via-Agent test extended to also assert no `AGENT_ACTION_FORENSIC` row.
- INT NEW: `audit-log-forensic-split-migration.int.spec.ts` — 5 tests against real Postgres seeding mixed lean+rich rows then exercising forward + idempotent + reverse + payload-preservation.

## What surprised us

- **The INT-helper aggregator overwrote instead of accumulating, and the bug was invisible until two distinct `aggregate_type` values landed in the rich bucket.** First CI run showed `richExecuted=1` for a seed that inserted 2 rich rows (one `recipe`, one `menu_item`). The map key `${event_type}/${'rich'}` is the same for both rows; my `map[key] = Number(row.count)` overwrote the recipe count with the menu_item count. Single-line fix: `map[key] = (map[key] ?? 0) + Number(row.count)`. Lesson: any test helper that reduces a `GROUP BY` result into bucketed counts MUST accumulate, never assign — even when the test happens to seed only one row per group at first writing, future seed evolutions break silently. Codified as a generic lesson; affects any future bucketing helper.
- **Single-fix CI cycle was within reach.** The 3a/3b slices each took 5 CI iterations; 3c took 0; this slice took 1. The lessons codified mid-3b (streaming-handler pattern, SSE wire format, UUID schema constraint) all paid off in this slice — none of those failure modes resurfaced. Three CI cycles avoided directly.
- **Compile-time clarity removed an entire class of subtle bug.** Pre-this-slice, `events.emit(AGENT_ACTION_EXECUTED, payload)` accepted both lean and rich payloads silently. A reader staring at the call site couldn't tell which shape was intended without reading the subscriber. After the split, TypeScript narrows the payload type to `AgentActionExecutedEvent` for the lean channel and `AuditEventEnvelope` for the forensic channel. Mismatched payloads now fail to compile. The `isRichAuditEnvelope()` helper was 18 LOC of runtime sniffing that disappeared entirely.
- **3 ADRs was the right grain.** I almost recommended 5 (one per pattern: subscriber, two-name, polymorphic FK, hybrid translation, streaming) but consolidating subscriber + envelope + polymorphic FK + UUID + open-enum + hybrid translation into ONE ADR-025 reads cleanly: it describes "what audit_log is" as a coherent architecture. ADR-026 is the slice's own decision. ADR-027 is genuinely independent because it applies to any streaming handler regardless of the event channel. Five would have over-segmented; one would have under-documented.
- **Single operator runbook beats per-feature runbooks.** The `audit-log-runbook.md` references `m2-mcp-write-capabilities-runbook`, `m2-mcp-agent-chat-widget-runbook`, and `m2-mcp-agent-registry-bench-runbook` for slice-specific setup; the cross-cutting subsystem doc lives once. An operator investigating "why is this audit row missing?" has a single starting point. The references pattern keeps the runbook focused on the subsystem (schema, query API, FTS, CSV, channels, troubleshooting) rather than redoing the env-flag tables that already live per-slice.

## Patterns reinforced or discovered

- **Test-helper aggregators must accumulate.** When a test reduces a `GROUP BY` query result into a bucketed map, use `map[key] = (map[key] ?? 0) + delta`. Direct assignment is silently wrong as soon as multiple input rows share a bucket.
- **Promote per-slice ADRs to canonical when the subsystem reaches feature-completeness.** Audit-log shipped 4 functional slices (1.9–1.12) + 3 emit-site slices (1.13 trio) before any of its ADRs landed in `docs/architecture-decisions.md`. The right moment is when (a) the subsystem boundary has stabilised, and (b) the next contributor will need a single starting point that isn't a retro chain. Both held here.
- **Type-system-level discrimination beats runtime sniffing.** When two emit sites share a channel via shape discrimination, the cost is hidden: the call-site reader can't see which shape they should pass. Splitting the channel is cheap when the shapes are already distinct types and the storage column tolerates it (open-enum). The migration backfill makes historical data clean.
- **Streaming-handler audit pattern is now a first-class building block.** ADR-027 documents the 5 rules. Any future streaming endpoint (CSV import per-row audit, agent bulk imports, batched job audit) follows them. The shared-interceptor approach (`StreamingAuditInterceptor`) is intentionally NOT abstracted here because the per-service shape varies; replicate the ~5-LOC pattern from `agent-chat.service.ts` per service.
- **`emitAsync` for INT-spec correctness, every time.** Hit twice (Wave 1.11 + 3a). Codified in ADR-027. Synchronous `emit()` returns before the `@OnEvent` handler awaits its DB write; an INT spec that reads `audit_log` immediately after the response sees zero rows — read-after-write across the bus boundary. `emitAsync` waits for subscribers to settle. The lesson is now in canonical docs, not just memory.

## Things to file as follow-ups

- **`m2-audit-log-emitter-migration`** — promote the 5 `cost.*` legacy translators in `AuditLogSubscriber` to envelope-shape emitters at their source services. Trigger: M3 inventory adds a 6th legacy translator → consolidate before fan-out grows.
- **`m2-audit-log-partition`** — `audit_log` partitioning by `created_at` month at >10M rows/org per heavy tenant. Filed in Wave 1.9 retro originally; reaffirmed.
- **`m2-audit-log-dlq`** — dead-letter queue for failed audit writes. Trigger: persistent `audit-log.subscriber.error` log volume >10/day in PROD.
- **`m2-audit-log-export-async`** — `POST /audit-log/exports → job_id`, `GET /audit-log/exports/:id → file`. Trigger: customer requests >100K row dumps regularly.
- **`m2-audit-log-ui`** — Owner-facing browse/search/drill-down UI for `audit_log`. Trigger: integrators ask.
- **`m2-audit-log-forensic-channel-rename`** — if a future ADR decides `AGENT_ACTION_EXECUTED` should rename to `AGENT_REQUEST_RECEIVED` for cleaner semantics, that ships in its own slice with operator-side renames documented. Filed as a maybe-never; the lean event keeps its identity unless we have a strong reason to break operator dashboards.

## Process notes

- **Cadence A worked again.** 5 stage commits + 1 fix-commit before merge. Stage breakdown:
  1. `proposal+adrs(...)` — openspec artifacts + ADR-025/026/027 in one commit. Two deliverables that share the same review surface (the architecture decisions); shipping them together saved a stage.
  2. `feat(audit-log): split AGENT_ACTION_EXECUTED → AGENT_ACTION_FORENSIC channels` — 5 files, 53/-43.
  3. `feat(audit-log): migration 0022 backfills historical AGENT_ACTION_EXECUTED rich rows` — single migration file.
  4. `test(audit-log): adapt + extend specs for AGENT_ACTION_FORENSIC channel split` — 7 files including the new INT spec.
  5. `docs(audit-log): operator runbook consolidates Waves 1.9-1.14 audit subsystem` — single ~270-line runbook.
  6. `fix(audit-log-int): accumulate count() rows in INT spec helper instead of overwriting` — 1-line fix.
- **Single CI iteration.** First push: 7/8 checks pass, INT fails on the helper-aggregator bug. Fix-commit + push: all green. Compare to Wave 1.13 [3a]+[3b] (5 iterations each); [3c] (0 iterations); this slice (1 iteration). The pattern: as the architecture stabilises, surprises cluster around test infrastructure rather than production code.
- **Cross-slice consolidation slices have a unique discoverability cost.** Reading 7 retros + the canonical ADR doc + the subscriber/interceptor/chat service code took longer than a typical Gate D research pass. The output (3 ADRs + 1 runbook + the channel split) was high-leverage, but the up-front read was the bottleneck. Lesson: consolidation slices need a deliberate "research budget" line in tasks.md so the research time isn't surprised mid-stage. Useful for any future cross-cutting cleanup slice.
- apps/api unit suite: 792 → 795 (+3). Lint clean. Build clean. CodeRabbit clean. Storybook unaffected. Gitleaks clean. CI verde post-fix-commit at `fa260ea`.
- m2-mcp-extras saga (3a/3b/3c) is the natural reference point for this slice; Wave 1.14 closes the audit-log thread that the saga left as M3+ tech-debt.
