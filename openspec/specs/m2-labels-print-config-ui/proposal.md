# Proposal: m2-labels-print-config-ui

> **Wave 1.15** — Owner-facing UI for the label-fields configuration shipped in Wave 1.6 (`m2-labels-rendering`). Today the `GET/PUT /organizations/:id/label-fields` endpoints are reachable only via curl/Postman. This slice adds an Owner-only React screen that consumes them, plus a reusable `RoleGuard` primitive in `packages/ui-kit/`.

## Problem

Wave 1.6 shipped EU 1169/2011 label rendering (`POST /recipes/:id/print`) and a `LabelPreview` component. Per Article 9 the labels need 6+ mandatory fields (business name, contact, postal address, page size, optional brand mark, printer config). The endpoints exist (`GET /organizations/:id/label-fields` reads, `PUT` writes — Owner-only) but no UI consumes them. Operators today register their org's label config by hand-crafting the JSON body and POSTing via curl, which is unreasonable for a kitchen-tablet target audience.

The Wave 1.6 retro filed `m2-labels-print-config-ui` explicitly as the Owner UI follow-up. Three other gaps surfaced alongside:

- No Owner-only "settings" screen anywhere in `apps/web/` — `OwnerDashboardScreen` is operations-only (menu ranking).
- No frontend role-gate primitive — server returns 403, but the UI has no consistent way to hide Owner-only navigation/sections from non-Owners before the call.
- The label-fields form has 6 sections of distinct shape (text, address object, contact object, enum, URL, polymorphic adapter config). Without a UI scaffold this is fiddly to compose ad-hoc per call site.

This slice closes the UI gap with the narrowest viable scope.

## Goals

1. **`packages/ui-kit/src/components/RoleGuard/`** — small wrapper component (`<RoleGuard role="OWNER">…</RoleGuard>`) that conditionally renders children based on a passed `currentRole` prop. Reusable for any future Owner-only UI section. Defence-in-depth alongside the existing server-side `@Roles('OWNER')` guard — never the only line of defence.
2. **`packages/ui-kit/src/components/LabelFieldsForm/`** — presentational form component that takes the `LabelFieldsResponseDto` shape, renders sections for businessName / contactInfo / postalAddress / brandMarkUrl / pageSize / printAdapter, surfaces validation feedback inline, and calls a passed `onSave(dto)` mutation. Read-only when `disabled=true`.
3. **`apps/web/src/screens/OwnerOrgSettingsScreen.tsx`** — new top-level screen wiring the form against TanStack Query (`useOrgLabelFieldsQuery` + `useOrgLabelFieldsMutation`). Mounted at route `/owner-settings`. Wrapped in `<RoleGuard role="OWNER">`.
4. **`apps/web/src/hooks/useOrgLabelFields.ts`** — TanStack hooks for GET (cached, staleTime 5min) + PUT (with optimistic-update + invalidation). Mirrors the pattern of `useDietFlags`/`useLabelPrint` from prior waves.
5. **Form validation parity** — client-side zod schema duplicates the apps/api `class-validator` constraints (string length caps, email format, URL format, enum membership). Backend remains authoritative; client validation is for ergonomics + early feedback.
6. **Role gating discipline** — frontend role gate is a UX concern (hide nav links + render guard); server `@Roles('OWNER')` stays the authoritative gate. Documented in the screen's docstring so a future contributor doesn't drop the server check.

## Non-goals

- **Test-connection endpoint** — `POST /organizations/:id/label-fields/test` to probe the IPP printer is filed as `m2-labels-print-test-endpoint` for a follow-up. Adds backend complexity (TCP probe / dummy print job); not blocking for the form UI.
- **Adapter registry endpoint** — `GET /print-adapters` exposing the supported adapter ids + their JSON schemas would let the form generate adapter-specific fields dynamically. Today only `IppPrintAdapter` exists; hardcoded IPP fields are simpler. Filed as `m2-labels-print-adapter-registry-endpoint`.
- **Brand-mark file upload** — Operators paste a URL today; an upload endpoint with `Org.brandMarkUrl` storage in S3-compatible bucket is filed as `m2-labels-brand-mark-upload`. Not blocking.
- **Multi-printer support** — Today one printer per org. Multi-printer (per-location, per-recipe-channel) is filed as `m2-labels-multi-printer`. The current `printerId?: string` field on `POST /recipes/:id/print` is forward-compat noise.
- **`printAdapter.config` discriminated union (apps/api side)** — Wave 1.6 retro flagged tightening from `Record<string, unknown>` to a union once a 2nd adapter ships. We match that recommendation: stay loose until Phomemo or the next adapter lands.
- **i18n of form labels** — apps/web does not currently consume `@nexandro/ui-kit` translations; form labels render in Spanish per the Wave 1.6 default locale. i18n consolidation is M3 scope.
- **Audit emission** — `PUT /organizations/:id/label-fields` already carries `@AuditAggregate('organization')` from Wave 1.13 [3a], so an Owner save lands in `audit_log` automatically when called via agent flow. Direct REST (browser session) does not emit; the request-anchored attribution row would have to come from a future agent integration. Out of scope here.

## What changes (high level)

**`packages/ui-kit/`** (NEW components + types):

- `components/RoleGuard/RoleGuard.tsx` — `function RoleGuard({ role, currentRole, fallback?, children })`. Returns `children` when `currentRole === role` (or matches; supports array). Otherwise renders `fallback` (default `null`).
- `components/RoleGuard/RoleGuard.types.ts` — `UserRole = 'OWNER' | 'MANAGER' | 'STAFF'` type alias.
- `components/RoleGuard/RoleGuard.test.tsx` — 3 vitest tests (matching role renders children; non-matching renders fallback; array role match).
- `components/RoleGuard/RoleGuard.stories.tsx` — 2 stories (Owner-only block visible/hidden).
- `components/RoleGuard/index.ts` — barrel.
- `components/LabelFieldsForm/LabelFieldsForm.tsx` — controlled form component. Sections in order: businessName, contactInfo (email + phone), postalAddress (street/city/postalCode/country), brandMarkUrl, pageSize (radio: a4 / thermal-4x6 / thermal-50x80), printAdapter (id select with one option `ipp` + nested config: url/queue/apiKey/timeoutMs). `onSubmit(values)` callback. Inline error messages from a passed `errors` map.
- `components/LabelFieldsForm/LabelFieldsForm.types.ts` — `LabelFieldsFormValues` (matches `LabelFieldsResponseDto` minus `organizationId`); `LabelFieldsFormProps` with `initialValues`, `onSubmit`, `submitting`, `errors`, `disabled`.
- `components/LabelFieldsForm/LabelFieldsForm.test.tsx` — 6+ vitest tests (renders empty / renders with initialValues / submits sanitized DTO / surfaces inline errors / disabled state / pageSize radio change).
- `components/LabelFieldsForm/LabelFieldsForm.stories.tsx` — 4 stories (Empty, Filled, Submitting, WithErrors).
- `components/LabelFieldsForm/index.ts` — barrel.
- `src/index.ts` — append `RoleGuard` + `LabelFieldsForm` exports.

**`apps/web/`** (NEW hook + screen + route):

- `src/hooks/useOrgLabelFields.ts` — exports `useOrgLabelFieldsQuery(orgId)` (TanStack `useQuery` calling `GET /organizations/:id/label-fields`) and `useOrgLabelFieldsMutation(orgId)` (TanStack `useMutation` calling `PUT`, invalidating the query on success).
- `src/api/orgLabelFields.ts` — fetch helpers (typed) for both calls.
- `src/screens/OwnerOrgSettingsScreen.tsx` — composes the screen: `<RoleGuard role="OWNER">` + `<LabelFieldsForm initialValues={query.data} onSubmit={mutate} submitting={mutation.isPending} errors={parsedApiErrors} />`. Toast on save success.
- `src/screens/OwnerOrgSettingsScreen.test.tsx` — 3 vitest tests (Owner sees form; non-Owner sees access-denied fallback; submit calls mutation).
- `src/main.tsx` — register route `/owner-settings`.
- `src/App.tsx` — add `<Link to="/owner-settings">` to the nav (visible only when `currentRole === 'OWNER'`).
- `src/lib/currentUser.ts` (NEW or extended) — exposes `currentRole` from session/auth context. Today the demo app has `VITE_DEMO_ORG_ID` env; we'll add `VITE_DEMO_USER_ROLE` defaulting to `OWNER` so the demo flow shows the screen.

**Tests + Storybook:**

- ui-kit vitest: 3 RoleGuard + 6+ LabelFieldsForm = 9+ new (current 166 → 175+).
- apps/web vitest: 3 OwnerOrgSettingsScreen = 3 new.
- Storybook: +6 stories (2 RoleGuard + 4 LabelFieldsForm).
- No backend changes → no apps/api unit / INT delta.

## Acceptance

1. `<RoleGuard role="OWNER" currentRole="OWNER">…</RoleGuard>` renders children; `<RoleGuard role="OWNER" currentRole="MANAGER">…</RoleGuard>` renders fallback (default `null`). Array form `role={['OWNER', 'MANAGER']}` matches both.
2. `<LabelFieldsForm initialValues={existingDto} onSubmit={fn} />` renders all 6 sections. Submitting calls `fn(currentValues)` with the form's current values shaped as `LabelFieldsFormValues`.
3. Visiting `/owner-settings` as a logged-in OWNER:
   - Fetches the current label-fields via `GET /organizations/:id/label-fields`.
   - Renders `<LabelFieldsForm initialValues={data}>` populated.
   - Saving calls `PUT /organizations/:id/label-fields` with the diff'd shape, invalidates the query, shows a toast.
4. Visiting `/owner-settings` as MANAGER or STAFF: the `RoleGuard` renders an access-denied message; no fetch fires (the guard short-circuits before the hook mounts).
5. Server-side `@Roles('OWNER')` guard remains in place; the frontend role gate is documented as defence-in-depth.
6. apps/web build + lint clean. ui-kit tests + apps/web tests green. Storybook builds.

## Risk + mitigation

- **Risk: client-side validation drift from apps/api `class-validator` constraints.** Mitigation: zod schema in the form component documents the constraints inline with the apps/api source as the authoritative reference. Periodic sync is a manual chore until codegen lands (`m2-codegen-api-types` filed in Wave 1.6 retro).
- **Risk: `<RoleGuard>` becomes a security primitive operators rely on instead of the server check.** Mitigation: the component's docstring explicitly says "UX-only; the server `@Roles` decorator is the authoritative gate". The screen-level test asserts the server 403 is also handled (renders error if the server rejects despite the guard).
- **Risk: `printAdapter.config` evolution breaks the form when a 2nd adapter ships.** Mitigation: the form hard-codes the IPP fields today; the `printAdapter.id` select has only one option (`ipp`). Adding a 2nd adapter will require expanding the select + branching the config sub-form; that is the appropriate slice scope when it happens, not premature abstraction now.
- **Risk: `VITE_DEMO_USER_ROLE` env var becomes load-bearing for demos.** Mitigation: documented as demo-only in `apps/web/.env.example`. The real role-source-of-truth in production is the JWT subject's `role` claim (already in place server-side); apps/web wires that claim in M3 when the auth flow lands.

## Open questions

None at the time of writing — Gate D picks resolved all forks (slice scope, adapter typing strategy, screen location, role-gating pattern).

## Related slices + threads

- Wave 1.6 `m2-labels-rendering` (Squash `0062771`) — ships the backend endpoints + `LabelPreview` ui-kit component this slice consumes.
- Wave 1.13 [3a] `m2-mcp-write-capabilities` (Squash `9020550`) — `@AuditAggregate('organization')` on the PUT endpoint.
- Wave 1.14 `m2-audit-log-forensic-split` (Squash `339b039`) — agent-flagged saves emit `AGENT_ACTION_FORENSIC` (informational; this slice is direct-REST so does not exercise that path).

## Filed follow-ups for adjacent capabilities

- `m2-labels-print-test-endpoint` — `POST /organizations/:id/label-fields/test` to probe IPP reachability + return typed status. Triggers a "Test connection" button in the form.
- `m2-labels-print-adapter-registry-endpoint` — `GET /print-adapters` exposing registered adapter ids + JSON schemas. Drives a dynamic config sub-form.
- `m2-labels-brand-mark-upload` — file upload to a storage bucket; replaces the URL paste.
- `m2-labels-multi-printer` — per-location / per-channel printer routing.
- `m2-codegen-api-types` — generate apps/web TS types from apps/api DTOs; eliminates manual zod-vs-class-validator drift.
- `m2-i18n-ui-kit` — i18n consolidation for ui-kit form labels; today renders Spanish.
