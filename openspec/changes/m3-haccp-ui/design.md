## Context

j10 is the recurring HACCP capture surface: Carmen (Head Chef) wipes her hands at the end of service, taps the kitchen tablet at her station, and logs the cooling-curve breakpoint in ≤ 30 s. The same MCP capability (`haccp.record-ccp-reading`) is invoked by Mikel (Staff) via WhatsApp — different surface, same contract. This slice ships the web rendering. The agent rendering is slice-M3.x (Hermes layer).

Slice #9 (`m3-ccp-reading-aggregate`, sibling Wave 2.6, parallel worktree) lands the `haccp` BC + the 5 REST endpoints + the canonical `FsmsStandard` config. None of slice #9's output produces a surface that Carmen can browse. This slice composes 6 ui-kit components into one screen wired to slice #9's API.

The j10 mock at `master/docs/ux/variants/mock-j10-haccp-record.html` is the canonical visual reference: a two-column tablet layout (form left, recent-readings strip right) with a conditional sticky warning at the top, a flat-bordered form panel (no nested cards), 60 px input height, 64 px CTA height (above the 48 px standard because operators may have wet/oily hands), tabular-nums numeric input, and a corrective-action picker that mounts inline (NOT as a modal — j10 §Anti-patterns avoided "modal-as-first-thought"). The accessible-name layer is critical: live readback uses `aria-live="polite"` so screen-readers announce in/out-of-spec status as Carmen types, and the sticky warning uses `role="alert"` so the prior-gap is surfaced immediately on landing.

The hot question — "is this reading in-spec?" — runs **client-side**, not as a server roundtrip. Spec ranges come down with the CCP picker payload and stay in component state. No keystroke triggers a network call. That's the load-bearing decision behind ADR-J10-LIVE-READBACK-CLIENT-SIDE.

## Goals / Non-Goals

**Goals:**

- Carmen opens `/haccp/record`, picks a CCP, enters a reading, and signs in ≤ 30 s on a kitchen tablet at 10″ landscape (j10 §Goal).
- Live readback is glance-driven: in-spec turns the line `--success` with `✓`, out-of-spec turns it `--destructive` with `⚠` and surfaces the corrective-action picker inline.
- Out-of-spec readings cannot be signed without a corrective action OR an explicit documented override (the override path is a future-proofing affordance per j10 mock §Region 5; in this slice we render a placeholder for the override surface but require a corrective action by default).
- A draft persists locally for 10 minutes per `(orgId, ccpId, actorUserId)`. After 10 minutes the draft is discarded; the system never silently signs a stale draft (j10 §Edge case).
- A prior out-of-spec reading without a corrective-action linkage MUST surface as a sticky `--destructive` banner at the top of the surface (j10 §Region 9). The operator cannot dismiss it; the banner stays until the prior gap is addressed.
- The recent-readings strip refreshes after a successful submit so the new reading shows up immediately.
- Touch targets meet kitchen reality: input 60 px tall, primary CTA 64 px tall, oily-finger friendly.
- Accessibility: live readback uses `aria-live="polite"`; sticky warning uses `role="alert"`; sparkline-equivalents (the read-only strip rows) carry text + glyph, never colour-only.

**Non-Goals:**

- Backend BC scaffolding (slice #9 owns `apps/api/src/haccp/`).
- Hermes / WhatsApp rendering of the same capability (separate slice, future M3.x).
- Offline queue + service-worker integration for offline submission (M1 has the substrate; wiring is future M3.x).
- Voice dictation (`🎤 Dictar` in mock is rendered inert).
- Thermometer photo capture (`📷 Foto termómetro` in mock is rendered inert).
- "Firmar + siguiente CCP" multi-step batch logging (rendered as disabled secondary button).
- FSMS-standard version explicit selection ("FSMS-2026-v2 → v3 vigente · revise el rango").
- Soft-delete from the recent-readings strip.
- Per-organization tuning of spec ranges (those are owned by FsmsStandard config — slice #9).

## Decisions

### ADR-J10-LIVE-READBACK-CLIENT-SIDE — live in-spec/out-of-spec derivation runs in the React component, not in the API

The hot path — "is this reading in-spec right now, as Carmen types?" — runs client-side. The `SpecRangeReadback` component receives `{ specMin, specMax, currentValue, unit }` as props and derives `status` locally. It does NOT call the API per keystroke. The spec range comes down with the CCP picker payload (`Ccp.spec`) and lives in the parent's state.

**Why:** the persona's mistake mode is "typed a wrong number, didn't notice" (j10 §Decisions). The live affordance must be instant, not network-bound. A 50 ms round-trip per keystroke would make the kitchen tablet feel laggy. Per ADR-002 the API contract is the canonical truth; the client just renders it. The component's status derivation is pure: `currentValue == null → 'idle'`; `Number.isNaN(value) → 'idle'`; `value < specMin || value > specMax → 'out-of-spec'`; else `'in-spec'`. The same derivation runs server-side as the validation gate on `POST /m3/haccp/readings` — slice #9's concern.

Rejected alternative: debounced server validation per keystroke. Adds 200 ms of latency in the worst case (slow Wi-Fi) and a useless API call.

### ADR-J10-CORRECTIVE-ACTION-IS-A-GATE — out-of-spec submission requires a linked corrective action

When the reading is out-of-spec, the primary CTA is disabled until the corrective-action picker has a non-null selection. The picker mounts inline (NOT as a modal — j10 §Anti-patterns "modal-as-first-thought") below the spec-range readback.

**Why:** decoupling the reading from the response is "exactly the gap that recall investigations later uncover" (j10 §Decisions). The UX rule prevents the lapse from being created in the first place. The architecture (ADR-031 audit-log indexing) treats CCP-without-corrective as a queryable lapse — a regulator sees it; the UX prevents the row from existing in the first place.

The component contract: `CorrectiveActionPicker` accepts `{ actions, selectedActionId, onSelectAction, notes, onChangeNotes }`. The parent `HaccpRecordScreen` mounts it only when `status === 'out-of-spec'`. If the operator wants to document an override (legitimate out-of-spec without corrective — e.g. scheduled defrost), j10 mock §Region 5 shows a `<details>` toggle "¿Razón documentada sin corrective?". This slice renders the toggle but does NOT process the override path; submitting an override goes to an Owner-approval flow that is M3.x.

Rejected alternative: a modal that surfaces "you must enter a corrective action" on submit-click. Modal-as-first-thought is a j10 anti-pattern; it interrupts the kitchen flow.

### ADR-J10-DRAFT-PERSISTENCE-LOCALSTORAGE — 10-minute TTL, keyed by `(orgId, ccpId, actorUserId)`

Local draft persistence uses `localStorage` keyed by `nexandro.haccp.draft.v1.<orgId>.<ccpId>.<actorUserId>`. The stored shape:

```ts
interface DraftV1 {
  value: string | boolean | string[];
  notes?: string;
  correctiveActionId?: string;
  savedAt: number; // ms epoch
  v: 1;
}
```

On mount, `HaccpRecordScreen` checks for a draft. If found AND `now - savedAt < 10 min`, the value is hydrated into local state and a mute eyebrow "Borrador desde hace N min · ¿continuar?" surfaces below the form panel. The operator can ignore it and overwrite. On successful submit, the draft is cleared. On reading-input change, the draft is written (debounced to ~500 ms via React state to avoid thrashing localStorage). After 10 minutes the draft is treated as stale (discarded on next mount).

**Why localStorage and NOT IndexedDB:** j10 §Notes mentions IndexedDB, but the per-key payload is < 1 KB; localStorage's synchronous get/set is simpler and the 10 min TTL means stale-data risk is bounded. IndexedDB lands if we need cross-tab sync (Carmen and Mikel both editing the same CCP draft in two windows — not a real scenario per j10 §Edge cases "Multiple staff logging same CCP simultaneously").

**Failure mode:** if localStorage is full or disabled (Safari private mode), the draft is not persisted; the screen still functions. Acceptable degradation per j10 §Edge case "Reading device offline" (which is about queueing the SUBMIT, not the draft).

Rejected alternative: server-side draft persistence via a `drafts` table. Drafts never enter audit_log (j10 §Decisions "No 'save draft' affordance"); a server draft table is dead weight + a sync race.

### ADR-J10-STICKY-WARNING-AT-MOUNT — prior out-of-spec without corrective surfaces immediately

On mount, `HaccpRecordScreen` calls `useLastOutOfSpecUnresolved(orgId, ccpId)` which probes `GET /m3/haccp/ccps/:ccpId/last-out-of-spec-unresolved`. If the response is `true`, `OutOfSpecStickyWarning` mounts at the top of the surface. The banner uses `role="alert"` so screen-readers announce it on landing.

**Why a separate endpoint, not derived from the recent-readings strip:** the strip shows the last 5 readings; the gap might be older. The probe asks "is there ANY prior reading still without a linked corrective?". Slice #9 owns that query. From this slice's perspective the contract is a boolean probe.

The banner is non-dismissable. Carmen cannot click "x" to hide it (j10 §Region 9 "she cannot ignore it"). It stays until the prior gap is addressed via a separate corrective-action flow (M3.x — for now, the banner copy directs Carmen to the prior reading).

Rejected alternative: dismissable banner with a 24h cookie. Defeats the regulatory purpose; the gap stays open.

### ADR-J10-CCP-PICKER-COLLAPSES — list collapses to one-line summary on selection

`CcpPicker` renders one of two states:

- **Open** (no `selectedId`): vertical list of `Ccp` rows, each with name + last reading + due-by countdown. Each row is a button. Selection collapses to:
- **Collapsed** (one CCP selected): single bordered row showing the selected CCP name + a `cambiar →` button that re-opens the list.

**Why:** once the CCP is chosen, the picker is no longer load-bearing on the surface (j10 §Decisions "CCP picker collapses on selection"). Collapsing removes a column from the eye's scan and gives the input + readback more room.

The component contract: `{ ccps, selectedId, onSelect }`. State (open/collapsed) is fully derived from `selectedId`. No internal state.

Rejected alternative: a `<select>` dropdown. Defeats glance-driven affordance; the visible list anchors Carmen's mental model.

### ADR-J10-READING-INPUT-IS-TYPE-AWARE — one component, three variants

`ReadingInput` accepts `inputType: 'numeric' | 'checkbox' | 'multi-select'`. The numeric variant renders a `<input type="number" inputMode="decimal" step="0.1">`; checkbox renders a clean/not-clean toggle pair; multi-select renders a chip-list with single-tap toggle per option (allergen list).

The `onChange` callback is typed: `(value: string | boolean | string[]) => void`. The parent component knows which variant it requested and narrows the type at the call site.

**Why one component, not three:** the surface mounts at the same coordinate in the form panel regardless of variant; reusing the same wrapper (label + 60 px tall + tabular-nums) keeps the form layout consistent across CCP types. The variant is a render-time choice driven by `Ccp.inputType` (slice #9 derives this from FsmsStandard config).

Rejected alternative: three separate components (`NumericReadingInput`, `CheckboxReadingInput`, etc.). Multiplies the test surface 3× and produces three barrel exports that all do the same job.

### ADR-J10-RECENT-READINGS-STRIP-IS-READ-ONLY — no inline correction from the strip

`RecentReadingsStrip` accepts `{ readings, orgId, ccpId }`. Each row renders timestamp + value + actor + in/out-of-spec glyph. Rows are NOT clickable. There is no "edit this reading" affordance from the strip.

**Why:** existing readings are immutable (j10 §Decisions "Recent readings strip is read-only"). Corrections happen via a separate amendment flow that produces its own audit_log row — that flow is M3.x and lives outside this slice. Surfacing an inline edit affordance here would tempt the operator to bypass the amendment audit trail.

Rejected alternative: inline soft-delete on long-press. Tempting kitchen-tablet UX but bypasses the regulatory trail.

### ADR-J10-NO-CONTRACTS-IMPORT — inline shapes in apps/web/src/api/haccp.ts

Per the cross-slice contract pattern (CRITICAL hard rule of this slice), all backend shapes (`CcpReading`, `CorrectiveAction`, `FsmsStandardSummary`, `Ccp`, request/response shapes) are INLINED in `apps/web/src/api/haccp.ts`. No import from `packages/contracts`. No import from `apps/api/src/haccp/*`. The URL paths match what slice #9 will register.

**Why:** slice #9 runs in parallel; importing from slice #9 would couple worktrees and create a build-order dependency. Inlined shapes let both worktrees ship without coordination; the conflict resolves at master merge (mechanical drift on `apps/web/src/api/haccp.ts` if slice #9's shapes drift).

The expected merge conflict at master: `apps/web/src/main.tsx` (route registration) and `packages/ui-kit/src/index.ts` (barrel re-export). Both mechanical.

Rejected alternative: shared types in `packages/contracts`. Pre-Wave-2 we tried this; it forced both slices to land in the same wave or one to wait. The inlined-shape pattern landed in Wave 2.1 as the canonical cross-slice contract.

### ADR-J10-SUBMIT-WRITES-VIA-MUTATION — TanStack Query mutation, no optimistic update

On submit, `HaccpRecordScreen` calls `useRecordReading().mutateAsync({...})`. The mutation posts to `POST /m3/haccp/readings` and returns the persisted reading + audit_log envelope ID. On success, the screen:

1. clears the local draft,
2. invalidates `['haccp', 'recent-readings', orgId, ccpId]` so the strip refreshes,
3. invalidates `['haccp', 'last-out-of-spec-unresolved', orgId, ccpId]` so the sticky warning re-evaluates,
4. renders the confirmation interstitial (`✓ Lectura firmada · audit_log AL-... · firma <actor>`).

We do NOT use an optimistic update. The audit_log envelope ID is server-minted; we want the strip to show the truth (which row the server actually persisted). Optimistic insertion would have to invent the envelope ID and risk mismatch on failure.

Rejected alternative: optimistic insertion into the strip. Saves ~200 ms of perceived latency but introduces a potential lie if the submit fails. j10 §Decisions favours regulatory truth over UX-snappiness.

## Risks / Trade-offs

- **Risk**: slice #9 changes the `Ccp` shape or the spec endpoint URLs between master cuts → frontend queries break.
  - **Mitigation**: contract documented in the slice prompt; cross-worktree review at master merge. The inlined-shape pattern localises the impact to `apps/web/src/api/haccp.ts`.
- **Risk**: localStorage quota exceeded on a kitchen tablet with many concurrent CCP drafts.
  - **Mitigation**: each draft is < 1 KB; the 10-minute TTL bounds total storage. Quota-exceeded falls back to "draft not persisted" (silent), screen still functions.
- **Risk**: `useLastOutOfSpecUnresolved` probe failure on slow Wi-Fi delays the sticky warning render.
  - **Mitigation**: the probe returns `false` on error (assumed safe default); the warning is only an additive surface, not gating.
- **Risk**: aria-live polite re-announces on every keystroke as Carmen types, becoming noisy for screen-reader users.
  - **Mitigation**: the live region only fires when `status` transitions (idle → in-spec / in-spec → out-of-spec / etc), NOT on every value change. The component uses `useMemo` to derive a stable status string and only that string lives in the `aria-live` region.
- **Risk**: out-of-spec corrective-action picker mounts inline below the readback, pushing the CTA off-screen on small tablets.
  - **Mitigation**: 10″ landscape tablet is the canonical viewport (j10 §device); on phone the layout collapses to single column and the picker is below the input. Sticky CTA at the bottom of viewport is out of scope.
- **Trade-off**: keeping override path ("Razón documentada sin corrective") rendered but inert.
  - **Decision**: render the `<details>` toggle so the surface matches the mock, but the radio is non-submittable in this slice. M3.x adds the Owner-approval flow.

## Migration Plan

No data migrations. No schema changes. The slice introduces:

1. 6 new ui-kit primitives under `packages/ui-kit/src/components/{CcpPicker,ReadingInput,SpecRangeReadback,CorrectiveActionPicker,RecentReadingsStrip,OutOfSpecStickyWarning}/`.
2. New screen `apps/web/src/screens/j10/HaccpRecordScreen.tsx`.
3. New REST client `apps/web/src/api/haccp.ts` + hooks `apps/web/src/hooks/useHaccp.ts`.
4. One new route line in `apps/web/src/main.tsx`.
5. One barrel block in `packages/ui-kit/src/index.ts`.

Deploy = push & restart. Rollback = revert PR. The 6 new ui-kit primitives are inert if not consumed; leaving them in place after rollback is harmless.

## Open Questions

- Does slice #9 emit a single `HACCP_CCP_READING_RECORDED` envelope per reading, or one envelope per `(reading, corrective_action)` pair? This slice assumes one envelope per reading carrying `corrective_action_id` as a nullable field in `payload_after`. If slice #9 emits two envelopes, the recent-readings strip query still works (it queries readings, not corrective-action envelopes).
- The override path ("Razón documentada sin corrective" with Owner approval) — what is the exact Owner-approval surface? Out of scope for this slice; M3.x.
- Voice dictation + thermometer photo — assumed inert here; the Vision LLM integration is a future slice.
