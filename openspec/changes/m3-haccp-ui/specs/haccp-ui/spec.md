## ADDED Requirements

### Requirement: Route /haccp/record renders the j10 HACCP CCP reading capture surface

The system SHALL mount a new route `/haccp/record` in `apps/web/src/main.tsx` rendering the j10 HACCP CCP reading capture screen for all authenticated roles. The screen SHALL compose the 6 j10 components (`CcpPicker`, `ReadingInput`, `SpecRangeReadback`, `CorrectiveActionPicker`, `RecentReadingsStrip`, `OutOfSpecStickyWarning`) inside the standard `<App>` shell.

#### Scenario: Any authenticated role navigates to /haccp/record and sees the surface
- **GIVEN** the demo user has `VITE_DEMO_USER_ROLE='STAFF'` and `VITE_DEMO_ORG_ID='org-1'`
- **WHEN** the user navigates to `/haccp/record`
- **THEN** the page renders the eyebrow `HACCP · Lectura de PCC`, the CCP picker (open by default), and the recent-readings strip in the right sidebar

#### Scenario: Unsigned user sees a signed-out fallback
- **GIVEN** `VITE_DEMO_USER_ROLE` is unset
- **WHEN** the user navigates to `/haccp/record`
- **THEN** the page renders a `<SignedOut>` placeholder; no hooks fire fetches

### Requirement: SpecRangeReadback derives in-spec / out-of-spec status client-side and exposes it via aria-live

The `SpecRangeReadback` component SHALL render a single status line beneath the reading input. The line SHALL transition between three states based on the current input value:

- `idle` — value is `null`, empty string, or NaN; line renders `--mute` with copy `Rango aceptable: <min> a <max> <unit>`.
- `in-spec` — value is parseable AND `min ≤ value ≤ max`; line renders `--success` with copy `✓ Dentro de rango (<min> a <max> <unit>)`.
- `out-of-spec` — value is parseable AND (`value < min` OR `value > max`); line renders `--destructive` with copy `⚠ Fuera de rango · se requiere acción correctiva`.

The line SHALL carry `role="status"` AND `aria-live="polite"` so screen-readers announce status transitions without interrupting the operator.

#### Scenario: typing an in-spec value turns the readback success
- **GIVEN** a mounted `<SpecRangeReadback specMin={-2} specMax={2} currentValue="1.2" unit="°C" />`
- **THEN** the rendered text contains `✓ Dentro de rango (-2 a 2 °C)` and the surrounding element carries `aria-live="polite"`

#### Scenario: typing an out-of-spec value turns the readback destructive
- **GIVEN** a mounted `<SpecRangeReadback specMin={-2} specMax={2} currentValue="3.5" unit="°C" />`
- **THEN** the rendered text contains `⚠ Fuera de rango · se requiere acción correctiva` and the surrounding element has `data-status="out-of-spec"`

#### Scenario: empty value falls back to idle copy with the spec range
- **GIVEN** a mounted `<SpecRangeReadback specMin={-2} specMax={2} currentValue="" unit="°C" />`
- **THEN** the rendered text contains `Rango aceptable: -2 a 2 °C` and the element has `data-status="idle"`

### Requirement: Out-of-spec submissions require a linked corrective action

The system SHALL gate the primary CTA (`Firmar lectura`) on a non-null corrective-action selection when the current reading is out-of-spec. The corrective-action picker SHALL mount inline below the spec-range readback (NOT as a modal) only when `status === 'out-of-spec'`.

#### Scenario: out-of-spec reading without a corrective action keeps the CTA disabled
- **GIVEN** the operator has picked a CCP with `specMin=-2 specMax=2`
- **AND** has typed `3.5` into the reading input
- **WHEN** the screen renders
- **THEN** `CorrectiveActionPicker` is mounted AND `<button name="firmar">` is disabled (matches `aria-disabled="true"` or the `disabled` attribute)

#### Scenario: out-of-spec reading with a corrective action enables the CTA
- **GIVEN** the operator has picked a CCP and typed `3.5`
- **WHEN** the operator selects "Re-enfriar producto en cámara secundaria" from the corrective-action picker
- **THEN** the `Firmar lectura` button becomes enabled

#### Scenario: in-spec reading enables the CTA without a corrective action
- **GIVEN** the operator has picked a CCP with `specMin=-2 specMax=2`
- **AND** has typed `1.2` into the reading input
- **WHEN** the screen renders
- **THEN** `CorrectiveActionPicker` is NOT mounted AND `Firmar lectura` is enabled

### Requirement: Local draft persists in localStorage for 10 minutes per (orgId, ccpId, actorUserId)

The system SHALL persist an in-progress reading to `localStorage` under the key `nexandro.haccp.draft.v1.<orgId>.<ccpId>.<actorUserId>`. The persisted shape SHALL include `value`, optional `notes`, optional `correctiveActionId`, `savedAt` (ms epoch), and `v: 1`. On mount, the screen SHALL hydrate the draft if `now - savedAt < 600_000` (10 minutes); older drafts SHALL be discarded.

#### Scenario: a fresh reading is written to localStorage on input change
- **GIVEN** the operator has picked a CCP `(orgId='org-1', ccpId='ccp-1', actorUserId='u-1')`
- **WHEN** the operator types `1.2` into the reading input
- **THEN** `localStorage.getItem('nexandro.haccp.draft.v1.org-1.ccp-1.u-1')` returns a JSON string containing `"value":"1.2"` and `"v":1`

#### Scenario: a 4-minute-old draft hydrates on mount with a continuation eyebrow
- **GIVEN** `localStorage` has a draft `{ value: "1.2", savedAt: <now - 4 min>, v: 1 }` for `(org-1, ccp-1, u-1)`
- **WHEN** the screen mounts with that key tuple
- **THEN** the reading input renders with value `"1.2"` AND a mute eyebrow text matching `/Borrador desde hace \d+ min/` surfaces

#### Scenario: a 15-minute-old draft is discarded on mount
- **GIVEN** `localStorage` has a draft `{ value: "1.2", savedAt: <now - 15 min>, v: 1 }` for `(org-1, ccp-1, u-1)`
- **WHEN** the screen mounts
- **THEN** the reading input renders empty AND no continuation eyebrow surfaces

#### Scenario: successful submit clears the draft
- **GIVEN** a draft exists for `(org-1, ccp-1, u-1)`
- **WHEN** the operator submits and the mutation resolves successfully
- **THEN** `localStorage.getItem('nexandro.haccp.draft.v1.org-1.ccp-1.u-1')` returns `null`

### Requirement: OutOfSpecStickyWarning surfaces when a prior reading is out-of-spec without a linked corrective action

The system SHALL probe `GET /m3/haccp/ccps/:ccpId/last-out-of-spec-unresolved` on CCP selection. If the response body has `unresolved: true`, the `OutOfSpecStickyWarning` component SHALL mount at the top of the surface with `role="alert"` and copy `Lectura previa fuera de rango sin acción correctiva · revisar antes de firmar nueva lectura`.

#### Scenario: prior gap surfaces the sticky warning at the top
- **GIVEN** the probe returns `{ unresolved: true, priorReadingId: 'rd-99' }`
- **WHEN** the screen renders for the selected CCP
- **THEN** an element with `role="alert"` is mounted before the main form panel

#### Scenario: no prior gap → no sticky warning
- **GIVEN** the probe returns `{ unresolved: false }`
- **WHEN** the screen renders
- **THEN** no element with `role="alert"` is mounted

#### Scenario: probe error fails open (no warning)
- **GIVEN** the probe rejects with a network error
- **WHEN** the screen renders
- **THEN** no element with `role="alert"` is mounted (additive surface — failing open is safer than blocking)

### Requirement: RecentReadingsStrip renders the last 5 readings as read-only rows

The `RecentReadingsStrip` SHALL render at most 5 readings for the selected CCP. Each row SHALL display timestamp + value + actor + in/out-of-spec glyph. Rows SHALL NOT be interactive (no click handler, no soft-delete). The strip SHALL reuse the existing Pulcinella tokens (`--color-surface` background, `--color-border` hairline, `--color-mute` timestamps).

#### Scenario: the strip caps at 5 rows even if more are returned
- **GIVEN** the API returns 8 recent readings
- **WHEN** the strip renders
- **THEN** exactly 5 `<li>` rows are visible

#### Scenario: each row carries both glyph and text for the in/out-of-spec status
- **GIVEN** a reading with `inSpec=false`
- **WHEN** the strip row renders
- **THEN** the row contains the glyph `⚠` AND the row carries `data-out-of-range="true"` (text + colour, never colour-only)

### Requirement: CcpPicker collapses to a one-line summary on selection

The `CcpPicker` SHALL render two visual states derived from the `selectedId` prop:

- **Open** (`selectedId == null`): a vertical list of CCP rows, each carrying name + last reading + due-by countdown.
- **Collapsed** (`selectedId != null`): a single bordered row showing the selected CCP name + a `cambiar →` button that re-opens the list.

Each list-state CCP row SHALL be a `<button type="button">` for keyboard activation.

#### Scenario: selecting a CCP collapses the picker
- **GIVEN** a mounted `<CcpPicker ccps={[...]} selectedId={null} onSelect={onSelect} />`
- **WHEN** the operator clicks the first CCP row
- **THEN** `onSelect` is called with the first CCP's id, and re-rendering with `selectedId={firstId}` shows a single bordered row with the CCP name + a `cambiar →` button

#### Scenario: clicking cambiar re-opens the list
- **GIVEN** a mounted `<CcpPicker ccps={[...]} selectedId={someId} onSelect={onSelect} />`
- **WHEN** the operator clicks `cambiar →`
- **THEN** `onSelect` is called with `null`, and re-rendering with `selectedId={null}` shows the vertical list again

### Requirement: Successful submit invalidates strip + sticky-warning queries

On a successful `POST /m3/haccp/readings`, the screen SHALL invalidate the `['haccp', 'recent-readings', orgId, ccpId]` and `['haccp', 'last-out-of-spec-unresolved', orgId, ccpId]` TanStack Query keys so the recent-readings strip refreshes and the sticky warning re-evaluates.

#### Scenario: submit triggers cache invalidation for strip + warning
- **GIVEN** an integration-test render with a mocked `useRecordReading` and a spy on `queryClient.invalidateQueries`
- **WHEN** the operator submits an in-spec reading
- **THEN** `invalidateQueries` is called with each of `{ queryKey: ['haccp', 'recent-readings', orgId, ccpId] }` and `{ queryKey: ['haccp', 'last-out-of-spec-unresolved', orgId, ccpId] }`

### Requirement: ReadingInput is type-aware per FSMS standard input_type

The `ReadingInput` SHALL accept a prop `inputType: 'numeric' | 'checkbox' | 'multi-select'` and render the corresponding variant:

- `numeric` — `<input type="number" inputMode="decimal" step="0.1">`, 60 px tall, tabular-nums.
- `checkbox` — a clean/not-clean toggle pair (two buttons with aria-pressed).
- `multi-select` — a chip list with single-tap toggle per option (e.g. allergen list).

`onChange` SHALL be invoked with `string` for numeric, `boolean` for checkbox, `string[]` for multi-select. The component contract is shared so the form layout stays consistent across CCP variants.

#### Scenario: numeric variant fires onChange with a string value
- **GIVEN** a mounted `<ReadingInput inputType="numeric" value="" onChange={onChange} unit="°C" />`
- **WHEN** the operator types `1.2`
- **THEN** `onChange` is called with `"1.2"`

#### Scenario: checkbox variant fires onChange with a boolean
- **GIVEN** a mounted `<ReadingInput inputType="checkbox" value={false} onChange={onChange} />`
- **WHEN** the operator clicks the clean button
- **THEN** `onChange` is called with `true`

#### Scenario: multi-select variant toggles items in the array
- **GIVEN** a mounted `<ReadingInput inputType="multi-select" value={['gluten']} options={[{id:'gluten',label:'Gluten'},{id:'leche',label:'Leche'}]} onChange={onChange} />`
- **WHEN** the operator taps the Leche chip
- **THEN** `onChange` is called with `['gluten', 'leche']`
