# Tasks — m3.x-photo-ingest-retroactive-correction-ui

## §1 Backend projection

- [x] `apps/api/src/photo-ingestion/interface/ingestion.controller.ts` — extend `toItemDetail()` to project `correctionsHistory: r.correctionsHistory ?? []`.
- [x] Verify the entity already maps `corrections_history` JSONB → `correctionsHistory` (it does per `ingestion-item.entity.ts`).
- [x] Add 1 controller unit case (`ingestion.controller.spec.ts`): `GET /items/:itemId` projects `correctionsHistory` from the entity (uses an entity stub with 2 entries).

## §2 Frontend API client

- [x] `apps/web/src/api/photo-ingest.ts`:
  - Add `CorrectionsHistoryEntryDto` inline type (correctionId, correctedAt, correctedByUserId, reason, fieldNames, contentHash).
  - Extend `IngestionItem` with `correctionsHistory: ReadonlyArray<CorrectionsHistoryEntryDto>`.
  - Add `RetroactiveCorrectionRequest` + `RetroactiveCorrectionResponse` shapes (mirror DTO + service result).
  - Add `retroactiveCorrectIngestion(input)` fn (POST).

## §3 Frontend hook

- [x] `apps/web/src/hooks/usePhotoIngest.ts` — `useRetroactiveCorrection()` mutation. Invalidate the queue + item queries on success.

## §4 ui-kit components

- [x] `packages/ui-kit/src/components/CorrectionsHistoryList/` — new primitive:
  - `CorrectionsHistoryList.types.ts` — `CorrectionsHistoryEntry` shape + props.
  - `CorrectionsHistoryList.tsx` — ordered list, formatted timestamp (intl-friendly), actor user id elided to 8 chars, reason truncated to 60 chars with title-attribute full-text, empty-state copy "Sin correcciones previas".
  - `CorrectionsHistoryList.stories.tsx` — Storybook with 3 variants: empty / one entry / multiple entries.
  - `CorrectionsHistoryList.test.tsx` — 4 cases (empty state, single entry render, multiple entries ordered newest-first, long reason truncation).
- [x] `packages/ui-kit/src/components/ExtractedFieldList/ExtractedFieldList.types.ts` — add `readOnly?: boolean` prop.
- [x] `packages/ui-kit/src/components/ExtractedFieldList/ExtractedFieldList.tsx` — when `readOnly`, render values as plain `<span>` instead of `<input>`; suppress hover wiring's editable cues but keep highlight ring; `aria-disabled="true"` on the container.
- [x] `packages/ui-kit/src/components/ExtractedFieldList/ExtractedFieldList.test.tsx` — add 2 cases (readOnly hides inputs; readOnly preserves highlight).
- [x] `packages/ui-kit/src/index.ts` — re-export `CorrectionsHistoryList` + its types.

## §5 Screen integration

- [x] `apps/web/src/screens/j12/PhotoIngestReviewScreen.tsx`:
  - Extend `ScopeChip` union with `'signed'`. Add the 4th `ScopeChipBtn` ("Firmadas").
  - `signed` scope: `useHitlQueue({ ..., status: 'signed' })`.
  - When `selectedItem.status === 'signed'`:
    - Render `ExtractedFieldList` with `readOnly` (unless retro mode is active).
    - Render `CorrectionsHistoryList` below.
    - Render "Corregir retroactivamente" button (OWNER + MANAGER only).
  - Retro-mode state: `const [retroEditing, setRetroEditing] = useState(false)`; reset on item change.
  - Retro mode: ExtractedFieldList becomes editable + reason textarea + Reenviar/Cancelar buttons.
  - Submit handler calls `useRetroactiveCorrection().mutateAsync({ organizationId, itemId, fieldCorrections, reason })`; on `idempotent: true` shows inline info, on success refetches + exits retro mode.

## §6 Screen test

- [x] `apps/web/src/screens/j12/PhotoIngestReviewScreen.test.tsx` — add 3 cases:
  - `'Firmadas scope shows signed items with corrections-history sidebar'`
  - `'clicking Corregir retroactivamente puts the right column into editable retro mode'`
  - `'submitting a retro correction with no changes shows the idempotent banner'`

## §7 Local gates

- [x] `npx jest --testPathPattern='photo-ingest'` in apps/web — green incl. new cases.
- [x] `npx jest --testPathPattern='photo-ingestion'` in apps/api — green incl. new projection case.
- [x] `npx jest --testPathPattern='CorrectionsHistoryList'` in packages/ui-kit — green.
- [x] `npx jest --testPathPattern='ExtractedFieldList'` in packages/ui-kit — green (existing + 2 new).
- [x] `npx tsc --noEmit -p apps/api/tsconfig.json` — no errors on changed files.
- [x] `npx tsc --noEmit -p apps/web/tsconfig.json` — no errors on changed files.
- [x] `npx tsc --noEmit -p packages/ui-kit/tsconfig.json` — no errors on changed files.
- [x] `npx eslint` on all changed files — clean.

## §8 §4.5.6 AI-reviewer signoff

- [x] Profile: UI-feature slice closing the H1b operator-visibility gap.
- [x] Reviewer self-review:
  - Backend projection is the minimum surface needed (no service/controller logic change)?
  - All copy in Spanish per the existing j12 conventions?
  - RBAC matches the controller (OWNER + MANAGER, STAFF doesn't see the screen)?
  - Idempotent response handled with a distinct UX path (banner, not silent success)?
  - New ui-kit primitive has empty-state copy, Storybook stories, AND tests?

## Deferred / out of scope

- `m3.x-corrections-history-diff-modal` — expanded modal showing the FULL diff between each entry's `previousCorrection` snapshot and the current state. Today's `CorrectionsHistoryList` shows a delta-count summary only; an expanded view is filed if Master asks.
- `m3.x-operator-review-queue-ui` — separate `requires_review` review-queue surface for downstream Lot/GR (depends on new backend endpoint; out of this slice).
