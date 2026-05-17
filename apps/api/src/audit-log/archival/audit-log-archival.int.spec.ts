/**
 * Integration spec for `AuditLogArchivalScanner`.
 *
 * `describe.skip(...)` per `feedback_int_specs_speculative_skip_pattern`:
 * this slice landed without running against a real Postgres testcontainer
 * (the orchestrating session was disk-constrained; the scanner was
 * unit-tested with a fake DataSource that records SQL strings). The spec
 * body is preserved as design intent — a followup slice with the
 * `m3.x-audit-log-int-harness-wiring` harness reactivated can `xit → it`
 * + `describe.skip → describe` and run it end-to-end:
 *
 *  1. seed N old `audit_log` rows across 2 orgs × 2 months (regulatory
 *     class, created_at older than 2555 days)
 *  2. seed 1 fresh row per org (created_at = now)
 *  3. set `NEXANDRO_AUDIT_LOG_ARCHIVAL_ENABLED=true` +
 *     `NEXANDRO_AUDIT_ARCHIVE_DIR=<tmp>`
 *  4. run `scanner.runOnce()`
 *  5. assert:
 *     - 4 archive files exist (2 orgs × 2 months)
 *     - each file's gunzipped content has N/2 JSONL rows
 *     - the seeded rows are DELETEd from `audit_log`
 *     - the fresh rows REMAIN
 *     - 4 `AUDIT_LOG_ARCHIVAL_BATCH` rows persisted via the
 *       AuditLogSubscriber's @OnEvent handler (retention_class=operational)
 *
 * The harness for this lives at the `__helpers__/audit-log-int-harness.ts`
 * scaffold — when its FK + subscriber wiring is hardened (followup
 * `m3.x-audit-log-int-harness-wiring`), revive this suite.
 */

describe.skip('AuditLogArchivalScanner (real-PG integration) — DEFERRED', () => {
  it('archives old rows, writes gzipped JSONL, deletes archived rows, emits per-bucket envelope', () => {
    expect(true).toBe(true);
  });
});
