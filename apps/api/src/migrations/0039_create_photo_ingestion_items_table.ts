import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.8 — m3-photo-ingest-backend (slice #17a): photo_ingestion_items
 * table + 2 indexes per ADR-031.
 *
 * Operational projection of one HITL ingestion item per ADR-034. The
 * regulator-facing record lives on `audit_log` as `PHOTO_INGESTION_*`
 * envelopes with `retention_class='regulatory'`. Both carry the same
 * `llm_extraction` + `operator_correction` JSONB payloads by construction
 * (the envelope is emitted at each status transition with the row state at
 * that moment).
 *
 * Per j12 §Decisions:
 *  - BOTH llmExtraction + operatorCorrection are stored — forensic
 *    foundation for prompt tuning + EU AI Act forensic compliance.
 *  - Bands are derived at write time per ADR-034 and pinned via the
 *    `status` enum. Code-level constants in
 *    `apps/api/src/photo-ingestion/domain/constants.ts` — operators MUST
 *    NOT lower or raise the band.
 *
 * Schema notes:
 *  - `overall_confidence` is `numeric(4,3)` — `0.85` round-trips losslessly.
 *  - `status` is a CHECK-constrained text (NOT a DB enum) so adding
 *    states in M3.x lands without a migration.
 *  - `signed_at` + `signed_by_user_id` populate only at status='signed'.
 *  - `deleted_at` reserved for operator hide-from-queue (rejected rows).
 *
 * Indexes (per ADR-031):
 *  - `idx_photo_ingestion_items_org_status_created` — drives the HITL queue
 *    list (`WHERE organization_id=$1 AND status=$2 ORDER BY created_at DESC`).
 *  - `idx_photo_ingestion_items_org_photo` — drives photo-anchored lookups
 *    (recall trace by photo_id + dedup probes on re-ingest).
 *
 * Slot 0039: next slot at master HEAD a95e15f. Slot 0039 was reserved by
 * `master/docs/openspec-slice-module-3.md` line 123 for this slice.
 */
export class CreatePhotoIngestionItems1700000039000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "photo_ingestion_items" (
        "id" uuid PRIMARY KEY,
        "organization_id" uuid NOT NULL,
        "photo_id" uuid NOT NULL,
        "kind" text NOT NULL,
        "status" text NOT NULL,
        "llm_extraction" jsonb NULL,
        "operator_correction" jsonb NULL,
        "overall_confidence" numeric(4, 3) NOT NULL DEFAULT 0,
        "model_version" text NOT NULL,
        "prompt_version" text NOT NULL,
        "signed_at" timestamptz NULL,
        "signed_by_user_id" uuid NULL,
        "deleted_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "photo_ingestion_items_kind_check"
          CHECK ("kind" IN ('invoice', 'product')),
        CONSTRAINT "photo_ingestion_items_status_check"
          CHECK ("status" IN (
            'pending_extraction',
            'auto_filled',
            'awaiting_review',
            'rejected',
            'signed',
            'expired'
          )),
        CONSTRAINT "photo_ingestion_items_overall_confidence_range_check"
          CHECK ("overall_confidence" >= 0 AND "overall_confidence" <= 1),
        CONSTRAINT "fk_photo_ingestion_items_org"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id"),
        CONSTRAINT "fk_photo_ingestion_items_photo"
          FOREIGN KEY ("photo_id") REFERENCES "photos"("id")
      );
    `);

    // Index 1: HITL queue list. `(org, status, created DESC)` supports
    // status-filtered pagination + the j12 "Review queue" surface.
    await queryRunner.query(`
      CREATE INDEX "idx_photo_ingestion_items_org_status_created"
        ON "photo_ingestion_items"
        ("organization_id", "status", "created_at" DESC);
    `);

    // Index 2: photo-anchored lookup. Supports dedup probes (re-ingest
    // for the same photo) + future recall trace by photo_id.
    await queryRunner.query(`
      CREATE INDEX "idx_photo_ingestion_items_org_photo"
        ON "photo_ingestion_items"
        ("organization_id", "photo_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_photo_ingestion_items_org_photo";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_photo_ingestion_items_org_status_created";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "photo_ingestion_items";`);
  }
}
