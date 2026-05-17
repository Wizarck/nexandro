## Context

j12 is the EU AI Act iron-rule HITL surface for vision-LLM photo extractions. Andoni (Purchasing Manager) or Carmen (Head Chef) opens the office laptop, picks an item from the queue, confirms or corrects each LLM-extracted field with the source photo + bounding boxes visible, and signs the ingest. The same MCP capabilities (`inventory.ingest-invoice-photo`, `inventory.ingest-product-photo`) are invoked by operators via Hermes (WhatsApp / Telegram / agent chat widget) — same backend contract, different surface. This slice ships the web rendering. The Hermes layer slice ships the agent rendering.

Slice #17a (`m3-photo-ingest-backend`, sibling Wave 2.8, parallel worktree) lands the `photo-ingestion` BC + the 5 REST endpoints + `AiSuggestionProvider` DI per ADR-038 + the confidence-band routing per ADR-034. None of slice #17a's output produces a surface that Andoni or Carmen can browse. This slice composes 6 ui-kit components into one screen wired to slice #17a's API.

The j12 mock at `master/docs/ux/variants/mock-j12-photo-ingest-review.html` is the canonical visual reference: a three-column office-laptop layout (queue left narrow, photo viewer centre wide, extracted-fields right medium) with a transparency note + bulk-review chip group + sticky CTA. The accessible-name layer is critical: dynamic regions use `aria-live="polite"`, bounding boxes carry `role="region"` + `aria-label` per j12 §Notes "PhotoViewer provides a screen-reader description of each field's extracted value + confidence".

The hot interactions — "hover a box, highlight the field" and "click a field, highlight the box" — run **client-side** via `highlightedField` state lifted to the screen and threaded into both `PhotoViewer` and `ExtractedFieldList`. No keystroke triggers a network call. That's the load-bearing decision behind ADR-J12-RECIPROCAL-LINK-CLIENT-SIDE.

## Goals / Non-Goals

**Goals:**

- Andoni opens `/photo-ingest/review`, picks an item, reviews the photo + extracted fields, signs in ≤ 45 s per item on a 14″ laptop (j12 §Goal).
- Reciprocal box ↔ field link is glance-driven: hover a box → field row gets `--accent` left rule; click a field → corresponding bounding box gets active styling.
- Confidence visual is WCAG-AA accessible: dot + colour + text + (reject band) destructive border + Manual eyebrow — never colour-only.
- Reject-band fields gate the primary CTA until all are non-empty. The gate matches slice #17a's sign-service refusal contract.
- A 30-min draft persists locally per `(itemId, actorUserId)`. After 30 min the draft is discarded; the system never silently signs a stale draft.
- AI provenance chip surfaces `Modelo: {modelVersion} · prompt v{promptVersion} · confianza global {overallConfidence} · audit_log {auditLogId} →` per EU AI Act Article 13.
- After sign: success strip `✓ Ingestión firmada · GR draft creado · ver en Procurement →` with two ghost actions (`Revisar siguiente` advances queue, `Volver al panel`).
- Keyboard shortcuts per j12 §Implementation: `j` / `k` navigate queue, `↵` signs, `R` triggers reclassify.
- Accessibility: bounding boxes carry `role="region"` + `aria-label`, the CTA is `<button>`, dynamic strip uses `aria-live="polite"`, success strip uses `role="status"`.

**Non-Goals:**

- Backend BC scaffolding (slice #17a owns `apps/api/src/photo-ingestion/`).
- Photo storage / upload endpoint (slice #18 m3-photo-storage owns it; this slice's `useUploadPhoto` hook calls into that endpoint but does not implement it).
- Hermes / WhatsApp rendering of the same capability (separate slice, future M3.x).
- SSE-based live queue refresh (j12 §Notes for implementation mentions 15 s SSE; this slice uses 30 s TanStack polling. M3.x adds SSE).
- Bulk-approve auto-fill across queue (rendered as inert ghost button).
- Drift-detection banner + retrain pipeline (mock-only chrome; ai-obs slice owns the backing metric).
- Vision LLM provider DI + prompt management (slice #17a owns it per ADR-038).
- IndexedDB-based draft persistence (j12 §Notes mentions IndexedDB; we use `localStorage` per ADR-J12-DRAFT-LOCALSTORAGE).
- Cross-tab sync of draft state (out of scope; the 30-min TTL bounds risk).

## Decisions

### ADR-J12-RECIPROCAL-LINK-CLIENT-SIDE — bounding box ↔ field hover state is lifted to the screen, not the components

The hot interaction — "hover a box, highlight the field row; click a field, highlight the box" — runs client-side. The `PhotoIngestReviewScreen` owns the `highlightedField: string | null` state. Both `PhotoViewer` (which receives `highlightedField` + `onBoxHover`) and `ExtractedFieldList` (which receives `highlightedField` + `onFieldHover`) read AND drive that state via callbacks.

**Why:** the persona's mistake mode is "I read the wrong line on the photo" (j12 §Decisions "Bounding-box ↔ field reciprocal link is load-bearing"). The affordance must be instant, not network-bound. Threading the state down via props + callbacks keeps both components dumb (no internal `useState`); the screen is the single source of truth. Per ADR-002 the API contract is the canonical truth; the client just renders it.

Rejected alternative: a shared context provider that both components subscribe to. Adds layer + indirection for a single state primitive. Lifting to the screen is the conventional React pattern + matches the rest of the surface composition.

### ADR-J12-CONFIDENCE-THRESHOLDS-DUPLICATED — ADR-034 constants re-declared INLINE in `ConfidenceBandBadge`

The boundary constants `AUTO_FILL = 0.85` (auto-fill band) and `FLAG_FOR_REVIEW = 0.60` (flag-for-review band) per ADR-034 live in two places: slice #17a `apps/api/src/photo-ingestion/constants.ts` AND slice #17b `packages/ui-kit/src/components/ConfidenceBandBadge/ConfidenceBandBadge.tsx`. The cross-slice contract pattern (slice prompt §Cross-slice contract) explicitly accepts + expects this duplication: per ADR-034 the constants are code-level, and the inlined-shape pattern landed in Wave 2.1 as the canonical cross-slice contract.

**Why:** importing from `apps/api/*` into `packages/ui-kit/*` would invert the package dependency direction (UI kit must not depend on the API surface). Routing the constants through `packages/contracts` would force both slices to land in the same wave or one to wait. The duplication is bounded by the proposal-checklist gate (master merge resolver picks up the conflict if slice #17a's constants drift).

The component derives the band purely from `confidence`:
- `confidence >= AUTO_FILL` → `auto_fill`
- `confidence >= FLAG_FOR_REVIEW` → `flag_for_review`
- else → `reject`

The same derivation runs server-side as the routing gate on `POST /m3/photo-ingest/items` — slice #17a's concern. Per slice prompt: "If slice #17a shapes diverge slightly, one-line mechanical fix at master."

Rejected alternative: shared types in `packages/contracts`. Pre-Wave-2 we tried this; it forced both slices to land in the same wave or one to wait. The inlined-shape pattern landed in Wave 2.1 as the canonical cross-slice contract.

### ADR-J12-REJECT-BAND-IS-A-GATE — out-of-confidence-reject submissions require non-empty fields

When a field's `confidence < FLAG_FOR_REVIEW` (reject band), `ExtractedFieldList` renders the input with a `--destructive` border + a mandatory `Manual · campo requerido (extracción rechazada)` eyebrow. The primary CTA (`Firmar ingestión`) is disabled until every reject-band field has a non-empty `operatorValue`. This mirrors slice #17a's sign-service refusal contract.

**Why:** the EU AI Act iron-rule is exactly that — the operator cannot sign a low-confidence ingest without a deliberate manual entry. Letting the operator "wave through" reject-band fields would create the failure mode HITL is designed to prevent (j12 §Decisions "Confidence-banded HITL is iron rule, never a configurable hint"). The architecture (slice #17a `assertAllRejectFieldsFilled`) treats reject-band-empty as a sign-time refusal — a regulator sees it; the UX prevents the row from existing in the first place.

The component contract: `ExtractedFieldList` accepts `{ fields, onFieldChange, highlightedField, onFieldHover }`. The screen derives `ctaDisabled` from `fields.some((f) => f.band === 'reject' && f.operatorValue.trim() === '')`.

Rejected alternative: a modal on submit-click that says "fill the manual fields". Modal-as-first-thought is a j12 anti-pattern (mock §Anti-patterns avoided "modal-as-first-thought"); it interrupts the review flow.

### ADR-J12-DRAFT-LOCALSTORAGE — 30-minute TTL, keyed by `(itemId, actorUserId)`

Local draft persistence uses `localStorage` keyed by `nexandro.photoIngest.draft.v1.<itemId>.<actorUserId>`. The stored shape:

```ts
interface PhotoIngestDraftV1 {
  fieldValues: Record<string, string>;
  savedAt: number; // ms epoch
  v: 1;
}
```

On mount (or item-selection change), `PhotoIngestReviewScreen` checks for a draft. If found AND `now - savedAt < 1_800_000` (30 minutes), the values are hydrated into local state and a mute eyebrow "Borrador desde hace N min · ¿continuar?" surfaces below the field list. The operator can ignore it and overwrite. On successful sign, the draft is cleared. On field-input change the draft is written (debounced via React state batching to avoid thrashing localStorage). After 30 minutes the draft is treated as stale (discarded on next mount).

**Why localStorage and NOT IndexedDB:** j12 §Notes mentions IndexedDB, but the per-key payload is < 2 KB (7 fields × ~250 chars typical); localStorage's synchronous get/set is simpler and the 30 min TTL means stale-data risk is bounded. IndexedDB lands if we need cross-tab sync (not a real scenario per j12 §Edge cases "Multiple operators view the same queue row simultaneously" — first-wins is server-side).

**Failure mode:** if localStorage is full or disabled (Safari private mode), the draft is not persisted; the screen still functions. Acceptable degradation per j12 §Edge case "Network drops mid-edit" (which is about preserving the in-progress edit, not the submit — submit failures bubble up).

Rejected alternative: server-side draft persistence via a `drafts` table. Drafts never enter audit_log (j12 §Decisions "Both LLM extraction and operator correction are stored" — only the SIGNED correction is auditable); a server draft table is dead weight + a sync race.

### ADR-J12-CANVAS-OVERLAY — bounding boxes drawn on `<canvas>`, not as positioned DOM nodes

`PhotoViewer` uses an HTML5 `<canvas>` element overlaid on the photo `<img>`. The canvas redraws on (i) initial mount, (ii) photo load, (iii) `highlightedField` change, (iv) zoom level change. Each bounding box is drawn as a stroked rectangle with `--accent` (or `--accent-press` if highlighted), with the field label rendered as a small caption above the box. The canvas exposes `pointer` events: on `mousemove` / `touchmove`, the component hit-tests against the rect coordinates and fires `onBoxHover(fieldName | null)`.

**Why canvas, not absolutely-positioned `<div>` overlays:** the photo is zoomable + rotatable. Re-positioning N `<div>` overlays per zoom level (and reconciling them in React's virtual DOM) is more code than a single canvas redraw. The j12 §Notes for implementation specifies: *"The bounding box overlay uses `<canvas>` with the photo as background and box rectangles drawn on top. Hover handlers link to field rows via component state (no DOM-querying)."* That's load-bearing — the mock-up's bounding box overlay must visually track the photo's transformation (rotation, zoom), which the canvas redraw handles cleanly.

The component contract: `PhotoViewer` accepts `{ photoUrl, boundingBoxes, highlightedField, onBoxHover, className }`. If `photoUrl == null || === ''`, the component renders the fallback `Imagen no se pudo cargar · re-subir →` per j12 §Edge cases.

**Accessibility:** the canvas is `aria-hidden="true"` (decorative overlay). The screen-reader-accessible names for each box live in a sibling `<ul>` with `role="region"` + per-box `<li role="region" aria-label="...">` — invisible to sighted users but read aloud by AT.

Rejected alternative: SVG overlay. SVG has the same z-index challenge + N nodes; canvas wins on redraw simplicity. Plus, j12 §Notes explicitly calls for canvas.

### ADR-J12-OWNER-MANAGER-ONLY — Staff role sees a fallback

The `/photo-ingest/review` route is wrapped in `<RoleGuard role={['OWNER', 'MANAGER']} currentRole={currentRole}>`. Staff sees a fallback `Acceso restringido · solicita aprobación a Owner/Manager →`. The wave-2.8 slice prompt §3 specifies "Owner + Manager only — Staff fallback".

**Why:** the act of signing an ingest is a financial / regulatory commitment — invoice → GR draft → cost rollups; product → Lot → HACCP downstream. Staff can capture the photo via Hermes WhatsApp, but the human-review act lives with operators with budget / compliance authority. Per the persona map (Andoni Manager + Carmen Owner-track), the gating is org-policy aligned.

Rejected alternative: all-roles access with downstream RBAC gates on the draftId / lotId. Spreads the gate across multiple BCs and weakens the audit trail; centralising at the surface is cleaner.

### ADR-J12-KEYBOARD-SHORTCUTS-FORM-FIRST — `j` / `k` / `↵` / `R` only fire outside text inputs

The screen registers a top-level `keydown` listener on `window`. The handler checks `event.target` — if it's inside an `<input>`, `<textarea>`, or `[contenteditable=true]`, the shortcut is suppressed. Otherwise:

- `j` → advance to next queue item.
- `k` → previous queue item.
- `Enter` (when `event.target` is the body) → sign (no-op if CTA is disabled).
- `R` → trigger reclassify modal (mounts the reclassify endpoint call).

**Why:** the operator is typing into the extracted-field inputs almost constantly. Firing `j` to advance the queue while the operator is typing the supplier name would be hostile. The form-first rule keeps the shortcuts power-user-friendly without breaking the editing flow.

Rejected alternative: a small chrome bar with the shortcut hints (matching mock §Atajos de teclado). The mock renders it inline; in code we render the same hints in the header area and gate the shortcuts as described.

### ADR-J12-NO-CONTRACTS-IMPORT — inline shapes in `apps/web/src/api/photo-ingest.ts`

Per the cross-slice contract pattern (CRITICAL hard rule of this slice), all backend shapes (`IngestionItem`, `IngestionField`, `BoundingBox`, `IngestionStatus`, `IngestionKind`, `IngestionExtraction`, request/response shapes) are INLINED in `apps/web/src/api/photo-ingest.ts`. No import from `packages/contracts`. No import from `apps/api/src/photo-ingestion/*`. The URL paths match what slice #17a will register:

- `POST /m3/photo-ingest/items`
- `GET /m3/photo-ingest/items?status=…&kind=…&limit=…`
- `GET /m3/photo-ingest/items/:itemId`
- `POST /m3/photo-ingest/items/:itemId/sign`
- `POST /m3/photo-ingest/items/:itemId/reclassify`

**Why:** slice #17a runs in parallel; importing from slice #17a would couple worktrees and create a build-order dependency. Inlined shapes let both worktrees ship without coordination; the conflict resolves at master merge (mechanical drift on `apps/web/src/api/photo-ingest.ts` if slice #17a's shapes drift). Per slice prompt: "If slice #17a shapes diverge slightly, one-line mechanical fix at master."

The expected merge conflicts at master: `apps/web/src/main.tsx` (route registration) and `packages/ui-kit/src/index.ts` (barrel re-export). Both mechanical.

Rejected alternative: shared types in `packages/contracts`. Pre-Wave-2 we tried this; it forced both slices to land in the same wave or one to wait. The inlined-shape pattern landed in Wave 2.1 as the canonical cross-slice contract.

### ADR-J12-SIGN-WRITES-VIA-MUTATION — TanStack Query mutation, no optimistic update

On submit, `PhotoIngestReviewScreen` calls `useSignIngestion().mutateAsync({...})`. The mutation posts to `POST /m3/photo-ingest/items/:itemId/sign` and returns the persisted ingestion item + audit_log envelope ID + downstream draftId (GR draft for invoice, lotId for product). On success, the screen:

1. clears the local draft,
2. invalidates `['photoIngest', 'queue', orgId, scope]` so the queue refreshes,
3. invalidates `['photoIngest', 'item', orgId, itemId]` so a re-open shows the signed state,
4. renders the success strip with the downstream-link CTA (`ver en Procurement →` for invoice, `ver en Inventory →` for product).

We do NOT use an optimistic update. The audit_log envelope ID + draftId are server-minted; we want the strip to show the truth. Optimistic insertion would have to invent both IDs and risk mismatch on failure.

Rejected alternative: optimistic strip update. Saves ~200 ms of perceived latency but introduces a potential lie if the sign fails. j12 §Decisions favours regulatory truth over UX-snappiness.

## Risks / Trade-offs

- **Risk**: slice #17a changes an endpoint URL or response shape between master cuts → frontend queries break.
  - **Mitigation**: contract documented in the slice prompt; cross-worktree review at master merge. The inlined-shape pattern localises the impact to `apps/web/src/api/photo-ingest.ts`.
- **Risk**: confidence thresholds (`0.85` and `0.60`) drift between slice #17a and slice #17b.
  - **Mitigation**: ADR-J12-CONFIDENCE-THRESHOLDS-DUPLICATED explicitly anchors them as duplicated. Master-merge resolver catches drift. A future slice can land a shared constants module (out of scope for this slice).
- **Risk**: `<canvas>` overlay does not track the photo `<img>` correctly under high-DPI / device pixel ratio.
  - **Mitigation**: `PhotoViewer` reads `window.devicePixelRatio` and scales the canvas backing store. Storybook story covers low + high DPR rendering. JSDOM-based test asserts on canvas dimensions, not pixel content.
- **Risk**: keyboard shortcuts fire while the operator is typing in a `<textarea>` (notes field).
  - **Mitigation**: the keydown handler explicitly checks `event.target.tagName` against `INPUT` / `TEXTAREA` and the `isContentEditable` flag; shortcuts suppress inside form fields.
- **Risk**: localStorage quota exceeded on a laptop with many concurrent drafts.
  - **Mitigation**: each draft is < 2 KB; the 30-minute TTL bounds total storage. Quota-exceeded falls back to "draft not persisted" (silent), screen still functions.
- **Risk**: `aria-live="polite"` re-announces the success strip on every state change.
  - **Mitigation**: the strip uses `role="status"` + `aria-live="polite"` and mounts/unmounts as a unit (not a text update inside a stable region), so AT only fires on mount.
- **Trade-off**: keeping the bulk-approve auto-fill button (`✓ Aprobar todos auto-fill (2)`) rendered but inert.
  - **Decision**: render the button at 40 px ghost styling so the surface matches the mock, but `onClick` is a no-op + `title="Próximamente"` tooltip. M3.x ships the bulk action.

## Migration Plan

No data migrations. No schema changes. The slice introduces:

1. 6 new ui-kit primitives under `packages/ui-kit/src/components/{HitlQueueList,PhotoViewer,ExtractedFieldList,ConfidenceBandBadge,AiProvenanceChip,M3AggregateTypeChip}/`.
2. New screen `apps/web/src/screens/j12/PhotoIngestReviewScreen.tsx`.
3. New REST client `apps/web/src/api/photo-ingest.ts` + hooks `apps/web/src/hooks/usePhotoIngest.ts`.
4. One new route line in `apps/web/src/main.tsx` (lazy-imported).
5. One new nav `<Link>` in `apps/web/src/App.tsx` (Owner + Manager only).
6. One barrel block in `packages/ui-kit/src/index.ts`.

Deploy = push & restart. Rollback = revert PR. The 6 new ui-kit primitives are inert if not consumed; leaving them in place after rollback is harmless.

## Open Questions

- Does slice #17a emit a single `PHOTO_INGESTION_SIGNED` envelope per item, or one envelope per `(item, downstream-aggregate)` pair? This slice assumes one envelope per item carrying `downstreamAggregateId` + `downstreamAggregateType` as nullable fields in `payload_after`. If slice #17a emits two envelopes, the queue invalidation still works (it invalidates by orgId, scope).
- Bulk-approve auto-fill across queue — what is the exact backend contract (single POST vs N POSTs)? Out of scope for this slice; M3.x.
- SSE for live queue refresh — the mock + j12 §Notes call for 15 s SSE; this slice uses 30 s TanStack polling. M3.x adds SSE; the queue hook contract is stable so the swap is a one-line change.
