import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 4 W2-1a — m4-byo-llm-provider-key: per-org Bring-Your-Own LLM
 * provider API key registry. Holds the AES-256-GCM-encrypted API key plus
 * the most recent connectivity-test outcome so the Owner Settings UI can
 * surface "key configured / last tested at / last result" without ever
 * sending the cleartext back to the browser.
 *
 * Per design lock: one row per organization (no per-user / per-location
 * fan-out — Owner-only surface). Replacement is upsert; deletion is hard
 * (the table is configuration, not historical audit — audit emission for
 * key changes lives on `audit_log` via the standard interceptor).
 *
 * Schema notes:
 *  - `organization_id uuid UNIQUE` enforces the one-row-per-org invariant
 *    at the DB layer; the application also guards via upsert semantics.
 *  - `provider` constrained to the three providers supported in Sprint 4
 *    Wave 2 (`openai`, `anthropic`, `mistral`). Extending the list is a
 *    follow-up migration + CHECK update.
 *  - `encrypted_api_key text NOT NULL` stores base64 of
 *    `nonce || ciphertext || tag` produced by `EncryptionService.encrypt()`.
 *  - `last_tested_at` + `last_test_result` + `last_test_error` capture the
 *    most recent provider ping issued via POST /:orgId/llm-credentials/test.
 *
 * Down: reversible — drops the index then the table (FK to organizations
 * already disallows orphan rows so no cascade cleanup is needed).
 */
export class OrgLlmCredentials1700000044000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "org_llm_credentials" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id"     uuid        NOT NULL UNIQUE
                                          REFERENCES "organizations"("id")
                                          ON DELETE CASCADE,
        "provider"            varchar(32) NOT NULL,
        "encrypted_api_key"   text        NOT NULL,
        "last_tested_at"      timestamptz NULL,
        "last_test_result"    varchar(32) NULL,
        "last_test_error"     text        NULL,
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        "updated_at"          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "org_llm_credentials_provider_check"
          CHECK ("provider" IN ('openai', 'anthropic', 'mistral'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_org_llm_credentials_organization_id"
      ON "org_llm_credentials" ("organization_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_org_llm_credentials_organization_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "org_llm_credentials"`);
  }
}
