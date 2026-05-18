import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { LLM_PROVIDERS, LlmProvider } from '../../domain/org-llm-credential.entity';

/**
 * Sprint 4 W2-1a — m4-byo-llm-provider-key. Request body for PUT
 * /organizations/:orgId/llm-credentials. The `apiKey` lives only in
 * transit: the service encrypts it before persisting and the cleartext
 * never reaches the response envelope.
 */
export class UpsertLlmCredentialDto {
  @IsString()
  @IsIn(LLM_PROVIDERS as readonly string[])
  provider!: LlmProvider;

  /**
   * Provider-issued API key. Length bound is generous (providers issue
   * keys up to ~200 chars; 1024 leaves headroom for future formats).
   */
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  apiKey!: string;
}
