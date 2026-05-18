import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 2 P4 — GDPR legal core (Phase D, feat/sprint2-p4-gdpr-legal-core).
 *
 * Adds 3 columns to `organizations` that back the Privacidad surface in
 * `apps/web/src/screens/settings/OwnerPrivacySection.tsx`:
 *
 *  - `deletion_scheduled_at timestamptz NULL` — Art. 17 right-to-erasure
 *    with 30-day grace. NULL = active org; non-NULL = scheduled. The
 *    nightly real-deletion job (out of scope this PR) will scan for rows
 *    where `deletion_scheduled_at <= NOW()` and perform the physical
 *    delete. The Privacidad UI reads this column to render the paprika
 *    countdown banner + the "Cancelar eliminación" CTA.
 *
 *  - `retention_policy jsonb NOT NULL DEFAULT '{...}'::jsonb` — per-org
 *    overrides for the 3 retention windows surfaced in the Privacidad
 *    section:
 *      * `audit_log_days` — default 2555 (7 years, regulatory floor for
 *        EU 178/2002 + national fiscal). Cap 3650 (10y).
 *      * `photos_days` — default 90 (matches the photo-storage cron
 *        soft-then-hard delete window). Range 30..730.
 *      * `m3_review_queue_days` — default 365 (operator review aging).
 *    Range/cap enforcement lives at the controller DTO layer. The
 *    archival/eviction crons stay on their existing defaults today; the
 *    column is read by future jobs that respect per-org overrides.
 *
 *  - `dpo_contact jsonb NULL` — Data Protection Officer contact captured
 *    for export bundles + AEPD breach notifications. Shape:
 *    `{ name, email, phone }`. Nullable because most SMBs in scope
 *    (< 250 employees) are not legally required to appoint a DPO; the
 *    field stays empty until the Owner fills it.
 *
 * Idempotent on re-run via `ADD COLUMN IF NOT EXISTS`. The DEFAULT JSONB
 * literal for `retention_policy` is applied to existing rows by Postgres
 * on the ADD COLUMN — no separate UPDATE needed.
 *
 * Down: drops the columns in reverse order so a failed up() leaves no
 * partial state.
 */
export class OrganizationGdprColumns1700000043000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('organizations');
    if (!exists) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "organizations"
        ADD COLUMN IF NOT EXISTS "deletion_scheduled_at" timestamptz NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "organizations"
        ADD COLUMN IF NOT EXISTS "retention_policy" jsonb NOT NULL
          DEFAULT '{"audit_log_days":2555,"photos_days":90,"m3_review_queue_days":365}'::jsonb;
    `);

    await queryRunner.query(`
      ALTER TABLE "organizations"
        ADD COLUMN IF NOT EXISTS "dpo_contact" jsonb NULL;
    `);

    // Partial index keyed on `deletion_scheduled_at IS NOT NULL` so the
    // nightly real-deletion job's scan stays O(scheduled rows) instead of
    // O(total orgs). Tiny in practice — only orgs in the grace window
    // populate this index.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_organizations_deletion_scheduled"
        ON "organizations" ("deletion_scheduled_at")
        WHERE "deletion_scheduled_at" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('organizations');
    if (!exists) {
      return;
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_organizations_deletion_scheduled";`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "dpo_contact";`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "retention_policy";`);
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN IF EXISTS "deletion_scheduled_at";`,
    );
  }
}
