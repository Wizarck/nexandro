## 1. REST client + types (inlined, no contracts import)

- [ ] 1.1 `apps/web/src/api/haccp.ts` — INLINE shapes for `Ccp`, `CcpReading`, `CorrectiveAction`, `FsmsStandardSummary`, request/response DTOs. URL paths match slice #9's: `POST /m3/haccp/readings`, `GET /m3/haccp/readings`, `GET /m3/haccp/ccps/:ccpId/last-out-of-spec-unresolved`, `POST /m3/haccp/corrective-actions`, `GET /m3/haccp/corrective-actions`.
- [ ] 1.2 Functions wrap `api()` helper from `apps/web/src/api/client.ts`. Pattern mirrors `apps/web/src/api/recall.ts`.

## 2. TanStack Query hooks

- [ ] 2.1 `apps/web/src/hooks/useHaccp.ts` — five hooks:
  - `useCcps(orgId)` — list CCPs (mock data ok for now; full list endpoint can land in slice #9 follow-up).
  - `useRecentReadings(orgId, ccpId)` — last 5 readings.
  - `useLastOutOfSpecUnresolved(orgId, ccpId)` — boolean probe for sticky warning.
  - `useCorrectiveActions(orgId, ccpId)` — predefined corrective actions list.
  - `useRecordReading()` — mutation; on success, invalidates `['haccp','recent-readings',orgId,ccpId]` and `['haccp','last-out-of-spec-unresolved',orgId,ccpId]`.

## 3. ui-kit — CcpPicker

- [ ] 3.1 `packages/ui-kit/src/components/CcpPicker/CcpPicker.tsx` — open/collapsed states derived from `selectedId`. Reuses `BadgeChip` (Wave 2.4) for the due-by countdown.
- [ ] 3.2 `CcpPicker.types.ts` — exported `Ccp`, `CcpPickerProps`.
- [ ] 3.3 `CcpPicker.test.tsx` — covers: list renders all CCPs, click fires `onSelect`, collapsed mode renders single row + `cambiar →`, cambiar fires `onSelect(null)`.
- [ ] 3.4 `CcpPicker.stories.tsx` — 3 stories: open with 3 CCPs, collapsed with 1 selected, open with 1 overdue.
- [ ] 3.5 Export from barrel + index.ts.

## 4. ui-kit — ReadingInput

- [ ] 4.1 `packages/ui-kit/src/components/ReadingInput/ReadingInput.tsx` — type-aware variants (numeric / checkbox / multi-select). 60 px tall, tabular-nums on numeric.
- [ ] 4.2 `ReadingInput.types.ts` — exported `ReadingInputProps`, `ReadingInputType`, `MultiSelectOption`.
- [ ] 4.3 `ReadingInput.test.tsx` — covers: numeric typing fires onChange with string, checkbox click fires onChange with boolean, multi-select chip tap toggles items.
- [ ] 4.4 `ReadingInput.stories.tsx` — 3 stories per variant.
- [ ] 4.5 Export from barrel + index.ts.

## 5. ui-kit — SpecRangeReadback

- [ ] 5.1 `packages/ui-kit/src/components/SpecRangeReadback/SpecRangeReadback.tsx` — pure derivation; `idle / in-spec / out-of-spec`. Wraps copy in `role="status"` + `aria-live="polite"`.
- [ ] 5.2 `SpecRangeReadback.types.ts` — exported `SpecRangeReadbackProps`, `SpecRangeStatus`.
- [ ] 5.3 `SpecRangeReadback.test.tsx` — covers: idle copy with spec range, in-spec turns success with ✓, out-of-spec turns destructive with ⚠, transitions update via `data-status` and live region.
- [ ] 5.4 `SpecRangeReadback.stories.tsx` — 3 stories: idle, in-spec, out-of-spec.
- [ ] 5.5 Export from barrel + index.ts.

## 6. ui-kit — CorrectiveActionPicker

- [ ] 6.1 `packages/ui-kit/src/components/CorrectiveActionPicker/CorrectiveActionPicker.tsx` — dropdown of predefined actions + free-form notes textarea + a `<details>` toggle for the "razón documentada sin corrective" override (rendered inert in this slice).
- [ ] 6.2 `CorrectiveActionPicker.types.ts` — exported `CorrectiveActionOption`, `CorrectiveActionPickerProps`.
- [ ] 6.3 `CorrectiveActionPicker.test.tsx` — covers: dropdown changes selection, notes input fires onChangeNotes, override toggle expands.
- [ ] 6.4 `CorrectiveActionPicker.stories.tsx` — 2 stories: default + with-selection.
- [ ] 6.5 Export from barrel + index.ts.

## 7. ui-kit — RecentReadingsStrip

- [ ] 7.1 `packages/ui-kit/src/components/RecentReadingsStrip/RecentReadingsStrip.tsx` — read-only list capped at 5 rows. Each row: timestamp + value + actor + in/out-of-spec glyph. Reuses Pulcinella tokens.
- [ ] 7.2 `RecentReadingsStrip.types.ts` — exported `RecentReadingRow`, `RecentReadingsStripProps`.
- [ ] 7.3 `RecentReadingsStrip.test.tsx` — covers: caps at 5, out-of-spec rows carry `data-out-of-range="true"`, glyph + text both present.
- [ ] 7.4 `RecentReadingsStrip.stories.tsx` — 2 stories: typical (5 in-spec), mixed (with one out-of-spec).
- [ ] 7.5 Export from barrel + index.ts.

## 8. ui-kit — OutOfSpecStickyWarning

- [ ] 8.1 `packages/ui-kit/src/components/OutOfSpecStickyWarning/OutOfSpecStickyWarning.tsx` — `role="alert"`, `--destructive` bg, copy `Lectura previa fuera de rango sin acción correctiva · revisar antes de firmar nueva lectura`. Renders an optional `Ver previa →` link.
- [ ] 8.2 `OutOfSpecStickyWarning.types.ts` — exported `OutOfSpecStickyWarningProps`.
- [ ] 8.3 `OutOfSpecStickyWarning.test.tsx` — covers: role=alert, prior-reading link fires onSeePrior when supplied.
- [ ] 8.4 `OutOfSpecStickyWarning.stories.tsx` — 2 stories: default, with-link.
- [ ] 8.5 Export from barrel + index.ts.

## 9. Screen — HaccpRecordScreen

- [ ] 9.1 `apps/web/src/screens/j10/HaccpRecordScreen.tsx` — composes the 6 components above + state machine + draft persistence + submit mutation.
- [ ] 9.2 Draft persistence: `localStorage` keyed by `nexandro.haccp.draft.v1.<orgId>.<ccpId>.<actorUserId>`. 10 min TTL. Stale drafts discarded on mount. Successful submit clears.
- [ ] 9.3 State machine: pick CCP → enter reading (live readback) → conditional corrective-action mount → primary CTA gated.
- [ ] 9.4 On submit, calls `useRecordReading().mutateAsync({...})`; invalidates the strip + sticky-warning queries; renders confirmation interstitial.
- [ ] 9.5 `HaccpRecordScreen.test.tsx` — integration test: render → pick CCP → enter out-of-spec value → corrective-action picker mounts → fill → submit → assert mutation called.

## 10. Route registration

- [ ] 10.1 `apps/web/src/main.tsx` — add `{ path: 'haccp/record', element: <HaccpRecordScreen /> }` to the router children. Add lazy import.

## 11. Navigation integration

- [ ] 11.1 `apps/web/src/App.tsx` — add a `<Link to="/haccp/record">HACCP</Link>` to the top nav. No `<RoleGuard>` (all roles can log readings).

## 12. End-to-end verification

- [ ] 12.1 Verify Vitest reports zero red across `packages/ui-kit` + `apps/web`.
- [ ] 12.2 Verify the screen renders when `VITE_DEMO_USER_ROLE='STAFF'` + `VITE_DEMO_ORG_ID='org-1'`.
- [ ] 12.3 Verify the live readback transitions on input (manual smoke test).

## Deferred

- **Service-worker offline queue for submitted readings** — j10 §Edge case "Reading device offline" requires the M1 service-worker pattern to be wired. M3.x.
- **FSMS-standard version selector** — j10 §Edge case "FSMS-standard config changes between draft and submission". M3.x.
- **Voice dictation (`🎤 Dictar`) + thermometer photo capture (`📷 Foto termómetro`)** — visible in j10 mock as inert buttons in this slice; full Vision LLM integration is a future M3.x slice.
- **"Firmar + siguiente CCP" multi-step batch logging** — rendered as disabled secondary button in this slice; sequencing across CCPs is M3.x.
- **Soft-delete duplicate reading from RecentReadingsStrip** — j10 §Decisions "Recent readings strip is read-only"; deletion is a separate amendment flow, M3.x.
- **Override path ("Razón documentada sin corrective")** — the `<details>` toggle renders, but submitting an override requires Owner approval; M3.x.
- **Storybook INT-style flow test** — deferred per slice prompt.
- **Hermes / WhatsApp surface** — same MCP capability, different surface; separate slice.
