## 1. REST client + types (inlined, no contracts import)

- [ ] 1.1 `apps/web/src/api/photo-ingest.ts` — INLINE shapes for `IngestionItem`, `IngestionField`, `BoundingBox`, `IngestionStatus`, `IngestionKind`, `IngestionExtraction`, request/response DTOs. URL paths match slice #17a's: `POST /m3/photo-ingest/items`, `GET /m3/photo-ingest/items?status=…&kind=…&limit=…`, `GET /m3/photo-ingest/items/:itemId`, `POST /m3/photo-ingest/items/:itemId/sign`, `POST /m3/photo-ingest/items/:itemId/reclassify`.
- [ ] 1.2 Functions wrap `api()` helper from `apps/web/src/api/client.ts`. Pattern mirrors `apps/web/src/api/recall.ts`.

## 2. TanStack Query hooks

- [ ] 2.1 `apps/web/src/hooks/usePhotoIngest.ts` — five hooks:
  - `useHitlQueue(orgId, opts)` — queue list filtered by `status` + `kind`; 30 s staleTime.
  - `useIngestionItem(orgId, itemId)` — detail with photo + bounding boxes + extracted fields.
  - `useSignIngestion()` — mutation; on success invalidates queue + item keys.
  - `useReclassifyIngestion()` — mutation; on success invalidates queue + item keys.
  - `useUploadPhoto()` — mutation kicking off `POST /m3/photo-ingest/items`.

## 3. ui-kit — ConfidenceBandBadge

- [ ] 3.1 `packages/ui-kit/src/components/ConfidenceBandBadge/ConfidenceBandBadge.tsx` — three variants derived from `confidence`: `auto_fill` (`>= 0.85`), `flag_for_review` (`>= 0.60`), `reject` (`< 0.60`). Constants exported as `AUTO_FILL_THRESHOLD` and `FLAG_FOR_REVIEW_THRESHOLD` per ADR-J12-CONFIDENCE-THRESHOLDS-DUPLICATED. Dot + colour + text, never colour-only (ADR-034 + j12 §Decisions).
- [ ] 3.2 `ConfidenceBandBadge.types.ts` — exported `ConfidenceBand`, `ConfidenceBandBadgeProps`.
- [ ] 3.3 `ConfidenceBandBadge.test.tsx` — covers 3 variants + threshold boundaries (0.85, 0.60).
- [ ] 3.4 `ConfidenceBandBadge.stories.tsx` — 3 stories (auto_fill / flag_for_review / reject).
- [ ] 3.5 Export from barrel + `index.ts`.

## 4. ui-kit — M3AggregateTypeChip

- [ ] 4.1 `packages/ui-kit/src/components/M3AggregateTypeChip/M3AggregateTypeChip.tsx` — small chip showing `invoice` or `product`. Used in queue rows AND filter chips.
- [ ] 4.2 `M3AggregateTypeChip.types.ts` — exported `M3AggregateKind`, `M3AggregateTypeChipProps`.
- [ ] 4.3 `M3AggregateTypeChip.test.tsx` — covers both variants + accessible name.
- [ ] 4.4 `M3AggregateTypeChip.stories.tsx` — 2 stories.
- [ ] 4.5 Export from barrel + `index.ts`.

## 5. ui-kit — HitlQueueList

- [ ] 5.1 `packages/ui-kit/src/components/HitlQueueList/HitlQueueList.tsx` — vertical stack with thumbnails (64×64), `M3AggregateTypeChip`, supplier/product hint, time-since-upload, `ConfidenceBandBadge`. Selected row carries `--accent` left rule. `+ Subir foto` ghost CTA at bottom.
- [ ] 5.2 `HitlQueueList.types.ts` — exported `HitlQueueRow`, `HitlQueueListProps`.
- [ ] 5.3 `HitlQueueList.test.tsx` — covers: rows render, click row fires `onSelect`, `+ Subir foto` fires `onUploadClick`, selected row carries `data-selected="true"`.
- [ ] 5.4 `HitlQueueList.stories.tsx` — 2 stories (4 items / empty).
- [ ] 5.5 Export from barrel + `index.ts`.

## 6. ui-kit — PhotoViewer

- [ ] 6.1 `packages/ui-kit/src/components/PhotoViewer/PhotoViewer.tsx` — full-resolution photo with zoomable toolbar (`+`/`−`/`↻`/`↓`) + bounding-box overlay via `<canvas>` (ADR-J12-CANVAS-OVERLAY). Hover/tap box fires `onBoxHover(fieldName)`. Graceful fallback if `photoUrl == null || ''`. Canvas is `aria-hidden="true"` (decorative); sibling `<ul>` with `role="region"` per box for AT.
- [ ] 6.2 `PhotoViewer.types.ts` — exported `BoundingBox`, `PhotoViewerProps`.
- [ ] 6.3 `PhotoViewer.test.tsx` — covers: photo renders, fallback when null, canvas mounts, hover via mock canvas hit test fires `onBoxHover`, toolbar buttons fire callbacks, highlighted box gets `data-highlighted="true"` on sibling region.
- [ ] 6.4 `PhotoViewer.stories.tsx` — 2 stories (with boxes / fallback).
- [ ] 6.5 Export from barrel + `index.ts`.

## 7. ui-kit — ExtractedFieldList

- [ ] 7.1 `packages/ui-kit/src/components/ExtractedFieldList/ExtractedFieldList.tsx` — vertical list. Per ADR-034 visual variants per field:
  - `>= 0.85`: `--success` dot + value in `--ink`.
  - `0.60 <= c < 0.85`: `--mute` dot + value + small `revisar` ghost.
  - `< 0.60`: `--destructive` dot + empty value + `--destructive` border + `Manual · campo requerido (extracción rechazada)` mandatory eyebrow.
  Editing converts the badge to `editado por operador`. Reciprocal hover wires via `highlightedField` + `onFieldHover`.
- [ ] 7.2 `ExtractedFieldList.types.ts` — exported `ExtractedField`, `ExtractedFieldListProps`.
- [ ] 7.3 `ExtractedFieldList.test.tsx` — covers reject-band destructive border + Manual eyebrow; edit converts badge to "editado por operador"; row carries `data-band` reflecting derived band; highlight on `highlightedField` sets `data-highlighted="true"`.
- [ ] 7.4 `ExtractedFieldList.stories.tsx` — 2 stories (typical mix / all-reject).
- [ ] 7.5 Export from barrel + `index.ts`.

## 8. ui-kit — AiProvenanceChip

- [ ] 8.1 `packages/ui-kit/src/components/AiProvenanceChip/AiProvenanceChip.tsx` — mute line `Modelo: {modelVersion} · prompt v{promptVersion} · confianza global {overallConfidence} · audit_log {auditLogId} →`. EU AI Act Article 13 transparency (FR41).
- [ ] 8.2 `AiProvenanceChip.types.ts` — exported `AiProvenanceChipProps`.
- [ ] 8.3 `AiProvenanceChip.test.tsx` — covers: renders 4 fields, formats `overallConfidence` to 2 decimals, link fires `onOpenAuditLog`.
- [ ] 8.4 `AiProvenanceChip.stories.tsx` — 1 story.
- [ ] 8.5 Export from barrel + `index.ts`.

## 9. Screen — PhotoIngestReviewScreen

- [ ] 9.1 `apps/web/src/screens/j12/PhotoIngestReviewScreen.tsx` — composes Header + TransparencyBanner + BulkReviewChips (`Mis revisiones` / `Todas` / `Rechazadas`) + HitlQueueList (left) + PhotoViewer (centre) + ExtractedFieldList (right) + AiProvenanceChip + sticky CTA `Firmar ingestión`. RoleGuard (Owner + Manager); Staff fallback.
- [ ] 9.2 State machine: idle → selected → editing → submitting → submitted. Reciprocal box ↔ field link state lifted to the screen.
- [ ] 9.3 30-minute `localStorage` draft per (`itemId`, `actorUserId`) keyed `nexandro.photoIngest.draft.v1.<itemId>.<actorUserId>`.
- [ ] 9.4 Primary CTA disabled until every reject-band field has a non-empty value.
- [ ] 9.5 Success strip `✓ Ingestión firmada · {GR draft | Lot} creado · ver en {Procurement | Inventory} →` + 2 ghost actions (`Revisar siguiente` advances queue, `Volver al panel`).
- [ ] 9.6 Keyboard shortcuts: `j`/`k` navigate queue, `↵` signs, `R` triggers reclassify. Suppressed inside `<input>`/`<textarea>`/`[contenteditable]`.
- [ ] 9.7 `PhotoIngestReviewScreen.test.tsx` — integration: queue → select → photo + fields render → edit reject-band → submit → success → advance. 30-min draft persistence test.

## 10. Route registration

- [ ] 10.1 `apps/web/src/main.tsx` — add `{ path: 'photo-ingest/review', element: <PhotoIngestReviewScreen /> }`.

## 11. Navigation integration

- [ ] 11.1 `apps/web/src/App.tsx` — add `<Link to="/photo-ingest/review">Foto-ingestión</Link>` (Owner + Manager only via `<RoleGuard>`).

## 12. End-to-end verification

- [ ] 12.1 Vitest reports zero red across `packages/ui-kit` + `apps/web` (best-effort; local builds disabled — CI authoritative).
- [ ] 12.2 Storybook stories render without console error per component.
- [ ] 12.3 The screen renders when `VITE_DEMO_USER_ROLE='MANAGER'` + `VITE_DEMO_ORG_ID='org-demo'`.

## Deferred

- **SSE live queue refresh** — j12 §Notes for implementation calls for 15 s SSE; this slice uses 30 s TanStack polling fallback. M3.x adds SSE.
- **Bulk-approve auto-fill across queue** (`✓ Aprobar todos auto-fill (2)` button in mock) — renders as inert ghost; bulk action is M3.x.
- **Drift-detection banner + "ver trend completo"** — mock-only chrome; the backing trend metric lives in slice #20 ai-obs-ui; rendering banner is M3.x.
- **Rejection-as-training-signal retrain pipeline** — the `R` shortcut + button fire reclassify but the retrain pipeline itself is M3.x.
- **Real-time multi-operator first-wins toast** — j12 §Edge case "Multiple operators view the same queue row simultaneously"; the queue invalidation already covers staleness, but the explicit toast is M3.x.
- **IndexedDB-based draft** — j12 §Notes mentions IndexedDB; this slice uses `localStorage` (ADR-J12-DRAFT-LOCALSTORAGE). M3.x revisits if cross-tab sync surfaces.
- **Hermes / WhatsApp surface** — same MCP capability, different surface; separate slice.
- **Vision-LLM provider DI + prompt management** — slice #17a m3-photo-ingest-backend owns it.
- **Photo upload endpoint** — slice #18 m3-photo-storage owns the storage path; this slice's `useUploadPhoto` hook wraps the call but the endpoint is slice #18's concern.
- **`Ignorar este campo` / `Campo desconocido` learning loop** — j12 §Edge cases mentions ignore-decision learning over time; renders as field-row action in this slice but no learning pipeline. M3.x.
- **Storybook INT-style flow story** — deferred per slice prompt.
