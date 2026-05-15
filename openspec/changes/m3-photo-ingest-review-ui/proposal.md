## Why

Slice #17a `m3-photo-ingest-backend` (Wave 2.8 sibling, parallel worktree) builds the **producer side** of M3 photo ingestion: it lands the `photo-ingestion` BC, the `IngestionItem` aggregate, the `AiSuggestionProvider` DI per ADR-038, the confidence-band routing per ADR-034, and the REST endpoints `POST /m3/photo-ingest/items`, `GET /m3/photo-ingest/items?status=…&kind=…&limit=…`, `GET /m3/photo-ingest/items/:itemId`, `POST /m3/photo-ingest/items/:itemId/sign`, `POST /m3/photo-ingest/items/:itemId/reclassify`. None of that is visible to Andoni (Purchasing Manager) or Carmen (Head Chef) on the office laptop — there is no surface in `apps/web/` that lets them review the photo, confirm/correct LLM-extracted fields, and sign the ingest. The EU AI Act iron-rule HITL gap is wide open until this slice lands.

This slice (#17b) ships the **consumer side**: a `/photo-ingest/review` route that renders the j12 mock as 6 production ui-kit components composed into one screen. FR28 (vision-LLM extraction with confidence), FR29 (HITL review on flag-for-review band), FR30 (auto-fill on ≥ 0.85), FR31 (reject on < 0.60 with operator-required fields), FR32 (extracted fields editable + original retained in audit_log), FR33 (route extracted data downstream — GR draft or Lot creation), FR41 (AI provenance disclosure per EU AI Act Article 13), FR43 + FR44 (queue review + bulk filter) close at end of this slice. The j12 mock at `master/docs/ux/variants/mock-j12-photo-ingest-review.html` is the canonical reference: `HitlQueueList` (left column with thumbnails + supplier hints + confidence band badges), `PhotoViewer` (centre column with zoomable photo + bounding-box overlay via `<canvas>`), `ExtractedFieldList` (right column with 3 confidence visual variants per field), `ConfidenceBandBadge` (reusable 3-variant chip), `AiProvenanceChip` (model + prompt version per EU AI Act Article 13), `M3AggregateTypeChip` (invoice/product chip for queue + filter), plus the reciprocal box ↔ field hover link wired through `highlightedField` state lifted to the screen.

This slice is **UI-heavy + backend ZERO**. We never write to `apps/api/src/photo-ingestion/*` — slice #17a owns the BC + endpoints; this slice ships only the React surface that calls those endpoints. No migrations. No new BC files. RBAC: Owner + Manager only (per slice prompt §3); Staff sees a fallback. The 30-minute draft persistence (j12 §Edge case "Network drops mid-edit") lives in `localStorage` keyed by `(itemId, actorUserId)`. Confidence thresholds are re-declared INLINE in `ConfidenceBandBadge` per ADR-034 (`AUTO_FILL = 0.85`, `FLAG_FOR_REVIEW = 0.60`) — ADR-034 specifies these constants are code-level so the duplication across the apps/api ↔ ui-kit boundary is acceptable + expected.

**This is the LAST M3 slice (#17b/22). After it merges, M3 hits 22/22.**

## What Changes

- **`packages/ui-kit/src/components/HitlQueueList/`** — vertical list of items awaiting review. Each row: 64×64 thumbnail + `M3AggregateTypeChip` + supplier-or-product hint + time-since-upload + `ConfidenceBandBadge`. Selected row carries a `--accent` left rule. Bottom of list: `+ Subir foto` ghost CTA. Click row → fires `onSelect(itemId)`.
- **`packages/ui-kit/src/components/PhotoViewer/`** — full-resolution photo, zoomable (toolbar `+`/`−`/`↻`/`↓`), with bounding-box overlay drawn on `<canvas>` per j12 §Implementation Notes. Hover/tap a box fires `onBoxHover(fieldName)`; `highlightedField` prop drives the visual highlight. Renders graceful fallback (`Imagen no se pudo cargar · re-subir →`) when `photoUrl` is null or empty.
- **`packages/ui-kit/src/components/ExtractedFieldList/`** — vertical list of fields, each with the 3 confidence visual variants per ADR-034:
  - `≥ 0.85`: `--success` dot + value in `--ink`.
  - `0.60 ≤ c < 0.85`: `--mute` dot + value + small `revisar` ghost.
  - `< 0.60`: `--destructive` dot + empty value + `--destructive` border on the input + `Manual · campo requerido (extracción rechazada)` mandatory eyebrow.
  Editing converts the badge to `editado por operador`. Props: `{ fields, onFieldChange, highlightedField, onFieldHover }`.
- **`packages/ui-kit/src/components/ConfidenceBandBadge/`** — reusable 3-variant badge: `auto_fill` (success dot + glyph), `flag_for_review` (mute dot + "revisar" text), `reject` (destructive dot + "Manual" eyebrow). Used in queue list AND inline in `ExtractedFieldList`. Per j12 §Decisions "dot + value styling, never only colour" — WCAG-AA accessible.
- **`packages/ui-kit/src/components/AiProvenanceChip/`** — bottom-of-form `--mute` line: `Modelo: {modelVersion} · prompt v{promptVersion} · confianza global {overallConfidence} · audit_log {auditLogId} →` with `auditLogId` link. EU AI Act Article 13 transparency per j12 §EU AI Act provenance chip + FR41.
- **`packages/ui-kit/src/components/M3AggregateTypeChip/`** — small chip showing `invoice` / `product`. Used both in queue rows AND in queue filter chips.
- **`apps/web/src/screens/j12/PhotoIngestReviewScreen.tsx`** — new page mounted at `/photo-ingest/review` (Owner + Manager only). Composes the 6 components above + a header + the AI-transparency note + bulk-review chip group + sticky CTA "Firmar ingestión"; manages state machine (idle → selected → editing → submitting → submitted); reciprocal box ↔ field link state lifted to the screen; persists 30-minute draft to `localStorage` keyed by `(itemId, actorUserId)`; calls `POST /m3/photo-ingest/items/:itemId/sign` via TanStack mutation on submit. Keyboard shortcuts: `j` / `k` to navigate queue, `↵` to sign, `R` to reclassify.
- **`apps/web/src/api/photo-ingest.ts`** — REST client wrapping `api()` for the 5 slice-#17a endpoints. INLINE shapes (`IngestionItem`, `IngestionField`, `BoundingBox`, `IngestionStatus`, `IngestionKind`, `IngestionExtraction`, request/response DTOs) — no `@opentrattos/contracts` import; no import from `apps/api/src/photo-ingestion/*`.
- **`apps/web/src/hooks/usePhotoIngest.ts`** — TanStack hooks: `useHitlQueue`, `useIngestionItem`, `useSignIngestion`, `useReclassifyIngestion`, `useUploadPhoto`.
- **`apps/web/src/main.tsx`** — register `/photo-ingest/review` route + lazy import.
- **`apps/web/src/App.tsx`** — top-nav `<Link>` (Owner + Manager).
- **BREAKING**: none. New components + new route + new client. No schema changes. M3 slice budget 19-22 closes at slice #17b → 22/22.

## Capabilities

### New Capabilities

- `photo-ingest-ui`: Owner+Manager office-laptop surface at `/photo-ingest/review` rendering j12 with 6 components + the AI transparency note + reciprocal box↔field link + 3 confidence visual variants per field + AI provenance chip per EU AI Act Article 13 + 30-min local draft persistence keyed by `(itemId, actorUserId)` + keyboard shortcuts (`j` / `k` / `↵` / `R`). Reject-band fields gate the primary CTA until non-empty. The `+ Subir foto` CTA invokes slice #18 photo storage + slice #17a ingest endpoint.

### Modified Capabilities

- None. This slice creates a new surface entirely. Slice #17a owns the `photo-ingestion` BC; this slice consumes its REST API.

## Impact

- **Prerequisites**: master at `a95e15f` (Wave 2.7 merged with slice #15 m3-appcc-i18n-ui); slice #17a (`m3-photo-ingest-backend`, sibling Wave 2.8) provides the BC + REST endpoints. We code defensively: the URL paths in `apps/web/src/api/photo-ingest.ts` match slice #17a's prompt verbatim. If slice #17a's shapes diverge at master merge, the resolver picks up the conflict; no shared `packages/contracts` import couples the two slices.
- **Code**:
  - `packages/ui-kit/src/components/{HitlQueueList,PhotoViewer,ExtractedFieldList,ConfidenceBandBadge,AiProvenanceChip,M3AggregateTypeChip}/` — 6 new primitives with Storybook stories (~850 LOC + ~450 LOC tests).
  - `apps/web/src/screens/j12/PhotoIngestReviewScreen.tsx` — new screen (~350 LOC + ~200 LOC tests).
  - `apps/web/src/api/photo-ingest.ts` + `apps/web/src/hooks/usePhotoIngest.ts` — ~250 LOC.
  - `apps/web/src/main.tsx` — one new route entry.
  - `apps/web/src/App.tsx` — one new nav `<Link>`.
- **Performance**:
  - Reciprocal box ↔ field link is client-side; no server roundtrip per hover (j12 §Implementation Notes "Hover handlers link to field rows via component state").
  - First paint < 1 s on laptop per j12 §Notes for implementation: photo lazy-loads, the queue list + extracted-fields panel render first.
  - Submit mutation latency: backend SLO owned by slice #17a.
- **Storage growth**: none — read-write via slice #17a.
- **Audit**: every successful sign writes one `audit_log` row of type `PHOTO_INGESTION_SIGNED` (slice #17a emits this). The strip reads no audit rows directly; it queries the queue endpoint. From this slice's perspective the contract is "POST sign returns auditLogId + downstream draftId" — backend is slice #17a's concern.
- **Rollback**:
  - Remove `apps/web/src/screens/j12/PhotoIngestReviewScreen.tsx` + the route entry from `main.tsx` + the nav `<Link>`. No data migration to revert.
  - `packages/ui-kit/` additions are pure-new; nothing references them outside this slice. The 6 new primitives can be left in place even after rollback — they're inert without their consumer.
- **Out of scope** (claimed by other slices or future follow-ups):
  - Vision-LLM call wiring + prompt management → slice #17a m3-photo-ingest-backend.
  - Real-time queue refresh via SSE → j12 §Notes "The queue list refreshes every 15 s via Server-Sent Events"; this slice uses TanStack polling (30 s stale time) as the conservative fallback. SSE follow-up is M3.x.
  - Hermes / WhatsApp surface that produces the same MCP capability → Hermes layer slice, not this one.
  - Photo storage + upload → slice #18 m3-photo-storage owns the upload endpoint; this slice's `useUploadPhoto` hook wraps that call but the actual storage path is slice #18's concern.
  - Bulk-approve auto-fill across queue (`✓ Aprobar todos auto-fill (2)` button in mock) → renders as inert ghost in this slice; bulk action is a future slice.
  - Drift-detection banner + "ver trend completo" (visible in mock §Drift) → mock-only chrome; the backing trend metric lives in slice #20 ai-obs-ui already, the rendering of the banner is M3.x.
  - Rejection-as-training-signal (`Rechazar+retrain` button + `R` shortcut) → the button renders + the shortcut fires the reclassify endpoint, but the retrain pipeline itself is M3.x.
- **Parallelism**: file-path scope = `packages/ui-kit/src/components/{HitlQueueList,PhotoViewer,ExtractedFieldList,ConfidenceBandBadge,AiProvenanceChip,M3AggregateTypeChip}/**`, `apps/web/src/screens/j12/**`, `apps/web/src/api/photo-ingest.ts`, `apps/web/src/hooks/usePhotoIngest.ts`, plus one route line in `apps/web/src/main.tsx`, one nav `<Link>` in `apps/web/src/App.tsx`, and a new `packages/ui-kit/src/index.ts` barrel block. Verified disjoint from siblings:
  - Slice #17a `m3-photo-ingest-backend` writes to `apps/api/src/photo-ingestion/` — disjoint.
  - Wave 2.7 slices wrote to `apps/api/src/appcc/` + `apps/web/src/screens/j9/` — disjoint.
- **Effort estimate**: M-L (~1 400 LOC implementation + ~650 LOC tests; matches gate-c slice list "M" sizing for frontend-only slices with one novel surface — the `<canvas>` overlay).
