# m3.x-photo-ingest-retroactive-correction-ui

## Problem

H1b PR #152 shipped `POST /m3/photo-ingest/items/:itemId/retroactive-correction` and the append-only `corrections_history` column. F2 PR #154 added the `inventory.retroactive-correct-photo-ingestion` MCP capability + service/controller unit tests. **No human surface exposes the operation today** — Owners and Managers can only reach it via the Hermes MCP chat surface or raw curl. The j12 `PhotoIngestReviewScreen` (slice #17b) handles the standard HITL sign flow but has no path to retroactively correct an already-signed item.

## Proposal

Extend j12 with a 4th scope chip `Firmadas` and a retroactive-correction sub-flow that reuses the existing 3-column layout, plus a new `CorrectionsHistoryList` ui-kit primitive for the audit-trail sidebar.

**Scope chip set after this slice**: `Mías | Todas | Rechazadas | Firmadas`.

**Selected signed-item flow**:
1. Centre column: `PhotoViewer` unchanged (read-only display of the signed item's photo + bounding boxes).
2. Right column (initial state):
   - `ExtractedFieldList` in **read-only mode** (NEW `readOnly` prop on the ui-kit component) showing the most recent `operatorCorrection` values.
   - `CorrectionsHistoryList` (NEW ui-kit primitive) summarising prior retro-corrections from `correctionsHistory[]` — timestamp, user, reason snippet, field-delta count.
   - **"Corregir retroactivamente"** button (OWNER + MANAGER only — STAFF doesn't see j12 today).
3. Right column (retro mode after button click):
   - `ExtractedFieldList` switches to **editable mode** prepopulated with the most recent operator values.
   - New `<textarea>` for `reason` (optional, ≤500 chars per the existing DTO `@Length(1, 500)`).
   - **"Reenviar firma"** + **"Cancelar"** buttons.
   - Submit → `POST /m3/photo-ingest/items/:itemId/retroactive-correction` with the corrected `fieldCorrections` + optional `reason` + actor `userId` (derived from auth context, NOT from a form field per the existing sign flow).
   - On 200 with `idempotent: true` (same content hash as latest entry): show an inline info note "Sin cambios — última corrección idéntica" and remain in retro mode.
   - On 200 with `idempotent: false`: refetch the item, exit retro mode, return to read-only display with the updated history.
   - On 422 (`INGESTION_ITEM_NOT_CORRECTABLE` or `INGESTION_CORRECTION_EMPTY`): inline error banner with the server-provided message.

## Backend additions (small, non-invasive)

- `apps/api/src/photo-ingestion/interface/ingestion.controller.ts` — `toItemDetail()` extended to include `correctionsHistory: row.correctionsHistory ?? []`.
- `apps/api/src/photo-ingestion/interface/dto/ingestion-item-detail.dto.ts` (if it exists; otherwise inlined in controller) — extend the response shape with `correctionsHistory`.
- Migration 0041 already shipped the column; entity already maps it. No DB change.

## Frontend additions

- `apps/web/src/api/photo-ingest.ts`:
  - Extend `IngestionItem` with `correctionsHistory: ReadonlyArray<CorrectionsHistoryEntryDto>` (new inline shape mirroring the API layer's `CorrectionsHistoryEntry`).
  - Add `retroactiveCorrectIngestion(input: RetroactiveCorrectionRequest): Promise<RetroactiveCorrectionResponse>` calling `POST /m3/photo-ingest/items/:itemId/retroactive-correction`.
- `apps/web/src/hooks/usePhotoIngest.ts` — add `useRetroactiveCorrection()` mutation. On success, invalidate the item query + the queue query (signed scope refresh).
- `apps/web/src/screens/j12/PhotoIngestReviewScreen.tsx`:
  - Add `'signed'` to `ScopeChip` union.
  - Add a 4th `ScopeChipBtn` for `Firmadas`.
  - State machine extends with `retroEditing: boolean` flag (only meaningful when scope = `'signed'`).
  - On signed-scope queue items, render `CorrectionsHistoryList` + readonly fields by default; switch to retro mode on button click.

## New ui-kit primitive

`packages/ui-kit/src/components/CorrectionsHistoryList/` — three files (`*.tsx + *.types.ts + *.test.tsx`) + Storybook story. Renders an ordered list of history entries with date + actor + reason snippet + delta count. Empty state shows "Sin correcciones previas". Pure presentational — no fetching, accepts `entries: ReadonlyArray<CorrectionsHistoryEntry>`.

Plus a new `readOnly?: boolean` prop on the existing `ExtractedFieldList` so the same component renders for both retro display and retro edit.

## RBAC

OWNER + MANAGER only at the screen layer (matches the controller's `@Roles('OWNER', 'MANAGER')`). STAFF doesn't see j12 today; this slice preserves that. The retro-correct button is rendered for both OWNER and MANAGER without further gating.

## FR mapping

Closes the operator-visibility gap for FR31 (HITL retroactive correction). j12 was the natural surface; this slice completes the operator-facing flow shipped by H1b + F2.

## Out of scope

- The `requires_review` review-queue surface for downstream Lot/GR (already filed as `m3.x-operator-review-queue-ui` — independent backend dependency).
- Any change to the retroactive-correction service or controller logic itself (already shipped + tested by H1b + F2).
- A separate "audit-trail expanded view" sub-screen showing the FULL diff between each correction's `previousCorrection` snapshot — collapsed to a delta-count summary in `CorrectionsHistoryList` for this slice. Filed `m3.x-corrections-history-diff-modal` if Master wants expanded view later.
