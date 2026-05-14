## 1. Openspec docs (this commit)

- [x] 1.1 `openspec/changes/m3-ccp-reading-aggregate/.openspec.yaml`
- [x] 1.2 `openspec/changes/m3-ccp-reading-aggregate/proposal.md`
- [x] 1.3 `openspec/changes/m3-ccp-reading-aggregate/design.md`
- [x] 1.4 `openspec/changes/m3-ccp-reading-aggregate/specs/haccp/spec.md`
- [x] 1.5 `openspec/changes/m3-ccp-reading-aggregate/tasks.md`

## 2. HACCP BC scaffold

- [ ] 2.1 `apps/api/src/haccp/haccp.module.ts` — wire entities + services + controllers + AuditLogModule import
- [ ] 2.2 `apps/api/src/haccp/types.ts` — inline types (CcpInputType, CcpDefinition, RecordReadingInput, etc.)
- [ ] 2.3 `apps/api/src/haccp/domain/errors.ts` — OutOfSpecRequiresCorrectiveActionError, CcpNotInFsmsStandardError, FsmsStandardNotFoundError, FsmsStandardConflictError
- [ ] 2.4 `apps/api/src/haccp/domain/events.ts` — channel constants + payload type aliases

## 3. Domain entities

- [ ] 3.1 `apps/api/src/haccp/domain/ccp-reading.entity.ts` — CcpReading TypeORM entity (tenant-scoped + soft-delete + numeric transformer)
- [ ] 3.2 `apps/api/src/haccp/domain/corrective-action.entity.ts` — CorrectiveAction entity
- [ ] 3.3 `apps/api/src/haccp/domain/fsms-standard.entity.ts` — FsmsStandard entity (jsonb ccpDefinitions)

## 4. Migrations

- [ ] 4.1 `apps/api/src/migrations/0034_create_haccp_records_and_corrective_actions_tables.ts` — class `CreateHaccpRecordsAndCorrectiveActionsTables1700000034000`, creates `haccp_corrective_actions` first then `haccp_ccp_readings` + 3 indexes + CHECK constraint
- [ ] 4.2 `apps/api/src/migrations/0037_create_fsms_standards_table.ts` — class `CreateFsmsStandardsTable1700000037000`, creates `fsms_standards` + index + ALTER TABLE to add FK from `haccp_ccp_readings.fsms_standard_id`

## 5. Services + queries

- [ ] 5.1 `apps/api/src/haccp/application/ccp-reading.service.ts` — recordReading + inSpec branching + out-of-spec gate + version pinning
- [ ] 5.2 `apps/api/src/haccp/application/corrective-action.service.ts` — recordCorrectiveAction (predefined + ad-hoc)
- [ ] 5.3 `apps/api/src/haccp/application/fsms-standard.service.ts` — configureFsmsStandards + getActiveStandard + listVersions
- [ ] 5.4 `apps/api/src/haccp/application/recent-readings.query.ts` — recentReadings(orgId, ccpId, limit=5)
- [ ] 5.5 `apps/api/src/haccp/application/out-of-spec-without-action.query.ts` — lastOutOfSpecUnresolved(orgId, ccpId)

## 6. Controllers + DTOs

- [ ] 6.1 `apps/api/src/haccp/interface/dto/record-reading.dto.ts` — class-validator DTO for POST /m3/haccp/readings
- [ ] 6.2 `apps/api/src/haccp/interface/dto/record-corrective-action.dto.ts`
- [ ] 6.3 `apps/api/src/haccp/interface/dto/configure-fsms-standard.dto.ts`
- [ ] 6.4 `apps/api/src/haccp/interface/dto/list-readings-query.dto.ts`
- [ ] 6.5 `apps/api/src/haccp/interface/dto/list-corrective-actions-query.dto.ts`
- [ ] 6.6 `apps/api/src/haccp/interface/ccp-reading.controller.ts` — POST /m3/haccp/readings + GET /m3/haccp/readings + GET /m3/haccp/ccps/:ccpId/last-out-of-spec-unresolved
- [ ] 6.7 `apps/api/src/haccp/interface/corrective-action.controller.ts` — POST + GET /m3/haccp/corrective-actions
- [ ] 6.8 `apps/api/src/haccp/interface/fsms-standard.controller.ts` — POST + PUT + GET /m3/haccp/fsms-standards (Owner-only)

## 7. Audit-log integration

- [ ] 7.1 `apps/api/src/audit-log/application/types.ts` — extend `AuditEventType` with 3 entries: CCP_READING_RECORDED, CCP_CORRECTIVE_ACTION_RECORDED, FSMS_STANDARD_CONFIGURED
- [ ] 7.2 Same file: extend `AuditEventTypeName` with the 3 channel-name mappings
- [ ] 7.3 Same file: extend `RETENTION_BY_EVENT_NAME` with the 3 entries (all `'regulatory'`)
- [ ] 7.4 `apps/api/src/audit-log/application/audit-log.subscriber.ts` — add 3 `@OnEvent` handlers (envelope-shaped via `persistEnvelope`)

## 8. App-module wiring

- [ ] 8.1 `apps/api/src/app.module.ts` — replace the `// HaccpModule, // M3 — HACCP / APPCC (slices #9-10)` comment with the actual import + module entry

## 9. MCP capabilities

- [ ] 9.1 `packages/mcp-server-opentrattos/src/capabilities/write/haccp.ts` — HACCP_WRITE_CAPABILITIES array with 3 entries: haccp.record-ccp-reading, haccp.record-corrective-action, haccp.configure-fsms-standards
- [ ] 9.2 `packages/mcp-server-opentrattos/src/capabilities/write/index.ts` — spread HACCP_WRITE_CAPABILITIES + add to namespace barrel
- [ ] 9.3 `packages/mcp-server-opentrattos/src/capabilities/write/index.spec.ts` — bump count to 48, add `haccp` namespace to expected set (size 14)
- [ ] 9.4 `packages/mcp-server-opentrattos/test/smoke.spec.ts` — bump count to 55

## 10. Unit tests

- [ ] 10.1 `apps/api/src/haccp/application/ccp-reading.service.spec.ts` — in-spec + out-of-spec + corrective gate + version pinning + multi-tenant
- [ ] 10.2 `apps/api/src/haccp/application/corrective-action.service.spec.ts` — predefined + ad-hoc + multi-tenant
- [ ] 10.3 `apps/api/src/haccp/application/fsms-standard.service.spec.ts` — active-window resolution + termination + listVersions
- [ ] 10.4 `apps/api/src/haccp/application/recent-readings.query.spec.ts` — order + limit + tenant
- [ ] 10.5 `apps/api/src/haccp/application/out-of-spec-without-action.query.spec.ts` — probe semantics + multi-tenant
- [ ] 10.6 `apps/api/src/haccp/interface/ccp-reading.controller.spec.ts` — RBAC metadata + cross-org rejection + DTO validation

## 11. Lint / typecheck (CI handles)

- [ ] 11.1 CI: `pnpm -w lint` clean for all new files
- [ ] 11.2 CI: `pnpm -w typecheck` clean (no `tsc` locally per past-session burn)
- [ ] 11.3 CI: `pnpm -w test` clean for the new specs + the smoke spec

## Deferred (out of scope for this slice)

- INT tests against testcontainers Postgres: real migrations, DB CHECK constraint behaviour, FK cascade on FSMS standard delete (which is forbidden — termination only), concurrent FSMS-swap race, audit envelope persistence end-to-end. Tracked as future slice `m3.x-haccp-int-tests`.
- Performance benchmarking: `recentReadings` against 1M-row synthetic dataset. Should fit a single index seek; deferred until pilot-2 data volume is observed.
- Pagination + archival on `haccp_corrective_actions` (predefined picker pollution). Deferred to M3.x.
- The j10 UI (slice #10 sibling parallel owns ui-kit components + screen + apps/web/src/api/haccp.ts).
- HEAD_CHEF custom role at the IAM layer (PRD-M3 §RBAC). For this slice MANAGER carries Carmen's permission set; agent surface (Hermes-via-Mikel) propagates the user context.
- FSMS standard schema validator (Zod or JSON Schema) — current shape is type-only. Hardened validation deferred.
- Per-shift / per-day rollup aggregations.
- IoT probe ingestion (out per PRD-M3 §"Out of Scope").
