# Tasks: m2-audit-log-ui

> Wave 1.19. 4 stages, single PR. Slice #4 of 4.

## Stage 1 — ui-kit components

- [ ] `packages/ui-kit/src/components/AuditLogTable/AuditLogTable.types.ts` — `AuditLogRow`, `AuditLogTableProps`.
- [ ] `packages/ui-kit/src/components/AuditLogTable/AuditLogTable.tsx` — 6-column presentational table; empty/loading/expanded states.
- [ ] `packages/ui-kit/src/components/AuditLogTable/AuditLogTable.test.tsx` — 5 vitest tests.
- [ ] `packages/ui-kit/src/components/AuditLogTable/AuditLogTable.stories.tsx` — 4 stories.
- [ ] `packages/ui-kit/src/components/AuditLogTable/index.ts`.
- [ ] `packages/ui-kit/src/components/AuditLogRowDetail/AuditLogRowDetail.tsx` + types + test + stories + index.
- [ ] `packages/ui-kit/src/components/AuditLogFilters/AuditLogFilters.tsx` + types + test + stories + index.
- [ ] `packages/ui-kit/src/index.ts` — export the 3 new components + types.

## Stage 2 — apps/web hook + API helpers + debounce util

- [ ] `apps/web/src/hooks/useDebouncedValue.ts` (NEW small util).
- [ ] `apps/web/src/api/auditLog.ts` — `getAuditLog(filter)` + `buildExportUrl(filter)`.
- [ ] `apps/web/src/hooks/useAuditLog.ts` — `useAuditLogQuery(filter)` with debounced FTS.

## Stage 3 — apps/web screen + route + nav

- [ ] `apps/web/src/screens/AuditLogScreen.tsx` — composes RoleGuard + Filters + Table + RowDetail + Load-more + ExportCsv. Form state vs applied state separation per design SD3.
- [ ] `apps/web/src/screens/AuditLogScreen.test.tsx` — 5 vitest tests.
- [ ] `apps/web/src/main.tsx` — register `/audit-log` route.
- [ ] `apps/web/src/App.tsx` — add nav `<Link to="/audit-log">` wrapped in `<RoleGuard role={['OWNER', 'MANAGER']}>`.

## Stage 4 — Verification + PR + Gate F (final)

- [ ] `npm run build --workspace=@nexandro/ui-kit` clean.
- [ ] `npm run build --workspace=apps/web` clean.
- [ ] `npm test --workspace=@nexandro/ui-kit` green (current 167 → ≥182, +15).
- [ ] `npm test --workspace=apps/web` green (current 4 → ≥9, +5).
- [ ] `npm run lint` clean across workspaces.
- [ ] `npm run build-storybook --workspace=@nexandro/ui-kit` clean.
- [ ] grep audit confirms no apps/api changes.
- [ ] PR `proposal(m2-audit-log-ui): Owner+Manager browse UI for audit_log (Wave 1.19)`.
- [ ] CI green; squash-merge.
- [ ] Retro `retros/m2-audit-log-ui.md` — note this closes the 4-slice batch.
- [ ] Memory updates: `project_m1_state.md` + `MEMORY.md`.
