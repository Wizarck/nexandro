## Why

Slice #9 `m3-ccp-reading-aggregate` (Wave 2.6 sibling, parallel worktree) builds the **producer side** of M3 HACCP recording: it lands the `haccp` BC, the `CcpReading` + `CorrectiveAction` aggregates, the canonical `FsmsStandard` config, and the REST endpoints `POST /m3/haccp/readings`, `GET /m3/haccp/readings`, `GET /m3/haccp/ccps/:ccpId/last-out-of-spec-unresolved`, `POST /m3/haccp/corrective-actions`, `GET /m3/haccp/corrective-actions`. None of that is visible to Carmen (Head Chef) on her kitchen tablet — there is no surface in `apps/web/` that lets her log a CCP reading in ≤30 s, oily-fingers, glance-driven.

This slice (#10) ships the **consumer side**: a `/haccp/record` route that renders the j10 mock as 6 production components composed into one screen. FR9 (CCP capture per FSMS standard config), FR10 (corrective-action linkage on out-of-spec), FR11 (FSMS standard reference inline), FR12 (in-spec validation + live readback), FR13 (audit_log envelope per reading) close at end of this slice. The j10 mock at `master/docs/ux/variants/mock-j10-haccp-record.html` is the canonical reference: `CcpPicker` (CCP list with due-by countdown that collapses on selection), `ReadingInput` (type-aware variant per FSMS config — numeric/checkbox/multi-select), `SpecRangeReadback` (live `--success`/`--destructive` line with `aria-live="polite"`), `CorrectiveActionPicker` (mounts only on out-of-spec), `RecentReadingsStrip` (right sidebar — last 5 readings, read-only), `OutOfSpecStickyWarning` (top-of-surface banner when a prior reading is out-of-spec without a linked corrective action).

This slice is **UI-heavy + backend ZERO**. We never write to `apps/api/src/haccp/*` — slice #9 owns the BC + endpoints; this slice ships only the React surface that calls those endpoints. No migrations. No new BC files. RBAC is implicit: all roles can log readings (per j10.md "no RBAC-differentiated UX for the basic act of logging"). The local 10-minute draft persistence (j10 §Edge case "Carmen interrupted mid-entry") lives in `localStorage` keyed by `(orgId, ccpId, actorUserId)`.

## What Changes

- **`packages/ui-kit/src/components/CcpPicker/`** — list of CCPs with last reading + due-by countdown. Collapses to a single-line summary on selection per j10 §Region 2.
- **`packages/ui-kit/src/components/ReadingInput/`** — single primary input (60 px tall, tabular-nums, decimal-aware keyboard on touch). `inputType: 'numeric' | 'checkbox' | 'multi-select'`; returns `string | boolean | string[]` via `onChange`.
- **`packages/ui-kit/src/components/SpecRangeReadback/`** — live readback below the input. Shows the spec range; turns `--success` (`✓ Dentro de rango`) when in-spec, `--destructive` (`⚠ Fuera de rango · se requiere acción correctiva`) when out-of-spec. `aria-live="polite"` (j10 §Notes for implementation).
- **`packages/ui-kit/src/components/CorrectiveActionPicker/`** — dropdown of predefined corrective actions + free-form notes textarea. Parent decides mount (parent only mounts on out-of-spec).
- **`packages/ui-kit/src/components/RecentReadingsStrip/`** — right sidebar (or bottom drawer on phone). Last 5 readings as read-only rows: timestamp + value + actor + in/out-of-spec glyph.
- **`packages/ui-kit/src/components/OutOfSpecStickyWarning/`** — sticky `--destructive` banner at top of surface. Mounts only when `lastOutOfSpecWithoutAction` is true.
- **`apps/web/src/screens/j10/HaccpRecordScreen.tsx`** — new page mounted at `/haccp/record`. Composes the 6 components above; manages state machine (pick CCP → enter reading → conditional corrective-action → sign); persists draft to `localStorage` with 10 min TTL; calls `POST /m3/haccp/readings` via TanStack mutation on submit.
- **`apps/web/src/api/haccp.ts`** — REST client wrapping `api()` for the 5 slice-#9 endpoints. INLINE shapes (`CcpReading`, `CorrectiveAction`, `FsmsStandardSummary`, `Ccp`, etc.) — no `@opentrattos/contracts` import; no import from `apps/api/src/haccp/*`.
- **`apps/web/src/hooks/useHaccp.ts`** — TanStack hooks: `useCcps`, `useRecentReadings`, `useLastOutOfSpecUnresolved`, `useRecordReading` (mutation), `useCorrectiveActions`.
- **`apps/web/src/main.tsx`** — register `/haccp/record` route + lazy import.
- **BREAKING**: none. New components + new route + new client. No schema changes. Wave 1.19 audit-log UI stays untouched; slice #9 owns all backend.

## Capabilities

### New Capabilities

- `haccp-ui`: All-role kitchen-tablet surface at `/haccp/record` rendering j10 with 6 components; live spec-range readback (client-side, no server roundtrip per keystroke); local 10-minute draft persistence keyed by `(orgId, ccpId, actorUserId)`; conditional corrective-action gate on out-of-spec; sticky warning when a prior reading is out-of-spec without a linked corrective action; recent-readings strip for trend awareness.

### Modified Capabilities

- None. This slice creates a new surface entirely. Slice #9 owns the `haccp` BC; this slice consumes its REST API.

## Impact

- **Prerequisites**: master at `26fa027` (Wave 2.5 merged); slice #9 (`m3-ccp-reading-aggregate`, sibling Wave 2.6) provides the BC + REST endpoints. We code defensively: the URL paths in `apps/web/src/api/haccp.ts` match slice #9's prompt verbatim. If slice #9's shapes diverge at master merge, the resolver picks up the conflict; no shared `packages/contracts` import couples the two slices.
- **Code**:
  - `packages/ui-kit/src/components/{CcpPicker,ReadingInput,SpecRangeReadback,CorrectiveActionPicker,RecentReadingsStrip,OutOfSpecStickyWarning}/` — 6 new primitives with Storybook stories (~700 LOC + ~350 LOC tests).
  - `apps/web/src/screens/j10/HaccpRecordScreen.tsx` — new screen (~250 LOC + ~150 LOC tests).
  - `apps/web/src/api/haccp.ts` + `apps/web/src/hooks/useHaccp.ts` — ~200 LOC.
  - `apps/web/src/main.tsx` — one new route entry.
- **Performance**:
  - Live readback is client-side; no server roundtrip per keystroke (j10 §Decisions "Spec range readback is LIVE, not on submit").
  - First paint ≤ 800 ms on slow Wi-Fi (j10 §Notes for implementation): CCP picker + last 5 readings preload with the dashboard so the surface is warm. In this slice we fetch on mount; future optimisation can prefetch from the home dashboard.
  - Submit mutation latency: ~200 ms over loopback; backend SLO owned by slice #9.
- **Storage growth**: none — read-write via slice #9.
- **Audit**: every successful submit writes one `audit_log` row of type `HACCP_CCP_READING_RECORDED` (slice #9 emits this). The dashboard reads no audit rows directly; it queries `GET /m3/haccp/readings` which slice #9 backs by `audit_log` or a projection. From this slice's perspective the contract is "GET returns last 5 rows" — backend is slice #9's concern.
- **Rollback**:
  - Remove `apps/web/src/screens/j10/HaccpRecordScreen.tsx` + the route entry from `main.tsx`. No data migration to revert.
  - `packages/ui-kit/` additions are pure-new; nothing references them outside this slice. The 6 new primitives can be left in place even after rollback — they're inert without their consumer.
- **Out of scope** (claimed by other slices or future follow-ups):
  - Offline queue for submitted readings → j10 §Edge case "Reading device offline" mentions reuse of the M1 service-worker pattern; this slice does NOT wire the service worker. Submitted readings while offline will fail; M3.x adds the queue.
  - FSMS-standard version selector (j10 §Edge case "FSMS-standard config changes between draft and submission") → component scaffolds the spec range from a single FsmsStandardSummary; selecting an older version is M3.x.
  - Voice dictation + thermometer photo capture (visible in j10 mock as `🎤 Dictar` + `📷 Foto termómetro`) → mocked as inert buttons; full integration with Vision LLM is slice #M3.x.
  - "Firmar + siguiente CCP" multi-step batch logging (visible in j10 mock) → renders as a disabled secondary button in this slice; sequencing across CCPs is M3.x.
  - Soft-delete duplicate reading from RecentReadingsStrip (j10 §Edge case) → strip is read-only per j10 §Decisions; deletion is a separate amendment flow, M3.x.
  - Hermes / WhatsApp surface (j10 §Capabilities "Mikel via WhatsApp hits `haccp.record-ccp-reading`") → identical contract, different surface; lives in Hermes slice, not this slice.
- **Parallelism**: file-path scope = `packages/ui-kit/src/components/{CcpPicker,ReadingInput,SpecRangeReadback,CorrectiveActionPicker,RecentReadingsStrip,OutOfSpecStickyWarning}/**`, `apps/web/src/screens/j10/**`, `apps/web/src/api/haccp.ts`, `apps/web/src/hooks/useHaccp.ts`, plus one route line in `apps/web/src/main.tsx` and a new `packages/ui-kit/src/index.ts` barrel block. Verified disjoint from siblings:
  - Slice #9 `m3-ccp-reading-aggregate` writes to `apps/api/src/haccp/` — disjoint.
  - Wave 2.5 slices wrote to `apps/api/src/recall/` + `apps/web/src/m3/recall/` — disjoint.
- **Effort estimate**: M (~1 100 LOC implementation + ~500 LOC tests; matches gate-c slice list "M" sizing for frontend-only slices).
