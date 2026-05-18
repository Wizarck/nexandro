import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DefaultLlmProviderProbe,
  LLM_PROVIDER_PROBE,
  LlmCredentialsService,
} from './application/llm-credentials.service';
import { OrgLlmCredential } from './domain/org-llm-credential.entity';
import { EncryptionService } from './infrastructure/encryption.service';
import { LlmCredentialsRepository } from './infrastructure/llm-credentials.repository';
import { LlmCredentialsController } from './interface/llm-credentials.controller';

/**
 * Sprint 4 W2-1a — m4-byo-llm-provider-key. Owns the `org_llm_credentials`
 * table + the Owner-only REST surface under `/organizations/:orgId/llm-credentials`.
 *
 * The `EncryptionService` reads `LLM_CREDENTIALS_ENCRYPTION_KEY` at
 * construction time; the module will fail to instantiate (and the API
 * will refuse to boot) if the env var is missing or malformed. That is
 * intentional — silent fallback to a default key would defeat the
 * encrypted-at-rest contract.
 */
@Module({
  imports: [TypeOrmModule.forFeature([OrgLlmCredential])],
  providers: [
    LlmCredentialsRepository,
    EncryptionService,
    LlmCredentialsService,
    { provide: LLM_PROVIDER_PROBE, useClass: DefaultLlmProviderProbe },
  ],
  controllers: [LlmCredentialsController],
  exports: [LlmCredentialsService, EncryptionService],
})
export class LlmCredentialsModule {}
