# retros/m2-audit-log-export.md

> **Slice**: `m2-audit-log-export` · **PR**: [#97](https://github.com/Wizarck/nexandro/pull/97) · **Merged**: 2026-05-06 · **Squash SHA**: `87d5c91`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **Wave 1.12 — closes the audit-log sub-saga (Waves 1.9–1.12)**. Adds `GET /audit-log/export.csv` streaming RFC 4180 CSV with cursor pagination, hard cap 100K, dual-config FTS reuse, and a pre-flight count for the truncation header. The audit-log capability is now feature-complete for compliance use cases (regulator audits, GDPR Article 15 portability).

## What we shipped

**`audit-log-csv.ts` (NEW — pure CSV serialiser):**
- `escapeCsvField(value)` — RFC 4180 rules. Empty for null/undefined; wrap in `"…"` if value contains `,` / `"` / `\n` / `\r`; double internal `"`.
- `csvHeaderRow()` — fixed 14-column header.
- `csvSerialiseRow(row)` — `JSON.stringify(payload)` for jsonb columns; ISO-8601 UTC for `createdAt`; null jsonb → empty cell.
- 17 unit tests covering all escape edge cases + null handling + field order + comma/quote/newline trifecta.

**`AuditLogService` extensions:**
- `streamRows(filter, hardCap)` — async generator yielding rows in `(created_at DESC, id DESC)` order. Internally cursor-paginates in batches of `AUDIT_LOG_EXPORT_BATCH_SIZE = 1000`. Stops at exactly `hardCap` or when source exhausted, whichever first. Constant memory at any moment.
- `wouldExceedCap(filter, cap)` — pre-flight `SELECT count(*) FROM (… LIMIT cap+1) sub` so the count is bounded at cap+1 even on tables with millions of rows. Used by the controller to set `X-Audit-Log-Export-Truncated` header BEFORE the response body starts (HTTP headers can't be added mid-stream).
- New private `cursorBatch(filter, cursor, limit)` — one batch query with `WHERE (a.created_at, a.id) < (:cursorCreatedAt, :cursorId)` row comparison.
- New private `applyBaseFilters(qb, filter, since, until)` — extracted the filter-clause logic from `query()` so the same predicates power `query()`, `cursorBatch()`, AND `wouldExceedCap()`. Eliminates filter-clause drift; `query()` was simultaneously refactored to use it.
- Constant `AUDIT_LOG_EXPORT_HARD_CAP = 100_000`.

**Controller:**
- `@Get('export.csv')` on `AuditLogController`, `@Roles('OWNER', 'MANAGER')`. Reuses `AuditLogQueryDto` (limit/offset DTO-accepted but ignored at the service).
- Pre-flight: `wouldExceedCap()` to decide `X-Audit-Log-Export-Truncated: true`.
- Response: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="audit-log-YYYY-MM-DD.csv"` (UTC date-of-export, no filter exfiltration).
- Body: `Readable.from(asyncGenerator())` wrapping `csvHeaderRow()` + `csvSerialiseRow(row)` for each row from `streamRows()`. Returns `StreamableFile`.
- `AuditLogQueryError` from `wouldExceedCap` translates to HTTP 422.

**Tests:**
- 17 unit `audit-log-csv.spec.ts` (CSV serialiser).
- 12 unit added to `audit-log.service.spec.ts` (streamRows + wouldExceedCap edge cases).
- 5 unit added to `audit-log.controller.spec.ts` (exportCsv headers + RBAC + truncation + filter pass-through).
- Net: **+34 unit tests** (Wave 1.11's 654 → 688).
- INT spec `audit-log-export.int.spec.ts` (Postgres) — covers streamRows happy path + cap + ordering newest-first + FTS + cursor multi-batch (1500-row stress, asserts no duplicate ids) + wouldExceedCap boundaries (== / < / >) + CSV round-trip with comma + quote + newline payload.

## What surprised us

- **`getParameters()` vs `getQueryAndParameters()` is a real footgun.** I shipped v1 with `dataSource.query(sql, qb.getParameters())` which crashes at runtime with `QueryFailedError: Query values must be an array`. `getParameters()` returns the named-param OBJECT (`{orgId, since, …}`); `dataSource.query()` expects POSITIONAL `$1, $2, …` with an ARRAY. The fix is `qb.getQueryAndParameters()` which interpolates the SQL and returns `[sqlWithDollarPlaceholders, paramArray]`. Unit tests didn't catch it because the fake QB stubs both methods independently and `dataSource.query` is mocked. CI INT caught all 5 wouldExceedCap tests on first run. **Lesson committed for next slice that embeds a QB fragment in a raw query**: always use `getQueryAndParameters()` for the embedding, never `getQuery() + getParameters()` separately.
- **Streaming via async generator is dramatically cleaner than manual `Readable._read()`.** `Readable.from(asyncIterable)` does the back-pressure plumbing for free. The whole streaming controller is ~15 lines including imports. Compare with the manual `Readable` subclass approach which would need explicit pause/resume handling. `Readable.from` is the JS-native streaming primitive for 2026.
- **Cursor pagination is mandatory above ~10K rows.** OFFSET-based pagination would skip N rows per batch (linear cost); for a 100K export that's `(0+1000+2000+…+99000)/2 = 49.5M` row-skips total. The `(a.created_at, a.id) < (:cursorCreatedAt, :cursorId)` row comparison stays `O(log N)` per batch via the existing `ix_audit_log_aggregate` index whose leading column is `created_at`. Postgres tuple comparison is well-supported and reads naturally.
- **Pre-flight count + hard cap is the right answer for "I want a header that says truncated".** HTTP headers can't be added after the first byte; alternatives are HTTP trailers (browsers ignore) or a marker line in the CSV body (pollutes data). The 50ms count query is a small price for an exact, machine-readable signal. Documented in design.md ADR-EXP-CAP and tasks.md §3.2 SD1=a after explicitly surfacing the trade-off to the user before implementation.
- **Refactoring `query()` to share `applyBaseFilters` paid off immediately.** The Wave 1.11 FTS clause now lives in ONE place; `cursorBatch` and `wouldExceedCap` get FTS support for free. Without that refactor, this slice would have triplicated the dual-config WHERE clause across three call sites.

## Patterns reinforced or discovered

- **`AsyncGenerator + Readable.from` for HTTP streaming.** When an endpoint produces an unbounded sequence of rows + serialisation, model it as `async function* () { yield header; for await (row of svc.streamRows()) yield serialise(row) + '\n'; }` and wrap with `Readable.from()`. Constant memory, native back-pressure, trivial cancellation propagation.
- **Pre-flight count for response-header signals.** When the header decision depends on whether the result set exceeds a cap, do a `LIMIT cap+1` count BEFORE starting the body. Cheap, exact, header-friendly. Better than streaming-then-hoping-the-trailer-arrives.
- **`getQueryAndParameters()` for embedding QB fragments in raw SQL.** Anti-pattern: `dataSource.query(\`… (${qb.getQuery()}) …\`, qb.getParameters())`. Correct: `const [sql, params] = qb.getQueryAndParameters(); dataSource.query(\`… (${sql}) …\`, params)`. The named-vs-positional translation happens via TypeORM's helper, not silently.
- **Shared filter helper inside a service.** When multiple read methods (`query`, `cursorBatch`, `wouldExceedCap`, future export endpoints) need identical filter predicates, extract a `private applyBaseFilters(qb, filter, …)` helper. Each caller adds its own ordering / pagination / aggregation on top of the shared base. Single source of truth for filter semantics.
- **Tuple row comparison `(a, b) < (x, y)` for cursor pagination.** Postgres-native, ergonomic, planner-friendly when the index leading columns match. No need for the awkward `(a.created_at < :x OR (a.created_at = :x AND a.id < :y))` rewrite that older databases require.
- **Reusing the existing query DTO for export endpoints.** `AuditLogQueryDto.limit/offset` are accepted-but-ignored on the export path — paid in DTO-doc clarity but saved a separate `AuditLogExportQueryDto` and keeps the wire surface narrow. Note this in the controller summary so future readers don't wonder why limit/offset arrive but don't matter.
- **CSV is locale-agnostic, UTC + ISO-8601.** `created_at` always serialises as `YYYY-MM-DDTHH:mm:ss.sssZ`. Filename always UTC date. No locale ambiguity for compliance dumps.

## Things to file as follow-ups

- **`m2-audit-log-export-async`** — `POST /audit-log/exports` → `job_id`, then `GET /audit-log/exports/:id` → file. For hour-scale exports where streaming a single HTTP response isn't viable. Trigger: customer requests > 100K row dumps regularly.
- **`m2-audit-log-export-multi-format`** — JSONL / Parquet / NDJSON formats alongside CSV. Trigger: data-engineering customer who wants to ingest into a column store directly.
- **`m2-audit-log-export-columns`** — `?columns=foo,bar` configurability. Trigger: legal team asks for redacted exports (no `actorUserId`, no `payloadBefore`).
- **`m2-audit-log-export-row-cap`** — per-row truncation when payload exceeds e.g. 32KB. Trigger: a customer ships 100KB+ payloads (Wave 1.10 retro mentioned 3–5KB typical, so this is hypothetical).
- **`m2-audit-log-export-compliance-role`** — separate `audit_export` capability flag. Trigger: enterprise customer with strict separation between "operational read" and "compliance dump" duties.
- **`m2-audit-log-export-rate-limit`** — per-org rate limit at the WAF or app layer. Trigger: abuse pattern in PROD logs.

## Process notes

- Gate D had **7 forks** (F1–F7) + **1 sub-fork** (SD1, surfaced after writing tasks.md to confirm the truncation header strategy). User approved all 7 + SD1 with the "all your recommendations" pattern. **No mid-flight pivots** — design held.
- Implementation iteration: v1 (commit `d6dc09d`) shipped the full slice; CI INT failed all 5 `wouldExceedCap` tests with the `getParameters()` footgun. v2 (`12b5dbe`) one-line fix to `getQueryAndParameters()` + test infra parity stub. CI green on v2. Build / Lint / Test / Storybook / Gitleaks / CodeRabbit all passed on every iteration.
- 654 → 688 jest green (+34 tests). Tasks.md promised "≥10 net new unit tests"; hit ~3.4× that.
- Build clean. Lint clean. CodeRabbit reviewed cleanly.
- Squash-merged at `87d5c91`. Local branch deletion blocked by active worktree (warning, non-fatal).
- Zero schema changes — no migration. Zero entity changes. Zero new modules. Pure controller + service + helper additions on top of existing infrastructure.
- This closes the audit-log sub-saga (Waves 1.9 audit_log → 1.10 cost-history-merge → 1.11 FTS → 1.12 export). The capability is feature-complete for the use cases identified in the M2 PRD: cross-BC drilling, FTS, compliance dumps. Next backlog item: `m2-mcp-extras` (write capabilities + AgentChatWidget UI + dual-mode CI matrix) or M3 PRD.
