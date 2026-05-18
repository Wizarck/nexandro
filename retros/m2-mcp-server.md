# retros/m2-mcp-server.md

> **Slice**: `m2-mcp-server` · **PR**: [#85](https://github.com/Wizarck/nexandro/pull/85) · **Merged**: 2026-05-05 · **Squash SHA**: `d43bbc1`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: Wave 1.5 subagent slice (paired with main-thread `m2-ingredients-extension`, PR #84). First slice that ships a separable npm/Docker package outside `apps/` + `packages/ui-kit/`. Third subagent run (after `m2-allergens-article-21` + `m2-off-mirror`); first slice with `audit_log` channel reserved but table still pending.

## What we shipped

The Agent-Ready surface — **read-only first** per Gate D 2a (writes deferred to `m2-mcp-extras`):

`packages/mcp-server-nexandro/` (new package; separable Docker image / npm module per ADR-013):
- TypeScript scaffold + `@modelcontextprotocol/sdk` 1.29.0 (pinned)
- Capability descriptors: `recipes.{read,list}`, `menu-items.{read,list}`, `ingredients.{read,search}`
- HTTP client wrapping `apps/api/` REST endpoints (Node 20+ fetch + keep-alive). Forwards `X-Via-Agent`, `X-Agent-Name`, optional `X-Agent-Capability` headers
- `src/index.ts` (factory: `buildServer({apiBaseUrl, agentName, fetcher?})`) + `src/server.ts` (stdio bootstrap entry — split for ts-jest CJS compat). `bin` and Dockerfile `ENTRYPOINT` point to `dist/server.js`
- `Dockerfile` + npm publish config; `engines: { node: ">=20.0.0" }`
- README documenting deploy modes (Docker, npm install, dev) + the trusted-internal-network assumption
- 17 tests across 5 suites: capabilities (10) + http-client (6) + smoke (1)

`apps/api/` middleware + lint:
- `AgentAuditMiddleware` reads agent headers, populates `req.agentContext`, emits `AGENT_ACTION_EXECUTED` event with full attribution payload (`executedBy`, `viaAgent`, `agentName`, `capabilityName`, `organizationId`, `timestamp`)
- Wired in `AppModule.configure(consumer.apply(...).forRoutes('*'))`
- No-op when headers absent; never 5xx on malformed input
- 9 unit tests + 3 lint-rule contract tests via `execFileSync` (escapes the jest CJS-vs-ESM boundary)
- ESLint `no-restricted-imports` rule blocking `@modelcontextprotocol/*` from `apps/api/**`
- Lint regression fixture at `apps/api/src/__test_fixtures__/agent-vendor-import.fixture.ts` (excluded from `nest build` via tsconfig)

Events:
- `AGENT_ACTION_EXECUTED` constant + `AgentActionExecutedEvent` interface APPENDED to `cost/application/cost.events.ts` (channel reserved; future audit-log listener subscribes when the table lands)

Tests: 9 new middleware + 17 mcp-server = **26 new** across the slice. Backend total: 468 (459 baseline + 9). Mcp-server total: 17.

## What worked

- **Tight subagent prompt with allow-list + verification gate.** The boundary list named exact paths; the verification gate enumerated the 10 commands the subagent had to run before reporting back. Result: 0 boundary violations (modulo 2 tiny scope clarifications surfaced for parent review — see "Boundary notes"); the subagent ran 8/10 verification steps green and reported the 2 minor design tweaks transparently.
- **The split `index.ts` / `server.ts` was forced by ts-jest** but is independently good architecture: `buildServer({...})` is now a unit-testable factory that doesn't auto-bootstrap. Test code imports `index.ts`; production runtime entry is `server.ts`. Same pattern works for any future MCP package.
- **`tsconfig.test.json` extending the production `tsconfig.json`** (CommonJS + `isolatedModules`) avoided fighting the ESM/CJS interop in jest. Production build stays Node16/ESM; only the test transform diverges. Pattern worth lifting into a future `templates/` directory for new TypeScript packages.
- **Lint-rule contract tested via `execFileSync`.** The lint rule itself is config; testing whether ESLint actually fires on a given fixture requires running ESLint. The subagent shelled out via `execFileSync` from the spec — escapes the jest CJS-vs-ESM problem entirely. 3 tests cover: (a) fixture imports trigger the rule, (b) non-fixture imports do not, (c) the rule emits the expected `ruleId`.
- **Trusted-internal-network mode documented in README.** Signature verification is deferred to M3 per design Risks. The README is explicit: "this slice runs in trusted-internal-network mode only; do not expose externally without first shipping `m2-mcp-extras`'s shared-secret signing." Scope discipline makes the deferral defensible.
- **Read-only-first scope reduced surface area dramatically.** 6 capabilities × ~30 LOC each + 1 HTTP client + 1 middleware. Versus full read+write × Recipe/MenuItem/Ingredient × 4 ops × full audit-log integration → would have been 5-10x more code with active CI matrix complexity. Gate D 2a was the right call.
- **`X-Agent-Capability` optional header.** Subagent surfaced this addition transparently. The capability name (e.g. `recipes.read`) lands on the event payload. When a future audit-log listener writes the row, "what was the agent trying to do?" is already captured. Within scope per spec text "what a future listener needs".
- **Capability registry pattern.** Each capability lives in its own file (`recipes.ts`, `menu-items.ts`, `ingredients.ts`). The MCP server registers them in a loop. Adding a 4th capability set (e.g. `dashboard.*`) is one new file + one registration line.

## What didn't (and the fixes)

- **`apps/api/eslint.config.mjs` is `.mjs` not `.js`.** Subagent prompt said `apps/api/eslint.config.js`; actual file is `eslint.config.mjs`. Subagent edited the right file and surfaced the discrepancy in the boundary report. Fix: parent reviewer (me) accepts; the prompt template should say `eslint.config.{js,mjs}` for future slices.
- **`apps/api/tsconfig.json` exclude** wasn't in the explicit allow-list. Subagent needed it because the lint regression fixture imports `@modelcontextprotocol/sdk` which intentionally isn't installed in `apps/api/` — `nest build` would fail without the exclude. Subagent surfaced the deviation transparently. Fix: parent accepts; alternative (move fixture outside `src/`) would have contradicted the explicit path requirement in the prompt.
- **`zod` peer-dep wasn't called out in design.md.** `@modelcontextprotocol/sdk` declares `zod` as a peer-dep; without it `registerTool()` schemas can't be defined. Subagent added `zod ^3.25.0` as a runtime dep. Fix: parent accepts; this is a follow-on consequence of Gate D 1a (official SDK), not a new design decision.
- **The `package-lock.json` modification** (1155 packages added under the new workspace) is an inevitable npm install side-effect. Stage and commit; reviewers see the lockfile churn but no manual changes.

## Surprises

- **Subagent's verification report was meticulous.** 22 files touched, exact counts, exact verification steps with pass/fail status, 4 design tweaks transparently surfaced, boundary notes called out separately. The "report don't push" gate caught everything I would have asked for in code review. Pattern is now batting 3-for-3 (after `m2-allergens-article-21` + `m2-off-mirror`).
- **17 mcp-server tests in 5 suites without touching the live MCP wire.** The smoke test mocks the REST API; capability specs mock the HTTP client; http-client specs mock fetch. No live process spawning, no network. Should run fast in CI.
- **The `data-testid="odbl-attribution"` pattern from `#15`'s `MacroPanel`** wasn't applicable here (no UI), but it's the kind of pattern the subagent could have leaned on if it had needed to render anything. Subagent stayed strictly backend-only per Gate D 3a (defer AgentChatWidget) — no UI files touched.
- **AGENT_ACTION_EXECUTED event payload has `organizationId: string | null`.** The subagent inferred that the agent might run before the user payload is populated (e.g. unauthenticated agent ping). The `null` fallback keeps the event shape stable; downstream listeners can drop unauthenticated events. Defensive but right.
- **Subagent ran 1335 seconds (~22 min) wall-clock total** for the full slice including verification. Without parallelism, this would have been ~22 min on top of the main thread's ~80 min for `m2-ingredients-extension` = 102 min sequential. With parallelism: 80 min wall-clock (subagent finished within main thread's time). Net wall-clock saved: ~22 min.

## What to keep

1. **Subagent boundary-list contract.** Tight scope + declared file allow-list + "report don't push" verification gate. Three slices in a row now where this pattern delivered surgical work with transparent deviations.
2. **`npm test --workspace=apps/api` passes locally + in CI** as the basic gate. Subagent ran it, reported 468 = 459 + 9. Saved a CI round-trip.
3. **`tsconfig.test.json` extending the production tsconfig** for ts-jest CJS compat. Pattern worth lifting into a template for new TypeScript packages.
4. **Capability files self-contained.** Each capability set in its own file with its own spec. Adding a 4th set is mechanical; no shared state to refactor.
5. **Event payload includes everything a future listener needs.** `executedBy`, `viaAgent`, `agentName`, `capabilityName`, `organizationId`, `timestamp` — the audit-log table will join cleanly when it lands. No coupling to a specific listener today; pure broadcast.
6. **README's "trusted-internal-network mode" disclaimer.** Scope discipline made auditable. Anyone deploying this in the wild reads the warning before exposing it.

## What to change

1. **Subagent prompt template should accept multiple ESLint config extensions** (`eslint.config.{js,mjs,cjs}`). Filed.
2. **Subagent prompt template should mention tsconfig adjacent edits** when fixtures land under `src/`. Filed.
3. **`zod` should be added to the design.md** (or a "transitive deps" section) when SDK choice is locked. Future MCP-related slices may hit similar hidden peer-deps. Filed.
4. **`AGENT_ACTION_EXECUTED` event currently has no listener.** Filed: when audit_log table lands (`m2-audit-log` slice), wire the listener that persists the row. Until then, events are emitted into the void — that's intentional but worth flagging in the runbook.
5. **`m2-mcp-extras` follow-up scope** — file as a new row in `docs/openspec-slice-module-2.md`:
   - Write capabilities (`recipes.create`, `menu-items.update`, `ingredients.applyOverride` via MCP)
   - `AgentChatWidget` UI feature-flagged via `NEXANDRO_AGENT_ENABLED`
   - `missingFields` + `nextRequired` propagation across all write endpoints
   - Dual-mode CI matrix (`NEXANDRO_AGENT_ENABLED=true|false`)
   - Agent registry with shared-secret signing (M3 trigger)
6. **First MCP-client benchmark.** README mentions "no benchmarks yet"; an `m2-mcp-extras` task should spin up a real client (Claude Desktop / Hermes / OpenCode) and measure end-to-end latency for `recipes.read`. Validates the SLA contract before write paths land.

## Wave-N parallelism observations (Wave 1.5 — second slice in this wave)

| Aspect | This slice (subagent) | Sibling (main thread, m2-ingredients-extension) |
|---|---|---|
| Subagent runtime | ~22 min | — |
| Parent thread coordination | ~10 min prompt drafting + ~5 min reviewing return | — |
| Files touched | 22 (5 modified + 17 created) | 14 |
| Tests added | 9 middleware + 17 mcp-server = 26 | 21 backend + 13 ui-kit = 34 |
| Boundary violations | 0 (2 minor surfaces transparently flagged) | — |
| First-push CI | TBD (#85 in flight) | TBD (Test rerun in flight after ECONNRESET) |
| Scope creep | 0 (read-only first faithfully observed) | — |

The §6.6 cost-benefit threshold (~30 min of parallelisable work) was clearly met. Aggregate wall-clock saved: ~22 min vs sequential.

The subagent's 4 design tweaks (server split, tsconfig.test, zod peer-dep, X-Agent-Capability) are all defensible — three are forced by tooling (ts-jest CJS, peer-dep), one is within-scope (capability name on event payload). None are scope creep beyond Gate D verdict.

The cost.events.ts file was append-only by both slices (this slice's `AGENT_ACTION_EXECUTED` + main-thread's `INGREDIENT_OVERRIDE_CHANGED`). When merging sequentially: #84 first → master gains `INGREDIENT_OVERRIDE_CHANGED`; #85 rebase on master → trivial conflict at end-of-file resolved by keeping both. Filed as a wave-coordination note: the cost.events.ts file is a hot-spot for parallel slices.

## Cross-references

- Specs (archived): `openspec/specs/m2-mcp-server/`
- ADRs: ADR-013 (Agent-Ready / dual-mode + WebChat feature flag — implemented here); no new ADR
- Predecessors: `retros/m2-recipes-core.md` (#2 — recipes.read/list capabilities), `retros/m2-menus-margins.md` (#8 — menu-items.read/list), `retros/m2-data-model.md` (#1 — ingredients.read/search)
- Parallel sibling: `retros/m2-ingredients-extension.md` (#84, same wave, main-thread implemented)
- ai-playbook: `specs/release-management.md` §6.4 (wave parallelism, third real run; second subagent in this wave), §6.7 (proposal-only-first — fifth use)
- Follow-up slice (filed): `m2-mcp-extras` for write capabilities + AgentChatWidget + dual-mode CI matrix + agent registry + first benchmark
