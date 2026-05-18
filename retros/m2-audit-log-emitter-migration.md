# retros/m2-audit-log-emitter-migration.md

> **Slice**: `m2-audit-log-emitter-migration` · **PR**: [#111](https://github.com/Wizarck/nexandro/pull/111) · **Merged**: 2026-05-08 · **Squash SHA**: `3b94d15`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **Wave 1.18 — slice #3 of the 4-slice backend tech-debt batch**. Closes Wave 1.9 + Wave 1.14 (ADR-025) tech-debt: 5 cost.* legacy event channels migrate from ad-hoc per-event payloads to canonical `AuditEventEnvelope` shape. Subscriber's 5 translator handlers replaced with `persistEnvelope`-only handlers. **First-pass green CI** despite touching 12 files across 5 BCs.

## What we shipped

**5 channels migrated to envelope shape** (cost.events.ts):
- `INGREDIENT_OVERRIDE_CHANGED` — emitted by `ingredients.service.applyOverride`. `aggregateType='ingredient'`, `aggregateId=ingredientId`, `actorUserId=appliedBy`, `actorKind='user'`, `payloadAfter={field}`, `reason` at envelope root.
- `RECIPE_ALLERGENS_OVERRIDE_CHANGED` — emitted by `recipes-allergens.service`. `aggregateType='recipe'`, `aggregateId=recipeId`, `actorUserId=appliedBy`, `actorKind='user'`, `payloadAfter={kind}`.
- `RECIPE_SOURCE_OVERRIDE_CHANGED` — emitted by `recipes.service`. `aggregateType='recipe'`, `aggregateId=recipeId`, `actorUserId=null`, `actorKind='system'`, `payloadAfter={recipeIngredientId, sourceOverrideRef}`.
- `RECIPE_INGREDIENT_UPDATED` — emitted by `recipes.service.emitIngredientUpdated`. Same shape as above; `payloadAfter={recipeIngredientId}`.
- `SUPPLIER_PRICE_UPDATED` — emitted by `supplier-items.controller` (3 sites). `aggregateType='supplier_item'`, `aggregateId=supplierItemId`, `actorUserId=null`, `actorKind='system'`, `payloadAfter={ingredientId}`. Centralised via new `buildSupplierPriceEnvelope()` helper at the bottom of the controller.

**5 legacy event interfaces deleted from `cost/application/cost.events.ts`**:
- `SupplierPriceUpdatedEvent`, `RecipeIngredientUpdatedEvent`, `RecipeSourceOverrideChangedEvent`, `RecipeAllergensOverrideChangedEvent`, `IngredientOverrideChangedEvent`.
- Channel constants stay (the bus channel name is the `event_type` discriminator). Per Gate D F4: clean cut, no `@deprecated` step.
- `SubRecipeCostChangedEvent` interface preserved (internal cost-domain cascade event; not an audit channel).
- `AgentActionExecutedEvent` interface preserved (lean middleware channel; ADR-026 keeps as-is).

**Subscriber refactor (`audit-log.subscriber.ts`)**:
- 5 `@OnEvent` handlers for the cost.* channels each become a single `return this.persistEnvelope(channel, payload)` line. ~30 LOC of per-type field translation deleted.
- `persistTranslated()` private method **stays** — still in use by `AGENT_ACTION_EXECUTED` lean (the lean middleware channel intentionally retains its translator per ADR-026).
- Channel-name documentation preserved (5 separate handlers, one per channel, per Gate D F3).

**Non-audit consumers updated to read envelope fields**:
- `cost.service.ts`:
  - `onSupplierPriceUpdated`: reads `evt.organizationId` (root) + `evt.payloadAfter.ingredientId`.
  - `onRecipeIngredientUpdated`: reads `evt.organizationId` (root) + `evt.aggregateId` (recipeId).
  - `onRecipeSourceOverrideChanged`: same shape as above.
- `dashboard.service.ts`: `handleSupplierPriceUpdated` reads `evt.organizationId` (root) + `evt.aggregateId` (supplierItemId, used in diagnostic log only).
- `labels.service.ts`: parameter type changed to `AuditEventEnvelope`; bodies are unchanged (cache flush only — no field reads).

**Test deltas**:
- `audit-log.subscriber.spec.ts` — 5 cost.* tests rewritten as envelope-shape persistence assertions; `AGENT_ACTION_EXECUTED` lean tests untouched; error-handling tests adapted (broken-payload now means malformed envelope, not malformed legacy event).
- `recipes-allergens.service.spec.ts` — 3 captured-event assertions updated to read `payloadAfter.kind` + `aggregateId` instead of `kind` + `recipeId` at root.
- `dashboard.service.spec.ts` — 2 fixture builders updated to envelope shape.
- `ingredients.service.spec.ts` — 1 emit-assertion updated to envelope shape (`expect.objectContaining({aggregateType: 'ingredient', aggregateId, payloadAfter: {field: 'allergens'}, ...})`).
- Net: 801 → 801 unit (no new tests; all adapted in-place).

## What surprised us

- **First-pass green CI on a 12-file refactor across 5 BCs.** The only "surprise" was during local development: the build broke after deleting the 5 legacy interfaces because 3 spec files (audit-log.subscriber, dashboard.service, recipes-allergens.service) + 1 service spec (ingredients.service) still imported / referenced them. The TypeScript error surface was tight and pointed exactly to the offending lines — net 4 spec files updated in ~10 minutes. CI on Linux passed first try because all build / lint / test errors were already cleared locally before push. **Lesson**: large-surface refactors are de-risked by the type system when the deleted interfaces are well-typed; the "many BCs" worry was overblown.
- **`buildSupplierPriceEnvelope()` helper at controller-bottom is a Wave-1.6-pattern repeat.** When a single file has 3 emit sites for the same channel, extracting a helper keeps each call site to a one-liner. The Wave 1.6 `m2-labels-rendering` slice flagged the same pattern for `PrintAdapter` factory; this is the second slice that benefits from "if you emit X 3+ times, extract a builder". Generalising: **3 is the threshold for extracting a builder**.
- **Channel-name documentation preservation pattern (Gate D F3).** Tempting alternative: collapse the 5 cost.* handlers into one generic `@OnEvent` over an array of channels. Rejected because the channel-per-handler shape carries documentation: a future contributor reading `audit-log.subscriber.ts` sees exactly which channels feed audit_log without needing to navigate to a constants file. The cost is 5 × 3-line handlers; the win is local readability. **Generalising: when a refactor would lose useful local documentation for a small LOC saving, prefer the documented shape.**
- **Persisted audit_log row shape is identical pre/post-migration.** The whole point of this refactor is in-memory shape change at emit/consume; the on-the-wire row stays byte-equivalent. INT spec coverage validated this without needing a baseline snapshot — the existing audit-log INT specs (audit-log.service / audit-log-fts / audit-log-export) all pass without modification. Operators querying audit_log don't see any difference. **Lesson**: when refactoring event shape, hold the persistence contract invariant; INT specs that read persisted rows become free regression coverage.
- **TypeScript discrimination kept the cost.service handlers honest.** Cost.service had 3 handlers reading legacy fields like `evt.recipeId`, `evt.ingredientId`. After deletion of the legacy interfaces, the handler signatures had to change to `AuditEventEnvelope`, and TypeScript flagged every now-undefined field access. Re-mapping `evt.recipeId → evt.aggregateId` and `evt.ingredientId → evt.payloadAfter?.ingredientId` was mechanical — no missed references. The `payloadAfter?.X` form returns `undefined` if payload is missing, which the handler short-circuits with an early return for the SUPPLIER_PRICE case (defensive against malformed envelopes).

## Patterns reinforced or discovered

- **Atomic envelope migration (emit + consume + types together).** This slice landed all 12 files in a single commit because partial states would leave the runtime in a broken intermediate (consumer reading envelope while emitter still publishes legacy = silent zero-rows-persisted). When migrating event shape, **don't try to stage emit-side and consume-side separately**. The right unit of work is the whole channel migration in one diff.
- **Helper extraction at the threshold of 3 repeat-emits per file.** `buildSupplierPriceEnvelope()` joins the family of `toResponse()` helpers in agent-credentials, the print-adapter factory in label-renderer, etc. Three repetitions earns a helper.
- **Preserve internal cascade events that aren't audit-shaped.** `SubRecipeCostChangedEvent` stays as its dedicated payload because (a) no audit subscriber listens; (b) the cost subsystem is the sole consumer; (c) cascading parents-of-this-sub-recipe is the entire semantic. Don't migrate things that aren't audit-channel members just because they live in `cost.events.ts`.
- **Defensive `payloadAfter?.X` access in consumers.** Cost.service's `onSupplierPriceUpdated` reads `evt.payloadAfter?.ingredientId` and short-circuits on `undefined`. This protects against malformed envelopes (e.g. a future emit site that forgets the field) without throwing in the handler — the bus's at-most-once semantics tolerate missed events better than crashes. Codify in the streaming-handler audit pattern.

## Things to file as follow-ups

- **`m2-audit-log-emitter-typed-payloads`** — `payloadAfter` is `unknown` in the envelope today. Discriminated-union typing per channel would let consumers read fields without type casts. Bigger refactor; defer until 2nd payloadAfter consumer pattern emerges.
- **`m2-audit-log-supplier-recipe-line-events`** (filed in Wave 1.9) — capture `SUPPLIER_PRICE_UPDATED` + `RECIPE_INGREDIENT_UPDATED` forward-going only (no historical persistence to backfill from prior to Wave 1.9). Separate scope; not blocking.
- **`m2-audit-log-cost-events-relocation`** — the 5 audit-cumulative channels still live in `cost/application/cost.events.ts` as a historical accident. Once `m2-audit-log-emitter-typed-payloads` lands, consider relocating channel constants + envelope payload types to `audit-log/application/audit-events/<bc>.ts` for clarity. Low priority.

## Process notes

- **2 stage commits + 0 fix-commits to merge.** Cleanest closure of the 4-slice backend batch so far:
  1. `proposal(...)` — openspec artifacts (4 files).
  2. `refactor(audit-log): legacy translators → envelope shape across 5 channels` — atomic 12-file refactor.
- **Build broke ~5 times during local development as I deleted interfaces piece-by-piece.** Each break was a TypeScript error in a spec file that imported the deleted interface; fix was mechanical. Total local iteration: ~15 minutes from "delete interface" to "build green". The TypeScript error surface IS the contract — reliable when the deleted symbols are well-typed.
- **Worktree leftover after merge.** Same Windows file-lock pattern as Wave 1.13 [3c] / 1.15 / 1.16 / 1.17. Sweep at end of the 4-slice batch.
- apps/api unit suite: 801 → 801 (no new tests; all adapted). INT: 110/110 unchanged. Build clean, lint clean, CodeRabbit clean, Storybook unaffected, Gitleaks clean.
- This is **slice #3 of the user's 4-slice "all" pick**. Final slice: `m2-audit-log-ui`.
