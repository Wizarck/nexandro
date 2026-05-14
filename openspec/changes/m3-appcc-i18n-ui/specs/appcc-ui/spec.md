## ADDED Requirements

### Requirement: Route /compliance/export renders the j9 APPCC export trigger surface

The system SHALL mount a new route `/compliance/export` in `apps/web/src/main.tsx` rendering the j9 APPCC export trigger screen for Owner + Manager roles. The screen SHALL compose the 7 j9 components (`TransparencyBanner`, `LocaleChipGroup`, `ScopeCheckboxList`, `RecipientPicker`, `ExportProgressStrip`, `BundleDownloadRow`, `BundleArchiveTable`) plus a thin DateRangePicker inside the standard `<App>` shell. Defaults: last-90-day range, `es-ES` locale, scope `{ haccp: true, lot: true, procurement: false, photo: false, ai_obs: false }`.

#### Scenario: Owner navigates to /compliance/export and sees the surface with default selections

- **GIVEN** the demo user has `VITE_DEMO_USER_ROLE='OWNER'` and `VITE_DEMO_ORG_ID='org-1'`
- **WHEN** the user navigates to `/compliance/export`
- **THEN** the page renders the eyebrow `Exportación APPCC · expediente para autoridad sanitaria`, the headline `Generar bundle de auditoría`, the TransparencyBanner with the verbatim FR25 text, the LocaleChipGroup with `es-ES` selected (`aria-pressed="true"` on the Castellano chip), the ScopeCheckboxList with `haccp` and `lot` checked, and the BundleArchiveTable below the form.

#### Scenario: Unsigned user sees a signed-out fallback

- **GIVEN** `VITE_DEMO_USER_ROLE` is unset
- **WHEN** the user navigates to `/compliance/export`
- **THEN** the page renders a signed-out placeholder; no hooks fire fetches.

### Requirement: TransparencyBanner renders the FR25 trust-principle text verbatim

The `TransparencyBanner` component SHALL render a static `--mute` italic paragraph carrying the verbatim FR25 trust-principle text: *"El expediente contiene el audit_log sin editar como capítulo 0; el resto son vistas estructuradas sobre ese mismo registro. No producimos resumen ejecutivo."* The text SHALL be encoded as a const inside the component file; consumers MUST NOT be able to override the text via props.

#### Scenario: rendered text matches the verbatim contract

- **GIVEN** a mounted `<TransparencyBanner />`
- **THEN** the rendered element has `role="note"` AND its text content includes `"El expediente contiene el audit_log sin editar como capítulo 0"` AND `"No producimos resumen ejecutivo."`

#### Scenario: component accepts only an optional className

- **GIVEN** a mounted `<TransparencyBanner className="custom-class" />`
- **THEN** the rendered element carries the `custom-class` class; no other props are exposed on the type signature.

### Requirement: LocaleChipGroup enforces single-select with visual permanence

The `LocaleChipGroup` SHALL render exactly 4 chips (`es-ES`, `ca-ES`, `eu-ES`, `gl-ES`). Each chip SHALL be a `<button type="button">` with `aria-pressed` reflecting selection. The chip group SHALL be wrapped in a `<div role="group" aria-label="Idioma">`. Single-select is enforced: selecting one chip SHALL clear `aria-pressed` on the other three. The component SHALL render a mute footer line: `"La localización determina el idioma de los encabezados, etiquetas, y vocabulario de alérgenos."`.

#### Scenario: clicking a chip fires onChange with that locale and updates aria-pressed

- **GIVEN** a mounted `<LocaleChipGroup value="es-ES" onChange={onChange} />`
- **WHEN** the user clicks the chip with text `Català (ca-ES)`
- **THEN** `onChange` is called with `"ca-ES"`

#### Scenario: a single chip has aria-pressed=true at any time

- **GIVEN** a mounted `<LocaleChipGroup value="eu-ES" onChange={() => {}} />`
- **THEN** exactly one `<button>` in the group has `aria-pressed="true"`, and that button's text contains `"Euskara (eu-ES)"`

### Requirement: ScopeCheckboxList renders 5 scope rows with defaults haccp + lot checked

The `ScopeCheckboxList` SHALL render 5 rows: `haccp`, `lot`, `procurement`, `photo`, `ai_obs`. Each row SHALL contain a native `<input type="checkbox">` + a label + a one-line `--mute` description. The component SHALL be a controlled component (the parent owns the `value` state object).

#### Scenario: the consuming screen passes defaults haccp+lot checked

- **GIVEN** a mounted `<ScopeCheckboxList value={{ haccp: true, lot: true, procurement: false, photo: false, ai_obs: false }} onChange={() => {}} />`
- **THEN** exactly 2 checkboxes are checked (the haccp + lot rows); the other 3 are unchecked.

#### Scenario: toggling a row fires onChange with the mutated scope

- **GIVEN** a mounted `<ScopeCheckboxList value={{ haccp: true, lot: true, procurement: false, photo: false, ai_obs: false }} onChange={onChange} />`
- **WHEN** the user clicks the `procurement` checkbox
- **THEN** `onChange` is called with `{ haccp: true, lot: true, procurement: true, photo: false, ai_obs: false }`

### Requirement: ExportProgressStrip transitions through steps with aria-live announcements

The `ExportProgressStrip` SHALL render a stepped progress display with `role="status"` and `aria-live="polite"` on the outer container. Each step in the `steps` prop SHALL render as a row with a dot + a label. Steps with index `< currentStepIndex` SHALL render `--success`; the step at `currentStepIndex` SHALL render `--accent` (active); steps with index `> currentStepIndex` SHALL render `--mute` (pending). When `status === 'failed'`, the step at `currentStepIndex` SHALL render `--destructive` and a `Reintentar` button SHALL mount inline.

#### Scenario: idle state — all steps render mute

- **GIVEN** a mounted `<ExportProgressStrip steps={steps} currentStepIndex={0} status="in-progress" />` where `steps` has 5 entries
- **THEN** the outer container has `role="status"` AND `aria-live="polite"`, AND step 0 renders with `data-step-state="active"`, AND steps 1-4 render with `data-step-state="pending"`

#### Scenario: advancing currentStepIndex marks earlier steps done

- **GIVEN** a mounted `<ExportProgressStrip steps={steps} currentStepIndex={2} status="in-progress" />`
- **THEN** steps 0-1 render with `data-step-state="done"`, step 2 with `data-step-state="active"`, steps 3-4 with `data-step-state="pending"`

#### Scenario: failed status renders destructive step + retry button

- **GIVEN** a mounted `<ExportProgressStrip steps={steps} currentStepIndex={3} status="failed" onRetry={onRetry} />`
- **THEN** step 3 renders with `data-step-state="failed"`, AND a `Reintentar` button is present, AND clicking it fires `onRetry`.

### Requirement: BundleDownloadRow surfaces the SHA-256 hash + audit_log entry id verbatim

The `BundleDownloadRow` SHALL render two ghost buttons (PDF + CSV downloads) and a `--mute` eyebrow containing the bundle SHA-256 hash (as `code`) + the audit_log entry id (as `code`). Optionally a third line surfaces `"Enviado a N destinatarios"` when `dispatchedRecipients > 0`. Each ghost button SHALL be a `<button type="button">` firing the appropriate callback (`onDownloadPdf` or `onDownloadCsv`).

#### Scenario: download buttons fire callbacks

- **GIVEN** a mounted `<BundleDownloadRow bundle={bundle} onDownloadPdf={onPdf} onDownloadCsv={onCsv} />`
- **WHEN** the user clicks the PDF button
- **THEN** `onPdf` is called once.

#### Scenario: hash + audit_log id render in the eyebrow

- **GIVEN** a mounted `<BundleDownloadRow bundle={{ ..., sha256: 'a9f3…b274', auditLogId: 'AL-2026-189554', ... }} ... />`
- **THEN** the rendered element contains the text `"a9f3…b274"` AND `"AL-2026-189554"`.

#### Scenario: email-dispatched line renders when dispatchedRecipients > 0

- **GIVEN** a mounted `<BundleDownloadRow bundle={bundle} dispatchedRecipients={2} ... />`
- **THEN** the rendered element contains text matching `/Enviado a 2 destinatarios/`.

### Requirement: BundleArchiveTable renders up to 10 bundles, marking cold-storage rows

The `BundleArchiveTable` SHALL render at most 10 rows. Each row SHALL display generated-at timestamp, range, locale, scope summary, generating actor, hash short-form, and a download link. Cold-storage rows (older than the retention window) SHALL carry `data-archived="true"` AND render a `restaurar →` link (inert in this slice).

#### Scenario: 12 rows in the data → exactly 10 rendered

- **GIVEN** a mounted `<BundleArchiveTable rows={12-row-array} />`
- **THEN** exactly 10 `<tr>` rows are visible in the table body.

#### Scenario: cold-storage row carries data-archived="true"

- **GIVEN** a mounted `<BundleArchiveTable rows={[{ ..., archived: true }, { ..., archived: false }]} />`
- **THEN** the first row has `data-archived="true"` AND contains a `restaurar →` link.

### Requirement: TranslatorService falls back locale → es-ES → wrapped-key sentinel

The `TranslatorService` SHALL look up a translation key in the requested locale; on miss, it SHALL look up the key in `es-ES` and emit a `console.warn` indicating the fallback; on miss in `es-ES` it SHALL return the key wrapped in guillemets (`«key»`) and emit a `console.warn` indicating the missing-everywhere state. ICU MessageFormat variables in `vars` SHALL be applied to the matched template string.

#### Scenario: known key in requested locale returns the template formatted with vars

- **GIVEN** `templates/es.json` has `"chapter.0.title": "Capítulo 0 · Registro de auditoría sin editar"` AND no variable in the template
- **WHEN** `translate('chapter.0.title', 'es-ES', {})` runs
- **THEN** it returns `"Capítulo 0 · Registro de auditoría sin editar"`

#### Scenario: unknown key in eu-ES falls back to es-ES with a warn

- **GIVEN** `templates/eu.json` is missing the key `cover.signed_by` AND `templates/es.json` has `"cover.signed_by": "Firmado por {actor}"`
- **WHEN** `translate('cover.signed_by', 'eu-ES', { actor: 'Iker' })` runs
- **THEN** it returns `"Firmado por Iker"` AND `console.warn` is called once.

#### Scenario: missing-everywhere returns wrapped-key sentinel

- **GIVEN** none of the 4 templates has a key `nonexistent.key`
- **WHEN** `translate('nonexistent.key', 'eu-ES', {})` runs
- **THEN** it returns `"«nonexistent.key»"` AND `console.warn` is called.

### Requirement: getAllergenName returns EU 1169 Annex II vocabulary verbatim per locale

The `getAllergenName(code, locale)` function SHALL return the EU 1169 Annex II allergen name for the requested code in the requested locale, verbatim from the inline lookup table. For an unknown code, it SHALL return the code wrapped in guillemets.

#### Scenario: known code in es-ES returns the localised name

- **GIVEN** the canonical code `'gluten'`
- **WHEN** `getAllergenName('gluten', 'es-ES')` runs
- **THEN** it returns `"Gluten"` (or the canonical Spanish vocabulary entry).

#### Scenario: known code in eu-ES returns the Basque vocabulary

- **GIVEN** the canonical code `'milk'`
- **WHEN** `getAllergenName('milk', 'eu-ES')` runs
- **THEN** it returns the Basque vocabulary entry from the inline table (a non-empty string distinct from the Spanish entry).

#### Scenario: unknown code returns wrapped-code sentinel

- **GIVEN** an unknown code `'unicorn'`
- **WHEN** `getAllergenName('unicorn', 'es-ES')` runs
- **THEN** it returns `"«unicorn»"`.

### Requirement: AppccExportScreen submits the bundle request and surfaces SSE-driven progress

On submit, the `AppccExportScreen` SHALL call `useGenerateBundle().mutateAsync({ organizationId, from, to, locale, scope, recipients })` and on success SHALL open an `EventSource` for `/api/m3/compliance/exports/:bundleId/stream`. Each SSE message advances `currentStepIndex`; a `done` event flips status to `done` and renders the BundleDownloadRow; a `failure` event flips status to `failed` and mounts the retry button.

#### Scenario: submit happy path → progress strip transitions → download row renders

- **GIVEN** the screen is mounted with defaults and the user clicks `Generar bundle`
- **AND** the mocked `useGenerateBundle` returns `{ bundleId: 'b-1', status: 'generating' }`
- **AND** the mocked `useBundleStatus` advances through `{ currentStepIndex: 1 }`, `{ currentStepIndex: 2 }`, `{ currentStepIndex: 5, status: 'done', sha256: 'a9f3…b274', auditLogId: 'AL-1', pdfUrl: '/pdf', csvUrl: '/csv', sizeBytes: 2_300_000, pageCount: 48 }`
- **THEN** the progress strip renders intermediate states then unmounts; the `BundleDownloadRow` renders with the PDF + CSV buttons and the SHA-256 short form `"a9f3…b274"`.

### Requirement: Accessibility — every interactive control carries a programmatic name

The screen and components SHALL meet baseline accessibility:

- The progress strip's outer container has `role="status"` AND `aria-live="polite"`.
- The locale chip group has `role="group"` AND `aria-label="Idioma"`.
- Date inputs are native `<input type="date">` with `aria-label`.
- The transparency banner has `role="note"`.
- All buttons are `<button type="button">` with non-empty visible text.

#### Scenario: screen passes a baseline a11y smoke

- **GIVEN** the rendered screen
- **THEN** `screen.getByRole('status')` matches the progress strip OR the confirmation strip; `screen.getByRole('group', { name: /Idioma/ })` matches the LocaleChipGroup; `screen.getAllByRole('button')` returns all interactive controls with non-empty visible text.
