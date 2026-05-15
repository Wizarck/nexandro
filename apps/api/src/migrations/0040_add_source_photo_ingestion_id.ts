import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 hardening H1a — m3-photo-ingest-downstream-routing: provenance columns
 * on `lots` + `goods_receipts` linking downstream aggregates back to the
 * `photo_ingestion_items` row that materialised them.
 *
 * Per ADR-SOURCE-PROVENANCE-COLUMN (design.md, this change):
 *  - Typed `uuid` column (NOT a JSONB metadata key) so we can enforce the
 *    1:1 mapping via a UNIQUE partial index.
 *  - FK → `photo_ingestion_items(id)` with `ON DELETE SET NULL` so a future
 *    hard-delete of a signed ingestion row does NOT cascade-delete the
 *    downstream aggregate (rare; soft-delete is the default).
 *  - Nullable. Pre-existing rows + non-photo-sourced creations (manual GR,
 *    GR-confirmation-materialised Lot) carry `NULL`.
 *
 * Per ADR-DOWNSTREAM-ROUTING-IDEMPOTENCY:
 *  - UNIQUE partial index `WHERE source_photo_ingestion_id IS NOT NULL` —
 *    legitimate NULL rows do NOT participate in the uniqueness constraint.
 *  - DB-level race backstop: two concurrent emits both lookup `null`, both
 *    attempt insert, second insert raises `23505` which the service catches
 *    and converts to an `alreadyRouted: true` envelope.
 *
 * Slot 0040: next free after master HEAD 5cca037 (`0039_create_photo_ingestion_items_table.ts`).
 * No row in `master/docs/openspec-slice-module-3.md` reserves this slot
 * because M3 hardening H1a is a post-M3 (22/22) slice, not part of the
 * original 22-slice plan. Slot 0040 is the next free per
 * `.ai-playbook/specs/migration-slot-reservation.md` §3.1.
 */
export class AddSourcePhotoIngestionId1700000040000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // lots — provenance column + FK + unique partial index.
    await queryRunner.query(`
      ALTER TABLE "lots"
      ADD COLUMN "source_photo_ingestion_id" uuid NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "lots"
      ADD CONSTRAINT "fk_lots_source_photo_ingestion"
      FOREIGN KEY ("source_photo_ingestion_id")
      REFERENCES "photo_ingestion_items"("id")
      ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_lots_source_photo_ingestion"
        ON "lots"("source_photo_ingestion_id")
        WHERE "source_photo_ingestion_id" IS NOT NULL;
    `);

    // goods_receipts — provenance column + FK + unique partial index.
    await queryRunner.query(`
      ALTER TABLE "goods_receipts"
      ADD COLUMN "source_photo_ingestion_id" uuid NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "goods_receipts"
      ADD CONSTRAINT "fk_goods_receipts_source_photo_ingestion"
      FOREIGN KEY ("source_photo_ingestion_id")
      REFERENCES "photo_ingestion_items"("id")
      ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_goods_receipts_source_photo_ingestion"
        ON "goods_receipts"("source_photo_ingestion_id")
        WHERE "source_photo_ingestion_id" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_goods_receipts_source_photo_ingestion";`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipts" DROP CONSTRAINT IF EXISTS "fk_goods_receipts_source_photo_ingestion";`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipts" DROP COLUMN IF EXISTS "source_photo_ingestion_id";`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_lots_source_photo_ingestion";`,
    );
    await queryRunner.query(
      `ALTER TABLE "lots" DROP CONSTRAINT IF EXISTS "fk_lots_source_photo_ingestion";`,
    );
    await queryRunner.query(
      `ALTER TABLE "lots" DROP COLUMN IF EXISTS "source_photo_ingestion_id";`,
    );
  }
}
