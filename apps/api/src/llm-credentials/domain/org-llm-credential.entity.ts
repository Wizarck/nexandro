import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Sprint 4 W2-1a — m4-byo-llm-provider-key. Per-org row holding the
 * AES-256-GCM-encrypted API key for the configured LLM provider plus the
 * most recent connectivity-test outcome.
 *
 * One row per organization (UNIQUE on `organization_id`). Replacement is
 * upsert; deletion is hard. The cleartext API key is NEVER stored — it
 * lives only in transit through `EncryptionService` and never on this row.
 */
export type LlmProvider = 'openai' | 'anthropic' | 'mistral';
export const LLM_PROVIDERS: LlmProvider[] = ['openai', 'anthropic', 'mistral'];

export type LlmTestResult = 'success' | 'failure';

@Entity({ name: 'org_llm_credentials' })
@Index('ix_org_llm_credentials_organization_id', ['organizationId'])
export class OrgLlmCredential {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid', unique: true })
  organizationId!: string;

  @Column({ type: 'varchar', length: 32 })
  provider!: LlmProvider;

  /**
   * Base64 of `nonce || ciphertext || tag` produced by
   * `EncryptionService.encrypt()`. NEVER exposed via the REST surface;
   * decryption happens only inside `LlmCredentialsService.test()` to fire
   * the provider ping.
   */
  @Column({ name: 'encrypted_api_key', type: 'text' })
  encryptedApiKey!: string;

  @Column({ name: 'last_tested_at', type: 'timestamptz', nullable: true })
  lastTestedAt!: Date | null;

  @Column({ name: 'last_test_result', type: 'varchar', length: 32, nullable: true })
  lastTestResult!: LlmTestResult | null;

  @Column({ name: 'last_test_error', type: 'text', nullable: true })
  lastTestError!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
