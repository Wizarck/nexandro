import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.4 — m3-photo-storage-lifecycle: photos table + 2 indexes.
 *
 * Per Gate D 2026-05-14 (slice #18): backend foundation for FR33 + ADR-037.
 * Signed-URL-mediated S3-compatible photo storage with 90-day retention on
 * `full_res_90d` rows, indefinite retention on `thumbnail_indefinite` rows,
 * and exemption for `legal_hold` rows (M3.x manual-override target).
 *
 * Schema rationale (design.md ADR-PHOTO-METADATA-TABLE):
 *
 * - `s3_key` stored explicitly (not reconstructed from `<orgId>/<id>`) so
 *   bucket migrations / object renames don't break the lookup.
 * - `byte_size integer` (not bigint) — 20MB application cap; `integer`
 *   covers 2.1GB and saves 4 bytes/row.
 * - `mime_type` text + CHECK (jpeg|png|webp|heic) — HEIC accepted per
 *   "Open Questions" answer; vision-LLM providers handle it natively.
 * - `retention_class` text + CHECK with all 3 future values declared so
 *   slice #17 (thumbnail) and M3.x (legal_hold) flow without a migration.
 * - `deleted_at` NULLABLE — Phase 1 of retention cron marks soft-delete;
 *   Phase 2 hard-deletes after 7-day grace + removes the row.
 *
 * Two indexes (ADR-PHOTO-METADATA-TABLE):
 * 1. `idx_photos_org_created` — per-org listing (slice #17 HITL queue).
 * 2. `idx_photos_retention_class_created` partial WHERE `deleted_at IS NULL`
 *    — retention cron hot path; index stays narrow as soft-deletes
 *    accumulate then drop out at hard-delete.
 *
 * NOT in this migration: per-org retention override column (deferred to
 * M3.x), thumbnail-generation pipeline (slice #17 owns).
 */
export class CreatePhotosTable1700000032000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "photos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "s3_key" text NOT NULL,
        "mime_type" text NOT NULL,
        "byte_size" integer NOT NULL,
        "uploaded_by_user_id" uuid NOT NULL,
        "retention_class" text NOT NULL,
        "deleted_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "photos_mime_type_check"
          CHECK ("mime_type" IN ('image/jpeg','image/png','image/webp','image/heic')),
        CONSTRAINT "photos_byte_size_positive"
          CHECK ("byte_size" > 0),
        CONSTRAINT "photos_retention_class_check"
          CHECK ("retention_class" IN ('full_res_90d','thumbnail_indefinite','legal_hold')),
        CONSTRAINT "fk_photos_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id"),
        CONSTRAINT "fk_photos_uploaded_by_user"
          FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id")
      );
    `);

    // Index 1: per-org listing (slice #17 HITL queue "all photos uploaded
    // in the last N days for org X"). Compound (org, created DESC) supports
    // ORDER BY DESC LIMIT N pagination.
    await queryRunner.query(`
      CREATE INDEX "idx_photos_org_created"
        ON "photos" ("organization_id", "created_at" DESC);
    `);

    // Index 2: retention-cron hot path. Partial on `deleted_at IS NULL`
    // shrinks the index as soft-deletes accumulate then drop out at
    // hard-delete (7-day grace window).
    await queryRunner.query(`
      CREATE INDEX "idx_photos_retention_class_created"
        ON "photos" ("retention_class", "created_at")
        WHERE "deleted_at" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_photos_retention_class_created";`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_photos_org_created";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "photos";`);
  }
}
