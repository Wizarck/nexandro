## Context

j9 is the quarterly compliance trigger surface: Marta (APPCC inspector) calls Iker (Multi-Location Owner) on a Tuesday — "I need the last 90 days HACCP + lot + corrective actions in the standard format, in Basque, by Friday". Iker opens `/compliance/export` on his laptop, picks the range + locale + scope, hits Generar, watches the progress strip, and either downloads the PDF + CSV companion locally or emails them straight to Marta's pre-configured contact. The same MCP capability (`compliance.generate-appcc-bundle`) is invoked by Hermes via the agent surface — different surface, same contract. This slice ships the web rendering + the i18n infrastructure. The Hermes rendering is slice-M3.x.

Slice #14 (`m3-appcc-export-bundle-service`, sibling Wave 2.7, parallel worktree) lands the bundle generator BC + 5 REST endpoints. None of slice #14's output produces a surface that Iker can browse. This slice composes 7 ui-kit components into one screen wired to slice #14's API + ships the `apps/api/src/i18n/m3-export/` module that slice #14's bundle generator consumes for template rendering.

The j9 mock at `master/docs/ux/variants/mock-j9-appcc-export.html` is the canonical visual reference: a single-column 960 px laptop layout (form panel above, archive table below), a transparency banner with `--mute` italic verbatim text as the first visible region, four locale chips with visual permanence (NOT a dropdown — j9 §Decisions), five scope checkboxes (haccp + lot checked by default), a collapsed recipient strip (email is opt-in — j9 §Decisions "boring before clever"), a sticky right-aligned Generar CTA, an inline progress strip that morphs into a download row, and a flat archive table below the trigger area. The accessible-name layer is critical: the progress strip uses `role="status"` + `aria-live="polite"` so screen-readers announce each step transition.

The **transparency banner** is a load-bearing primitive — it carries the FR25 contract verbatim ("El expediente contiene el audit_log sin editar como capítulo 0; el resto son vistas estructuradas sobre ese mismo registro. No producimos resumen ejecutivo."). Marta reads the cover page first; that text must appear on the cover AND on this surface so Iker knows what he is generating + Marta knows what she will not get (j9 §Decisions, PRD-M3 §Journey 5 trust principle locked). A marketing rewrite ("Generate a beautiful compliance report") would be wrong — the inspector wants to be told what they will not get, so they know to do their own analysis. This is exactly why the banner is its own ui-kit primitive and not inline copy in the screen: every cover-page-contract surface in the future imports the same component and the FR25 text never drifts.

## Goals / Non-Goals

**Goals:**

- Iker opens `/compliance/export`, picks the range + locale + scope, triggers generation, watches progress, and downloads the PDF + CSV companion in ≤ 90 s on his laptop (j9 §Goal).
- The transparency banner surfaces the FR25 verbatim text as the first visible region after the eyebrow + headline. Component contract is static (no required props beyond optional `className`); the text NEVER varies across consumers.
- The locale chips are visually permanent (chips, not dropdown) so Iker can glance at the chosen locale while configuring the rest of the form (j9 §Decisions). Single-select; default es-ES.
- The scope checkboxes default to haccp + lot checked; other rows (procurement, photo, ai_obs) start unchecked. Each row carries a one-line `--mute` description so the operator does not need to refer to docs to understand the scope.
- The recipient picker starts collapsed; expanding it shows pre-configured contacts as checkboxes + an ad-hoc add. Email is opt-in — many operators download first then forward (j9 §Decisions "Email is opt-in, not the default action").
- The progress strip mounts on submit and replaces the Generar CTA. Each step lights `--success` as the SSE stream emits a step-complete event. Bundle size + page count update live. On completion, the strip morphs into the download row. On failure, the last step rolls back to `--destructive` + a retry button mounts inline (j9 §Edge case "Bundle generation fails mid-render").
- The bundle download row shows PDF + CSV ghost buttons, the SHA-256 hash + audit_log entry id eyebrow, and an optional "Enviado a N destinatarios" line if recipients were configured.
- The archive table renders the last 10 bundles flat (no pagination in this slice; the operator scrolls if more arrive). Cold-storage rows show a muted `restaurar →` link (inert in this slice — the restore endpoint lands in a follow-up under ADR-029).
- The i18n module ships a 4-locale × ~45-key template seed + EU 1169 Annex II allergen vocabulary. The `TranslatorService` enforces the `locale → es-ES → «key»` fallback chain per ADR-035.
- First-paint ≤ 1 s (j9 §Notes for implementation). Defaults serve the recurring case: last-90-day range + es-ES + haccp+lot scope, all from inline constants — no preload roundtrip in this slice.
- Accessibility: progress strip uses `role="status"` + `aria-live="polite"`; chips are `<button>` with `aria-pressed`; checkboxes are native; date inputs are native with ARIA labels.

**Non-Goals:**

- Backend BC scaffolding for bundle generation (slice #14 owns `apps/api/src/compliance/`).
- Hermes / WhatsApp surface for the same capability (separate slice, future M3.x).
- Bundle preview-before-generate (j9 §Decisions "No preview the PDF before generating affordance" — deliberate).
- Schedule / recurrence configuration (the "Auto-export trimestral" card in the mock is rendered inert; the recurrence-config surface is a follow-up).
- Bundle hash verification on the client (the "✓ Verificar integridad bytes ↔ hash" button renders inert; the full check is a follow-up).
- Cold-storage restore flow (the `restaurar →` link is inert; ADR-029 archival worker is a follow-up).
- Per-organization persisted locale config in `organizations.export_locale` (the column lands in a follow-up migration; this slice treats es-ES as the inline default).
- Full OTel span integration for `TranslatorService` fallback (this slice emits `console.warn`; the OTel span is deferred per ADR-035 NFR-OBS-1 note).
- Email dispatch handler wiring (the RecipientPicker collects recipients; slice #14 wires the actual send via ADR-039 `EmailDispatchService`).

## Decisions

### ADR-J9-TRANSPARENCY-BANNER-IS-VERBATIM — FR25 contract surfaced as a load-bearing ui-kit primitive

The `TransparencyBanner` component renders the FR25 trust-principle text verbatim: *"El expediente contiene el audit_log sin editar como capítulo 0; el resto son vistas estructuradas sobre ese mismo registro. No producimos resumen ejecutivo."* The component contract is static — no required props beyond optional `className`. The Spanish text is a const inside the component file; consumers cannot override it. Reusable for every cover-page-contract surface in the future (e.g. the PDF cover page, future audit dashboards).

**Why:** Marta reads the cover page first; the contract must appear there and on this surface. The locked PRD-M3 §Journey 5 trust principle forbids a marketing rewrite. Encapsulating the text as a primitive (rather than inline copy in the screen) makes it physically impossible to drift the text across surfaces; a future cover-page surface that needs to surface the same contract imports the same component.

Rejected alternative: i18n-loaded copy. The text is in Spanish because Spanish is the inspector-facing language for compliance in this region; the i18n templates handle inspector-facing labels elsewhere in the bundle, but THIS surface is operator-facing (Iker, who reads Spanish). The banner does NOT vary across locales for the operator surface — only the generated PDF varies.

### ADR-J9-LOCALE-CHIPS-NOT-DROPDOWN — visual permanence per j9 §Decisions

`LocaleChipGroup` renders 4 chips, single-select, with `aria-pressed` driving the visual state. The chip group is a `<div role="group" aria-label="Idioma">` containing four `<button type="button">` chips. Selection swaps the `aria-pressed` boolean across all four chips atomically.

**Why:** four options + visual permanence supports the autonomous-community context. The operator may need to glance at the chosen locale while configuring the rest of the form. A dropdown hides the choice the moment it closes; the chip stays visible. This is locked per j9 §Decisions "Locale chips, not a dropdown".

The component contract: `{ value: Locale, onChange: (l: Locale) => void, locales?: ReadonlyArray<LocaleOption> }`. The component ships a default `locales` constant covering the four canonical locales; a consumer can pass a custom subset for testing.

Rejected alternative: `<select>` dropdown. Defeats glance-driven affordance; the visible chip anchors the operator's mental model of "which locale am I generating right now".

### ADR-J9-PROGRESS-STRIP-SSE-DRIVEN — SSE stream drives step transitions, not polling

`ExportProgressStrip` accepts `{ steps: ReadonlyArray<ProgressStep>, currentStepIndex: number, status: 'in-progress' | 'done' | 'failed', sizeBytes?: number, pageCount?: number, onRetry?: () => void }`. The parent screen reads `EventSource(`/api/m3/compliance/exports/:bundleId/stream`)`, advances `currentStepIndex` on each SSE message, and flips `status` to `'done'` on the final event (or `'failed'` on a `failure` event). Each step lights `--success` as it completes; the active step renders `--accent`. The component is dumb — the SSE wiring lives in the screen-level hook (`useBundleStatus`).

**Why:** SSE matches j9 §Notes ("Async progress streams via Server-Sent Events to the progress strip"). Polling would add ~1 s latency between events; SSE delivers each step transition within ~50 ms of the server emitting it. The component contract is pure presentational — making it SSE-naive keeps it testable without faking EventSource (the screen-level integration test mocks `useBundleStatus`).

`role="status"` + `aria-live="polite"` on the outer `<div>` — screen-reader users hear each step name as it transitions. The component uses `useMemo` to derive a stable label string (`stepLabel` of the active step) so the live region only re-announces on transitions, not on every prop change.

Rejected alternative: polling `GET /m3/compliance/exports/:bundleId` every 500 ms. Wastes connections + adds latency; SSE is already specified in slice #14's contract.

### ADR-J9-RECIPIENT-PICKER-COLLAPSED-BY-DEFAULT — email is opt-in

`RecipientPicker` renders two states:
- **Collapsed** (`expanded === false`): a single strip "Enviar también por email →" with a small ghost button to expand.
- **Expanded** (`expanded === true`): pre-configured contacts as checkboxes + an ad-hoc add input + a "Quitar" link per contact.

State is controlled (the parent owns `expanded` + `selectedAddresses`); no internal state.

**Why:** many bundles are downloaded by Iker first for a sanity check before forwarding to Marta (j9 §Decisions "Email is opt-in, not the default action"). Defaulting to expanded would encourage accidental sends. The contract document also states "boring before clever" — making the email path an explicit unfurl is the boring choice.

Rejected alternative: expanded by default with a "skip email" checkbox. Same operator-mistake risk; the unfurl pattern is the canonical opt-in.

### ADR-J9-I18N-FALLBACK-CHAIN — locale → es-ES → «key»

`TranslatorService.translate(key, locale, vars)` runs the lookup chain:

1. Look up `key` in the requested `locale` template; if found, format with ICU MessageFormat (variables in `vars`) and return.
2. Else look up `key` in `es-ES` (the default locale); if found, format with ICU and return; emit `console.warn` with `{ key, requested: locale, fallback: 'es-ES' }`.
3. Else return `«key»` (the key name wrapped in guillemets) and emit `console.warn` with `{ key, missing: 'all locales' }`. This makes a missing key obvious in the rendered bundle without crashing the generator.

The wrapped-key sentinel (`«key»`) is the inspector-visible clue that something is unseeded — better than empty strings or English placeholders. The OTel span integration for the warning is deferred per ADR-035 NFR-OBS-1 note; `console.warn` is sufficient for v1.

**Why:** ADR-035 mandates this chain. Returning a sentinel rather than throwing keeps the bundle generator unblocked (a partial-locale seed should still ship a usable bundle for the existing keys). The `console.warn` is a development affordance — the audit_log captures the bundle generation outcome (slice #14's concern) but the per-key fallback signal is a developer-side log.

Rejected alternative: throw on missing key. Forces the operator to wait for a full locale seed before any bundle can ship in that locale; the four locales were rolled out incrementally per ADR-035 sequencing.

### ADR-J9-ALLERGEN-VOCABULARY-INLINE-TABLE — EU 1169 Annex II × 4 locales

`allergen-vocabulary.ts` exports `getAllergenName(code, locale)` backed by an inline `Record<AllergenCode, Record<Locale, string>>` constant. The 14 canonical EU 1169 Annex II allergens (matching `packages/ui-kit/AllergenBadge`'s `AllergenCode` type) × 4 locales = 56 entries hard-coded.

**Why:** the vocabulary is regulator-defined and changes rarely (the EU Annex II has been stable since 2011). Hard-coding the lookup avoids a database round-trip per allergen lookup during bundle generation (PDF rendering iterates per allergen per recipe per chapter — a database lookup per cell would be wasteful). The vocabulary is also load-bearing per FR24 ("verbatim, not paraphrased") — keeping it in code review makes regulatory accuracy a code-level concern.

Note on count: the slice prompt mentions "12 allergens × 4 locales = 48 entries"; the canonical EU 1169 Annex II Annex actually has 14 declarable allergens, and `packages/ui-kit/AllergenBadge`'s exported `AllergenCode` type already enumerates all 14. We align with the existing canonical type (14 codes) rather than the prompt's count, on the principle that the ui-kit code is the canonical source of truth for the allergen taxonomy. Final entry count: 56.

Rejected alternative: load the vocabulary from a JSON file at runtime. Adds a filesystem read on first translate; the table is small enough (56 entries) to inline as a const.

### ADR-J9-NO-CONTRACTS-IMPORT — inline shapes in apps/web/src/api/appcc.ts

Per the cross-slice contract pattern (CRITICAL hard rule of this slice), all backend shapes (`Locale`, `Scope`, `ExportBundleStatus`, `ExportBundleSummary`, `GenerateBundleRequest`, request/response shapes) are INLINED in `apps/web/src/api/appcc.ts`. No import from `packages/contracts`. No import from `apps/api/src/compliance/*` or `apps/api/src/i18n/m3-export/*` (the i18n module is BACKEND-only — the frontend duplicates the `Locale` union type inline).

**Why:** slice #14 runs in parallel; importing from slice #14 would couple worktrees and create a build-order dependency. Inlined shapes let both worktrees ship without coordination; the conflict resolves at master merge (mechanical drift on `apps/web/src/api/appcc.ts` if slice #14's shapes drift).

The expected merge conflicts at master:
- `apps/web/src/main.tsx` (route registration) — mechanical.
- `packages/ui-kit/src/index.ts` (barrel re-export) — mechanical.
- `apps/api/src/app.module.ts` (I18nM3ExportModule import) — mechanical.

Rejected alternative: shared types in `packages/contracts`. Pre-Wave-2 we tried this; it forced both slices to land in the same wave or one to wait. The inlined-shape pattern landed in Wave 2.1 as the canonical cross-slice contract.

### ADR-J9-DEFAULTS-SERVE-RECURRING-CASE — last-90-day + es-ES + haccp+lot, from inline constants

On screen mount, the form defaults to:
- Range: `from = today - 90 days`, `to = today`.
- Locale: `es-ES`.
- Scope: `{ haccp: true, lot: true, procurement: false, photo: false, ai_obs: false }`.

These defaults come from inline constants in `AppccExportScreen.tsx`. The slice does NOT fetch the operator's last successful generation in this iteration; the inline default serves the quarterly recurring case directly (j9 §Notes "defaults serve the recurring case").

**Why:** the quarterly inspection is the dominant case (Marta arrives quarterly). Year-natural and quarter-closed chips exist for edge cases. Loading the operator's last-state would add a roundtrip on screen mount with no UX gain over the inline default. A future ergonomic slice can persist last-state when the value-of-personalization is proven.

Rejected alternative: preload from `GET /m3/compliance/exports?limit=1` and inherit the most recent bundle's config. Adds a roundtrip + couples first-paint to the archive endpoint; not worth the complexity for v1.

## Risks / Trade-offs

- **Risk**: slice #14 changes the SSE event names or the bundle response shape between master cuts → frontend progress strip breaks.
  - **Mitigation**: contract documented in the slice prompt (event names: `step_complete`, `failure`, `done`; bundle response includes `bundleId`, `status`, `sizeBytes`, `pageCount`, `pdfUrl`, `csvUrl`, `sha256`, `auditLogId`); cross-worktree review at master merge. The inlined-shape pattern localises the impact to `apps/web/src/api/appcc.ts`.
- **Risk**: `EventSource` is not available in all Vitest test environments → integration test cannot exercise the full SSE flow.
  - **Mitigation**: the integration test mocks `useBundleStatus` to return a synchronous state machine; a real-SSE INT lands as a follow-up per the slice prompt's "INT (real SSE stream + cross-locale screenshot diff) deferred to followup".
- **Risk**: i18n `TranslatorService` fallback warnings flood the dev console during local development with incomplete seeds.
  - **Mitigation**: the wrapped-key sentinel makes the missing key obvious in rendered output; the `console.warn` is gated to the dev environment (production callers can monkey-patch `console.warn` if desired). OTel span integration (deferred) will replace the console emit with a proper telemetry channel.
- **Risk**: `BundleArchiveTable` renders the last 10 bundles unpaginated; an org with frequent ad-hoc generation may exceed the visible viewport.
  - **Mitigation**: 10 rows is the cap from slice #14's API (`limit=10`). The j9 mock shows the same cap; pagination is a follow-up. Cold-storage rows (older than the retention window) are already visually muted with a `restaurar →` link, so the recent 10 are the live operating set.
- **Risk**: the transparency banner verbatim text drifts across surfaces (someone copy-pastes it into a different component).
  - **Mitigation**: encapsulating the text as a primitive (rather than inline copy) makes drift physically impossible. The component file is the single source of truth for the FR25 text. The unit test asserts the rendered text matches the verbatim const so accidental edits surface immediately.
- **Trade-off**: keeping the "✓ Verificar integridad bytes ↔ hash" button and the "Previsualizar cover + índice" button visible in the mock as inert in this slice.
  - **Decision**: render them as ghost buttons matching the mock so the visual fidelity is preserved; mark them as `disabled` or wire `onClick={() => {}}` so they are no-ops. Full hash verification + preview flows are follow-ups.
- **Trade-off**: 56 allergen × locale entries inlined vs database-backed.
  - **Decision**: inlined per ADR-J9-ALLERGEN-VOCABULARY-INLINE-TABLE. The EU 1169 Annex II is stable since 2011; rare updates are a code change that goes through review (which is the regulatory-safety affordance we want).

## Migration Plan

No data migrations. No schema changes. The slice introduces:

1. 7 new ui-kit primitives under `packages/ui-kit/src/components/{TransparencyBanner,LocaleChipGroup,ScopeCheckboxList,RecipientPicker,ExportProgressStrip,BundleDownloadRow,BundleArchiveTable}/`.
2. New screen `apps/web/src/screens/j9/AppccExportScreen.tsx`.
3. New REST client `apps/web/src/api/appcc.ts` + hooks `apps/web/src/hooks/useAppcc.ts`.
4. One new route line in `apps/web/src/main.tsx`.
5. One barrel block in `packages/ui-kit/src/index.ts`.
6. New i18n module `apps/api/src/i18n/m3-export/` (locales tuple, 4 template JSON files, `TranslatorService`, allergen vocabulary, `I18nM3ExportModule`).
7. One new `imports` entry in `apps/api/src/app.module.ts`.

Deploy = push & restart. Rollback = revert PR. The 7 new ui-kit primitives are inert if not consumed; leaving them in place after rollback is harmless. The i18n module exports a single service; removing the import from `app.module.ts` is sufficient to revert (the JSON template files become dead but inert).

## Open Questions

- Does slice #14 emit one SSE `step_complete` event per step name (e.g. `index_audit_log`, `compose_chapter_0`, `render_derivatives`, `seal_hash`, `done`)? This slice assumes that exact step taxonomy (5 steps); if slice #14 emits a different sequence, the `ExportProgressStrip` props can be re-mapped at the screen level without component changes.
- The "operator's last successful generation" preload — assumed not in this slice; M3.x ergonomic.
- Per-organization persisted locale config (`organizations.export_locale` column per ADR-035) — assumed to land in a follow-up migration; this slice reads the locale from operator selection at trigger time and defaults to es-ES as the operator-default.
- Full OTel span integration for fallback warnings (NFR-OBS-1) — deferred per the ADR-035 note; this slice emits `console.warn`.
