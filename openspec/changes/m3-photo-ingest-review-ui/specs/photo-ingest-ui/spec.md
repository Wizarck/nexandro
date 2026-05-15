## ADDED Requirements

### Requirement: Route /photo-ingest/review renders the j12 photo ingestion HITL review surface for Owner + Manager

The system SHALL mount a new route `/photo-ingest/review` in `apps/web/src/main.tsx` rendering the j12 photo ingestion HITL review screen for Owner + Manager roles. Staff SHALL see a fallback `Acceso restringido · solicita aprobación a Owner/Manager →`. The screen SHALL compose `HitlQueueList`, `PhotoViewer`, `ExtractedFieldList`, `ConfidenceBandBadge`, `AiProvenanceChip`, `M3AggregateTypeChip`, and the verbatim `TransparencyBanner` inside the standard `<App>` shell.

#### Scenario: Manager navigates to /photo-ingest/review and sees the three-column surface

- **GIVEN** the demo user has `VITE_DEMO_USER_ROLE='MANAGER'` and `VITE_DEMO_ORG_ID='org-demo'`
- **WHEN** the user navigates to `/photo-ingest/review`
- **THEN** the page renders the eyebrow `Revisión humana · ingestión por foto (HITL)`, the `TransparencyBanner`, the bulk-review chip group, and the `HitlQueueList` in the left column

#### Scenario: Staff role sees the restricted-access fallback

- **GIVEN** the demo user has `VITE_DEMO_USER_ROLE='STAFF'`
- **WHEN** the user navigates to `/photo-ingest/review`
- **THEN** the page renders a fallback element with `role="status"` whose text contains `Acceso restringido` AND the queue list is NOT mounted

### Requirement: Selecting a queue row loads the item, photo, and extracted fields

Tapping a row in `HitlQueueList` SHALL set the selected `itemId`, fetch the item via `GET /m3/photo-ingest/items/:itemId`, and render the photo + bounding boxes in `PhotoViewer` + the extracted fields in `ExtractedFieldList`. The selected row SHALL carry a `--accent` left rule (visually) AND `data-selected="true"` (machine readable).

#### Scenario: clicking a queue row reveals the photo viewer and extracted-field list

- **GIVEN** the queue returns 1 item awaiting review
- **WHEN** the operator clicks the row
- **THEN** the photo viewer renders the `photoUrl`, the bounding-box overlay canvas mounts, and the extracted fields list mounts in the right column

### Requirement: PhotoViewer renders a canvas-based bounding-box overlay and a graceful fallback

`PhotoViewer` SHALL render the photo as an `<img>` with a sibling `<canvas>` overlay. The canvas SHALL be `aria-hidden="true"` (decorative). A sibling `<ul role="region">` with one `<li role="region" aria-label="…">` per bounding box SHALL provide accessible-name access. When `photoUrl` is `null` or empty, the component SHALL render the fallback `Imagen no se pudo cargar · re-subir →`.

#### Scenario: photo viewer mounts canvas overlay when boxes are present

- **GIVEN** a mounted `<PhotoViewer photoUrl="https://example.test/photo.jpg" boundingBoxes={[{ fieldName: 'supplier', x: 0, y: 0, w: 50, h: 20, label: 'Supplier' }]} />`
- **THEN** a `<canvas>` element is in the DOM AND a sibling list with a region whose `aria-label` contains "Supplier" exists

#### Scenario: photo viewer renders fallback when photoUrl is null

- **GIVEN** a mounted `<PhotoViewer photoUrl={null} boundingBoxes={[]} />`
- **THEN** the rendered text contains `Imagen no se pudo cargar · re-subir →` AND no `<canvas>` is present

### Requirement: ExtractedFieldList renders three confidence visual variants per ADR-034

Each field SHALL be derived to a band from `confidence`:

- `>= 0.85` → `auto_fill` band: `--success` dot + value in `--ink`.
- `>= 0.60` → `flag_for_review` band: `--mute` dot + value + small `revisar` ghost.
- `< 0.60` → `reject` band: `--destructive` dot + empty input + `--destructive` border + `Manual · campo requerido (extracción rechazada)` eyebrow.

The badge SHALL convert to `editado por operador` once the operator changes the value. Each row SHALL carry `data-band` reflecting the derived band.

#### Scenario: reject-band field renders the destructive border + Manual eyebrow

- **GIVEN** a mounted `<ExtractedFieldList fields={[{ fieldName: 'total', label: 'Total', extractedValue: '', operatorValue: '', confidence: 0.42 }]} />`
- **THEN** the row carries `data-band="reject"` AND the text contains `Manual · campo requerido (extracción rechazada)`

#### Scenario: editing converts the badge to "editado por operador"

- **GIVEN** a mounted list with a flag_for_review field
- **WHEN** the operator types a new value in the input
- **THEN** `onFieldChange` is called with the new value AND when the parent re-renders with the changed value, the badge text contains `editado por operador`

### Requirement: Reject-band fields gate the primary CTA

The screen SHALL derive `ctaDisabled = fields.some((f) => f.band === 'reject' && f.operatorValue.trim() === '')`. The primary CTA `Firmar ingestión` SHALL remain disabled while that condition holds. The same gate is enforced server-side by slice #17a's sign-service (`assertAllRejectFieldsFilled`).

#### Scenario: empty reject-band field keeps the CTA disabled

- **GIVEN** the operator selected an item with one reject-band field whose `operatorValue` is empty
- **WHEN** the screen renders
- **THEN** the `Firmar ingestión` button is disabled (`hasAttribute('disabled')` returns true)

#### Scenario: filling all reject-band fields enables the CTA

- **GIVEN** the operator filled all reject-band fields with non-empty trimmed values
- **WHEN** the screen re-renders
- **THEN** the `Firmar ingestión` button is enabled

### Requirement: Sign mutation invalidates queue + item queries and surfaces a success strip

On a successful `POST /m3/photo-ingest/items/:itemId/sign`, the screen SHALL invalidate the `['photoIngest', 'queue', orgId, scope]` and `['photoIngest', 'item', orgId, itemId]` query keys, clear the local draft, and mount a success strip whose text contains `✓ Ingestión firmada` plus a downstream link `ver en Procurement →` (for invoice) or `ver en Inventory →` (for product).

#### Scenario: signing an invoice ingestion surfaces the success strip with Procurement link

- **GIVEN** the operator selected an invoice item and filled any reject-band fields
- **WHEN** the operator clicks `Firmar ingestión` AND the mutation resolves with `{ downstreamAggregateType: 'invoice', downstreamAggregateId: 'gr-99' }`
- **THEN** an element with `role="status"` is mounted whose text contains `Ingestión firmada` AND the text contains `ver en Procurement`

### Requirement: 30-minute local draft persists per (itemId, actorUserId)

The system SHALL persist in-progress field edits to `localStorage` under the key `opentrattos.photoIngest.draft.v1.<itemId>.<actorUserId>`. The shape SHALL include `fieldValues: Record<string, string>`, `savedAt` (ms epoch), and `v: 1`. On mount, the screen SHALL hydrate the draft when `now - savedAt < 1_800_000` (30 minutes); older drafts SHALL be discarded. On successful sign, the draft SHALL be cleared.

#### Scenario: editing a field writes a draft to localStorage

- **GIVEN** the operator selected an item `(itemId='itm-1', actorUserId='MANAGER')`
- **WHEN** the operator types a new value in any field
- **THEN** `localStorage.getItem('opentrattos.photoIngest.draft.v1.itm-1.MANAGER')` returns a JSON string containing `"v":1` AND the new value is present in `fieldValues`

#### Scenario: a 31-minute-old draft is discarded on mount

- **GIVEN** `localStorage` has a draft `{ fieldValues: {...}, savedAt: <now - 31 min>, v: 1 }` for `(itm-1, MANAGER)`
- **WHEN** the screen mounts for that item
- **THEN** the field inputs render with their extracted values (not the stale draft)

### Requirement: Reciprocal box ↔ field hover link is lifted to the screen

The `highlightedField: string | null` state SHALL live in `PhotoIngestReviewScreen`. Both `PhotoViewer` and `ExtractedFieldList` SHALL receive it as a prop and SHALL drive it through `onBoxHover` and `onFieldHover` callbacks respectively. The wiring SHALL be client-side; no network call SHALL fire on hover.

#### Scenario: hovering a field highlights the corresponding bounding-box region

- **GIVEN** the operator selected an item with one bounding box for `fieldName='supplier'`
- **WHEN** the operator hovers the supplier field row (firing `onFieldHover('supplier')`)
- **THEN** the bounding-box region with `aria-label` containing `supplier` carries `data-highlighted="true"` AND no network call to `/m3/photo-ingest/*` fires

### Requirement: Keyboard shortcuts are suppressed inside form inputs

The screen SHALL register a top-level `keydown` listener that fires only when `event.target` is NOT an `<input>`, `<textarea>`, or `[contenteditable=true]`. The shortcuts:

- `j` → advance to next queue item.
- `k` → previous queue item.
- `Enter` → trigger primary CTA (no-op when disabled).
- `R` → trigger reclassify.

#### Scenario: pressing j while typing in an input does NOT advance the queue

- **GIVEN** the operator focused a field input on item `itm-1`
- **WHEN** the operator types `j` in the input
- **THEN** the selected item remains `itm-1` AND no queue navigation happens

#### Scenario: pressing j on the document body advances the queue

- **GIVEN** the operator focused the document body and the queue has items `[itm-1, itm-2]` with `itm-1` selected
- **WHEN** the operator presses `j`
- **THEN** the selected item becomes `itm-2`

### Requirement: AiProvenanceChip surfaces model + prompt version per EU AI Act Article 13

The `AiProvenanceChip` SHALL render a `--mute` line with the verbatim format `Modelo: {modelVersion} · prompt v{promptVersion} · confianza global {overallConfidence} · audit_log {auditLogId} →`. The `{overallConfidence}` SHALL be formatted to 2 decimals. The chip SHALL be a `<button>` or `<a>` that fires `onOpenAuditLog` so the operator can deep-link to the audit row.

#### Scenario: the chip renders all four provenance fields and opens the audit log

- **GIVEN** a mounted `<AiProvenanceChip modelVersion="gpt-oss-vision-72b" promptVersion="2.3" overallConfidence={0.742} auditLogId="AL-2026-189617" onOpenAuditLog={onOpenAuditLog} />`
- **WHEN** the operator clicks the chip
- **THEN** the rendered text contains `gpt-oss-vision-72b`, `prompt v2.3`, `0.74`, and `AL-2026-189617` AND `onOpenAuditLog` is called with `'AL-2026-189617'`

### Requirement: ConfidenceBandBadge derives the band from confidence using ADR-034 constants

`ConfidenceBandBadge` SHALL expose the boundary constants `AUTO_FILL_THRESHOLD = 0.85` and `FLAG_FOR_REVIEW_THRESHOLD = 0.60` as named exports per ADR-J12-CONFIDENCE-THRESHOLDS-DUPLICATED. The badge SHALL render three variants:

- `confidence >= AUTO_FILL_THRESHOLD` → `auto_fill` (success dot).
- `confidence >= FLAG_FOR_REVIEW_THRESHOLD` → `flag_for_review` (mute dot + "revisar" text).
- else → `reject` (destructive dot + "Manual" eyebrow).

The badge SHALL carry the dot glyph + colour + text — never colour-only.

#### Scenario: confidence at the auto_fill boundary

- **GIVEN** `<ConfidenceBandBadge confidence={0.85} />`
- **THEN** the rendered element carries `data-band="auto_fill"`

#### Scenario: confidence at the flag_for_review boundary

- **GIVEN** `<ConfidenceBandBadge confidence={0.60} />`
- **THEN** the rendered element carries `data-band="flag_for_review"`

#### Scenario: confidence below flag_for_review

- **GIVEN** `<ConfidenceBandBadge confidence={0.59} />`
- **THEN** the rendered element carries `data-band="reject"` AND the text contains `Manual`

### Requirement: M3AggregateTypeChip renders invoice or product variant with text + dot

The `M3AggregateTypeChip` SHALL render a small chip showing either `invoice` or `product`. The component contract is used both in `HitlQueueList` rows and in the queue filter chip group. The chip SHALL carry text (not colour-only) and an `aria-label` matching the variant.

#### Scenario: invoice variant renders text and accessible name

- **GIVEN** `<M3AggregateTypeChip kind="invoice" />`
- **THEN** the rendered element carries `data-kind="invoice"` AND has an accessible name matching the visible text
