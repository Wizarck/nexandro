## Why

Slice #14 `m3-appcc-export-bundle-service` (Wave 2.7 sibling, parallel worktree) builds the **producer side** of M3 APPCC export: it lands the bundle generator + `POST /m3/compliance/exports`, `GET /m3/compliance/exports/:bundleId`, `GET /m3/compliance/exports?limit=10`, `GET /m3/compliance/exports/:bundleId/pdf` + `/csv`, `GET /m3/compliance/exports/:bundleId/stream` (SSE progress). None of that is visible to Iker (Multi-Location Owner) on his laptop — there is no surface in `apps/web/` that lets him pick a date range + locale + scope, watch the bundle render, and download or email the PDF + CSV companion.

This slice (#15) ships the **consumer side** + the **i18n infrastructure** that the producer consumes: a `/compliance/export` route rendering the j9 mock as 7 production components composed into one screen, plus a new `apps/api/src/i18n/m3-export/` module (per ADR-035) that lands the four-locale ICU MessageFormat template seed + the EU 1169 Annex II allergen vocabulary lookup table + the `TranslatorService` with the `locale → es-ES → wrapped key («…»)` fallback chain. FR21 (configurable date range), FR22 (configurable scope), FR23 (multilingual templates), FR24 (EU 1169 allergen vocabulary), and FR25 (raw audit_log chapter 0 + structured derivative chapters — surfaced verbatim on the transparency banner) close at end of this slice. The j9 mock at `master/docs/ux/variants/mock-j9-appcc-export.html` is the canonical visual reference.

The i18n module lives in `apps/api/` because the templates ARE the bundle (FR23 + FR24 are backend concerns — they ship inside the PDF Marta opens, not in the React UI), but they are OWNED by this slice per ADR-035. Slice #14's bundle generator will CONSUME the `TranslatorService` at integration time at master; this slice ships the templates + the translator without coupling to slice #14's BC code.

This slice is **UI-heavy + a thin backend i18n seed**. We never write to `apps/api/src/compliance/*` — slice #14 owns the bundle generator endpoints; this slice ships only the React surface that calls those endpoints + the i18n templates the generator will consume. No new BC. No migrations.

## What Changes

- **`apps/api/src/i18n/m3-export/locales.ts`** — exported `Locale = 'es-ES' | 'ca-ES' | 'eu-ES' | 'gl-ES'`, `DEFAULT_LOCALE = 'es-ES'`, `ALL_LOCALES` readonly tuple.
- **`apps/api/src/i18n/m3-export/templates/{es,ca,eu,gl}.json`** — ICU MessageFormat templates seeded with 40-50 keys covering chapter titles, table headers, signature block labels, recipient lines. Placeholders use `{var}` syntax.
- **`apps/api/src/i18n/m3-export/translator.service.ts`** — `TranslatorService.translate(key, locale, vars)` with `locale → es-ES → «key»` fallback chain. Emits a `console.warn` on fallback (full OTel span integration is a deferred follow-up per ADR-035 NFR-OBS-1 note).
- **`apps/api/src/i18n/m3-export/allergen-vocabulary.ts`** — EU 1169 Annex II allergen lookup. `getAllergenName(code, locale)` returns the localised vocabulary verbatim (14 allergens × 4 locales — codes match the canonical `AllergenCode` already exported by `packages/ui-kit/AllergenBadge`).
- **`apps/api/src/i18n/m3-export/i18n.module.ts`** — `I18nM3ExportModule` exports `TranslatorService` for downstream consumption.
- **`apps/api/src/app.module.ts`** — register `I18nM3ExportModule` in the `imports` list.
- **`packages/ui-kit/src/components/TransparencyBanner/`** — static mute paragraph carrying the verbatim FR25 trust-principle text. Reusable for cover-page contract surfaces.
- **`packages/ui-kit/src/components/LocaleChipGroup/`** — 4 chips, single-select (es-ES default). Visual permanence per j9 §Decisions ("locale chips, not a dropdown").
- **`packages/ui-kit/src/components/ScopeCheckboxList/`** — 5 checkbox rows (haccp / lot / procurement / photo / ai_obs). Each row carries a `--mute` description. Defaults: haccp + lot checked.
- **`packages/ui-kit/src/components/RecipientPicker/`** — collapsed strip "Enviar también por email →"; expands to show pre-configured contacts + ad-hoc add. Default = collapsed (email is opt-in per j9 §Decisions).
- **`packages/ui-kit/src/components/ExportProgressStrip/`** — stepped progress display ("Indexando audit_log ▸ Componiendo capítulo 0 ▸ Renderizando vistas derivativas ▸ Sellando hash de bundle ▸ Listo"). `role="status"` + `aria-live="polite"`. Failure state rolls last step to `--destructive` + mounts retry button.
- **`packages/ui-kit/src/components/BundleDownloadRow/`** — two ghost buttons (PDF + CSV); mute eyebrow with bundle SHA-256 hash + audit_log entry id; optional email-dispatched line.
- **`packages/ui-kit/src/components/BundleArchiveTable/`** — flat table of last 10 bundles: date, range, locale, scope, who, download link, optional `restaurar →` for cold-storage rows.
- **`apps/web/src/screens/j9/AppccExportScreen.tsx`** — new page mounted at `/compliance/export`. Composes the 7 components above + DateRangePicker thin wrapper around two native `<input type="date">` + quick chips. State machine: idle → generating (SSE stream) → ready | failed. Defaults: last-90-day range, es-ES locale, haccp+lot scope.
- **`apps/web/src/api/appcc.ts`** — REST client wrapping `api()` for the 5 slice-#14 endpoints. INLINE shapes (`Locale`, `Scope`, `ExportBundleStatus`, `ExportBundleSummary`, `GenerateBundleRequest`, etc.). No `@opentrattos/contracts` import. No import from `apps/api/src/compliance/*`.
- **`apps/web/src/hooks/useAppcc.ts`** — TanStack hooks: `useBundleArchive`, `useGenerateBundle`, `useBundleStatus`, `useDownloadBundle`.
- **`apps/web/src/main.tsx`** — register `/compliance/export` route + lazy import.
- **BREAKING**: none. New components + new route + new client + new i18n module. No schema changes. Wave 2.6 haccp-ui stays untouched; slice #14 owns all bundle-generator backend.

## Capabilities

### New Capabilities

- `appcc-ui`: Owner / Manager laptop surface at `/compliance/export` rendering j9 with 7 ui-kit components; default range last-90-day + default locale es-ES + default scope haccp+lot; SSE-streamed progress strip; PDF + CSV download row with SHA-256 hash + audit_log entry id; bundle archive table reading the last 10 bundles from slice #14's read model; transparency banner with verbatim FR25 trust-principle text (load-bearing cover-page contract for the inspector).
- `i18n-m3-export`: `apps/api/src/i18n/m3-export/` module (per ADR-035) carrying 4 locales × ICU MessageFormat template seed + EU 1169 Annex II allergen vocabulary + `TranslatorService` with `locale → es-ES → «key»` fallback chain. Consumed by slice #14's bundle generator at integration time at master.

### Modified Capabilities

- None. This slice creates two new surfaces (UI + i18n) entirely. Slice #14 owns the compliance BC; this slice consumes its REST API + supplies its translator.

## Impact

- **Prerequisites**: master at `ef23364`; slice #14 (`m3-appcc-export-bundle-service`, sibling Wave 2.7) provides the bundle generator + REST endpoints. We code defensively: the URL paths in `apps/web/src/api/appcc.ts` match slice #14's prompt verbatim. If slice #14's shapes diverge at master merge, the resolver picks up the conflict; no shared `packages/contracts` import couples the two slices. The `apps/api/src/i18n/m3-export/` module is independent of slice #14's bundle generator — slice #14 consumes the exported `TranslatorService` at integration time.
- **Code**:
  - `apps/api/src/i18n/m3-export/**` — new module: locales tuple, 4 template JSON files, `TranslatorService`, allergen vocabulary, `I18nM3ExportModule` (~250 LOC + ~150 LOC tests).
  - `packages/ui-kit/src/components/{TransparencyBanner,LocaleChipGroup,ScopeCheckboxList,RecipientPicker,ExportProgressStrip,BundleDownloadRow,BundleArchiveTable}/` — 7 new primitives with Storybook stories (~900 LOC + ~450 LOC tests).
  - `apps/web/src/screens/j9/AppccExportScreen.tsx` + integration test (~350 LOC + ~200 LOC tests).
  - `apps/web/src/api/appcc.ts` + `apps/web/src/hooks/useAppcc.ts` — ~200 LOC.
  - `apps/web/src/main.tsx` — one new route entry.
  - `apps/api/src/app.module.ts` — one new `imports` entry.
- **Performance**:
  - Live progress strip is driven by SSE (`GET /m3/compliance/exports/:bundleId/stream`); each event mounts a new step's `--success` state. No polling.
  - First paint ≤ 1 s on slow Wi-Fi (j9 §Notes for implementation). In this slice the locale picker + scope checkboxes default to es-ES + haccp+lot from inline constants; full operator-last-state recall is a follow-up.
  - Bundle archive query latency: ~200 ms; backend SLO owned by slice #14.
- **Storage growth**: none — the i18n module ships JSON template files (~12 KB total per locale on disk; 4 locales ≈ 48 KB shipped). No database growth.
- **Audit**: every successful bundle generation writes one `audit_log` row of type `APPCC_EXPORT_BUNDLE_GENERATED` (slice #14 emits this). The screen reads no audit rows directly; it queries `GET /m3/compliance/exports` which slice #14 backs. From this slice's perspective the contract is "GET returns last 10 bundles".
- **Rollback**:
  - Remove `apps/web/src/screens/j9/AppccExportScreen.tsx` + the route entry from `main.tsx`. Remove `I18nM3ExportModule` from `app.module.ts`. No data migration to revert.
  - `packages/ui-kit/` additions are pure-new; nothing references them outside this slice. The 7 new primitives can be left in place even after rollback — they're inert without their consumer.
  - The `apps/api/src/i18n/m3-export/` module exports a single service; removing the import from `app.module.ts` is sufficient to revert.
- **Out of scope** (claimed by other slices or future follow-ups):
  - Bundle generation BC + 5 REST endpoints (slice #14 sibling).
  - PDF chaptering implementation (slice #14 — uses the `TranslatorService` exported here).
  - Per-organization persisted locale config (`organizations.export_locale` column per ADR-035) — assumed to land in a follow-up migration slice; this slice reads the locale from operator selection at trigger time and treats es-ES as the operator-default.
  - OTel span integration for fallback warnings (NFR-OBS-1 — emitted as `console.warn` in this slice; OTel span integration is deferred per ADR-035 note).
  - Bundle preview-before-generate (j9 §Decisions "No preview the PDF before generating affordance" — deliberately excluded).
  - Email dispatch handler hookup (the RecipientPicker collects recipients; slice #14 wires the actual send via ADR-039 `EmailDispatchService`).
  - Bundle hash verification button — rendered as inert ghost button in the BundleDownloadRow ("✓ Verificar integridad bytes ↔ hash") visible in the mock; full client-side SHA-256 check on the downloaded file is a follow-up.
  - Bundle cold-storage restore flow — `restaurar →` link in the BundleArchiveTable renders but is inert; the restore endpoint is a follow-up under ADR-029 retention archival.
  - Hermes / WhatsApp surface for APPCC export — same MCP capability, different surface; lives in Hermes slice, not this slice.
  - Schedule / recurrence panel ("Auto-export trimestral" visible in the mock) — rendered as inert ghost stub; the recurrence-config surface + cron seam is a follow-up.
  - Cross-locale screenshot diff INT — deferred per slice prompt; covered by ui-kit Storybook stories.
- **Parallelism**: file-path scope = `packages/ui-kit/src/components/{TransparencyBanner,LocaleChipGroup,ScopeCheckboxList,RecipientPicker,ExportProgressStrip,BundleDownloadRow,BundleArchiveTable}/**`, `apps/web/src/screens/j9/**`, `apps/web/src/api/appcc.ts`, `apps/web/src/hooks/useAppcc.ts`, `apps/api/src/i18n/m3-export/**`, plus one route line in `apps/web/src/main.tsx`, one new `packages/ui-kit/src/index.ts` barrel block, and one new `imports` entry in `apps/api/src/app.module.ts`. Verified disjoint from siblings:
  - Slice #14 `m3-appcc-export-bundle-service` writes to `apps/api/src/compliance/` (or similar BC dir) — disjoint from `apps/api/src/i18n/m3-export/`.
  - Wave 2.6 slices wrote to `apps/api/src/haccp/` + `apps/web/src/screens/j10/` — disjoint.
  - Wave 2.5 slices wrote to `apps/api/src/recall/` + `apps/web/src/m3/recall/` — disjoint.
- **Effort estimate**: M (~1 700 LOC implementation + ~800 LOC tests; matches gate-c slice list "M" sizing for frontend-heavy slices with a thin backend i18n seed).
