## 1. i18n m3-export module (apps/api/src/i18n/m3-export/)

- [ ] 1.1 `locales.ts` — `Locale` union (`es-ES | ca-ES | eu-ES | gl-ES`), `DEFAULT_LOCALE`, `ALL_LOCALES` readonly tuple.
- [ ] 1.2 `templates/{es,ca,eu,gl}.json` — ICU MessageFormat templates seeded with ≥40 keys (chapter titles, table headers, signature block, recipient line, cover-page). Placeholders use `{var}` syntax.
- [ ] 1.3 `translator.service.ts` — `TranslatorService.translate(key, locale, vars)`. Fallback chain: `locale → es-ES → «key»`. Emits `console.warn` on fallback.
- [ ] 1.4 `allergen-vocabulary.ts` — `getAllergenName(code, locale)`. EU 1169 Annex II × 4 locales (14 × 4 = 56 entries).
- [ ] 1.5 `i18n.module.ts` — `I18nM3ExportModule` exporting `TranslatorService`.
- [ ] 1.6 `translator.service.spec.ts` — fallback chain assertions: known key in locale, fallback to es-ES emits warn, missing-everywhere returns wrapped key.
- [ ] 1.7 `allergen-vocabulary.spec.ts` — known code returns localised name for all 4 locales; unknown code returns code wrapped in guillemets.
- [ ] 1.8 Wire `I18nM3ExportModule` into `apps/api/src/app.module.ts` `imports`.

## 2. REST client + types (inlined, no contracts import)

- [ ] 2.1 `apps/web/src/api/appcc.ts` — INLINE shapes for `Locale`, `Scope`, `ExportBundleStatus`, `ExportBundleSummary`, `GenerateBundleRequest`, request/response DTOs. URL paths match slice #14's: `POST /m3/compliance/exports`, `GET /m3/compliance/exports/:bundleId`, `GET /m3/compliance/exports?limit=10`, `GET /m3/compliance/exports/:bundleId/pdf` + `/csv`, `GET /m3/compliance/exports/:bundleId/stream`.
- [ ] 2.2 Functions wrap `api()` helper from `apps/web/src/api/client.ts`. Pattern mirrors `apps/web/src/api/recall.ts`.

## 3. TanStack Query hooks

- [ ] 3.1 `apps/web/src/hooks/useAppcc.ts` — four hooks:
  - `useBundleArchive(orgId, limit=10)` — archive table data.
  - `useGenerateBundle()` — mutation; on success, invalidates `['appcc','archive',orgId]`.
  - `useBundleStatus(orgId, bundleId)` — polling fallback; SSE wiring lives in the screen via `EventSource`.
  - `useDownloadBundle(orgId, bundleId, kind)` — returns the signed download URL (proxy through `/api` is the standard pattern).

## 4. ui-kit — TransparencyBanner

- [ ] 4.1 `packages/ui-kit/src/components/TransparencyBanner/TransparencyBanner.tsx` — static mute paragraph with verbatim FR25 text as a const.
- [ ] 4.2 `TransparencyBanner.types.ts` — exported `TransparencyBannerProps` (optional `className` only).
- [ ] 4.3 `TransparencyBanner.test.tsx` — asserts rendered text matches the verbatim const; asserts `role="note"`.
- [ ] 4.4 `TransparencyBanner.stories.tsx` — 1 story (default — verbatim text is the only state).
- [ ] 4.5 Export from barrel + index.ts.

## 5. ui-kit — LocaleChipGroup

- [ ] 5.1 `packages/ui-kit/src/components/LocaleChipGroup/LocaleChipGroup.tsx` — 4 chips single-select, `<div role="group">` + 4 `<button aria-pressed>`. Mute footer line per j9 §Region 3.
- [ ] 5.2 `LocaleChipGroup.types.ts` — exported `Locale`, `LocaleOption`, `LocaleChipGroupProps`. (`Locale` duplicated here for ui-kit independence — frontend `apps/web/src/api/appcc.ts` keeps its own copy.)
- [ ] 5.3 `LocaleChipGroup.test.tsx` — single-select enforced, click fires onChange with correct locale, default options render all 4.
- [ ] 5.4 `LocaleChipGroup.stories.tsx` — 4 stories (one per locale selected).
- [ ] 5.5 Export from barrel + index.ts.

## 6. ui-kit — ScopeCheckboxList

- [ ] 6.1 `packages/ui-kit/src/components/ScopeCheckboxList/ScopeCheckboxList.tsx` — 5 checkbox rows with mute descriptions. Defaults: haccp + lot checked (parent owns state).
- [ ] 6.2 `ScopeCheckboxList.types.ts` — exported `ScopeKey`, `Scope`, `ScopeCheckboxListProps`.
- [ ] 6.3 `ScopeCheckboxList.test.tsx` — covers: all 5 rows render with descriptions, toggle fires onChange with mutated scope, multi-toggle works.
- [ ] 6.4 `ScopeCheckboxList.stories.tsx` — 2 stories (defaults, all-checked).
- [ ] 6.5 Export from barrel + index.ts.

## 7. ui-kit — RecipientPicker

- [ ] 7.1 `packages/ui-kit/src/components/RecipientPicker/RecipientPicker.tsx` — collapsed/expanded states from `expanded` prop. Expanded: list of preconfigured contacts as checkboxes + ad-hoc add input.
- [ ] 7.2 `RecipientPicker.types.ts` — exported `RecipientOption`, `RecipientPickerProps`.
- [ ] 7.3 `RecipientPicker.test.tsx` — covers: collapsed renders single strip, expanded renders contacts + add input, toggling a contact fires onChange, adding an ad-hoc address fires onChange.
- [ ] 7.4 `RecipientPicker.stories.tsx` — 2 stories (collapsed, expanded with contacts).
- [ ] 7.5 Export from barrel + index.ts.

## 8. ui-kit — ExportProgressStrip

- [ ] 8.1 `packages/ui-kit/src/components/ExportProgressStrip/ExportProgressStrip.tsx` — pure presentational component. `role="status"` + `aria-live="polite"`. Steps light `--success` as `currentStepIndex` advances; active step renders `--accent`. Failure state renders last step `--destructive` + retry button.
- [ ] 8.2 `ExportProgressStrip.types.ts` — exported `ProgressStep`, `ExportProgressStripProps`, `ExportProgressStatus`.
- [ ] 8.3 `ExportProgressStrip.test.tsx` — covers: idle renders all steps mute, advancing currentStepIndex lights done steps success, failed status renders destructive + retry button fires onRetry.
- [ ] 8.4 `ExportProgressStrip.stories.tsx` — 4 stories (idle, in-progress, done, failed).
- [ ] 8.5 Export from barrel + index.ts.

## 9. ui-kit — BundleDownloadRow

- [ ] 9.1 `packages/ui-kit/src/components/BundleDownloadRow/BundleDownloadRow.tsx` — two ghost buttons (PDF + CSV) + mute eyebrow with SHA-256 + audit_log id + optional email-dispatched line.
- [ ] 9.2 `BundleDownloadRow.types.ts` — exported `BundleDownloadRowProps`.
- [ ] 9.3 `BundleDownloadRow.test.tsx` — covers: PDF + CSV buttons fire callbacks, hash + audit_log id render in eyebrow, email line renders when dispatchedRecipients > 0.
- [ ] 9.4 `BundleDownloadRow.stories.tsx` — 2 stories (default, with-email-dispatched).
- [ ] 9.5 Export from barrel + index.ts.

## 10. ui-kit — BundleArchiveTable

- [ ] 10.1 `packages/ui-kit/src/components/BundleArchiveTable/BundleArchiveTable.tsx` — flat table of last 10 bundles. Cold-storage rows render mute `restaurar →` link (inert).
- [ ] 10.2 `BundleArchiveTable.types.ts` — exported `BundleArchiveRow`, `BundleArchiveTableProps`.
- [ ] 10.3 `BundleArchiveTable.test.tsx` — covers: caps at 10 rows, cold-storage rows carry data-archived="true", download link fires onDownload with the row's bundleId.
- [ ] 10.4 `BundleArchiveTable.stories.tsx` — 2 stories (typical, with-cold-storage).
- [ ] 10.5 Export from barrel + index.ts.

## 11. Screen — AppccExportScreen

- [ ] 11.1 `apps/web/src/screens/j9/AppccExportScreen.tsx` — composes Header + TransparencyBanner + DateRangePicker (thin wrapper around two native `<input type="date">` with quick chips) + LocaleChipGroup + ScopeCheckboxList + RecipientPicker (collapsed by default) + Generate CTA + ExportProgressStrip + BundleDownloadRow + BundleArchiveTable.
- [ ] 11.2 State machine: idle → generating (SSE stream) → ready | failed.
- [ ] 11.3 Defaults: last-90-day range + es-ES locale + haccp+lot scope (inline constants).
- [ ] 11.4 On submit: call `useGenerateBundle().mutateAsync(...)`, open `EventSource` for the returned bundleId, advance progress strip on each SSE event, render BundleDownloadRow on done.
- [ ] 11.5 `AppccExportScreen.test.tsx` — integration test: render → assert default range chip selected → flip locale → toggle scope → submit → mock SSE stream → assert progress strip transitions → assert BundleDownloadRow renders.

## 12. Route registration

- [ ] 12.1 `apps/web/src/main.tsx` — add `{ path: 'compliance/export', element: <AppccExportScreen /> }` to the router children. Add lazy import.

## 13. End-to-end verification

- [ ] 13.1 Verify Vitest reports zero red across `packages/ui-kit` + `apps/web` + `apps/api`.
- [ ] 13.2 Verify the screen renders when `VITE_DEMO_USER_ROLE='OWNER'` + `VITE_DEMO_ORG_ID='org-1'`.

## Deferred

- **Real SSE stream INT** — j9 §Notes "Async progress streams via Server-Sent Events"; the integration test mocks `useBundleStatus`. A real-EventSource flow lands as a follow-up INT slice.
- **Cross-locale screenshot diff** — visual diff across all 4 locale templates; Storybook stories cover the static states for now.
- **Per-organization persisted locale config** — `organizations.export_locale` column per ADR-035; assumed to land in a follow-up migration.
- **OTel span integration for fallback warnings** — NFR-OBS-1; this slice emits `console.warn`. Replace with OTel span when the AI obs slice extends to i18n telemetry.
- **Operator-last-state preload** — first-paint defaults serve the quarterly recurring case from inline constants. Personalisation is a follow-up.
- **Bundle hash verification on the client** — "✓ Verificar integridad bytes ↔ hash" button renders inert; full SHA-256 check on the downloaded file is M3.x.
- **Cover + index preview** — "👁 Previsualizar cover + índice" button renders inert; preview lands in M3.x.
- **Schedule / recurrence panel** — the "Auto-export trimestral" card renders as an inert stub; full recurrence config + cron seam is M3.x.
- **Cold-storage restore flow** — `restaurar →` link renders inert; the restore endpoint lands in a follow-up under ADR-029.
- **Hermes / WhatsApp surface** — same MCP capability, different surface; separate slice.
- **Bundle template version selector** — "Formato 2026-Q2 v4" label in mock is rendered inert; version pinning is M3.x.
- **Quick-export 1-click card** — visible in mock as a separate quick-trigger; rendered as a thin "use defaults" affordance, full preset+last-config recall is M3.x.
- **More-than-10 archive pagination** — j9 archive caps at 10 per slice #14's contract; pagination beyond the cap is M3.x.
