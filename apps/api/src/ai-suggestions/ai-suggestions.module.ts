import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { AuditResolverRegistry } from '../shared/application/audit-resolver-registry';
import { SharedModule } from '../shared/shared.module';
import { AiSuggestionsService } from './application/ai-suggestions.service';
import {
  AI_SUGGESTION_PROVIDER,
  AI_YIELD_SUGGESTIONS_ENABLED,
  AiSuggestionProvider,
} from './application/types';
import { GptOssRagProvider } from './application/gpt-oss-rag.provider';
import { AiSuggestion } from './domain/ai-suggestion.entity';
import { AiSuggestionsController } from './interface/ai-suggestions.controller';

/**
 * AI yield + waste suggestions BC per Gate D (1a / 2c / 3 / 4a / 5).
 *
 * Provider wiring: `GptOssRagProvider` is registered as the default
 * `AiSuggestionProvider`. Future providers (Claude Haiku / Hermes / etc.)
 * implement the same interface and replace this binding via Nest's
 * provider override pattern.
 *
 * Feature flag: `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED` is read once at
 * module configure time. When false, the controller returns 404 on every
 * endpoint AND the service rejects every call (defence in depth).
 */
@Module({
  imports: [SharedModule, TypeOrmModule.forFeature([AiSuggestion])],
  controllers: [AiSuggestionsController],
  providers: [
    {
      provide: AI_YIELD_SUGGESTIONS_ENABLED,
      useFactory: (): boolean => isFlagEnabled(),
    },
    {
      provide: AI_SUGGESTION_PROVIDER,
      useFactory: (): AiSuggestionProvider => buildProvider(),
    },
    AiSuggestionsService,
  ],
  exports: [AiSuggestionsService],
})
export class AiSuggestionsModule implements OnApplicationBootstrap {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly registry: AuditResolverRegistry,
  ) {}

  onApplicationBootstrap(): void {
    this.registry.register('ai_suggestion', async (id) => {
      try {
        return (
          (await this.dataSource.getRepository(AiSuggestion).findOneBy({ id })) ?? null
        );
      } catch {
        return null;
      }
    });
  }
}

function isFlagEnabled(): boolean {
  return String(process.env.NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED ?? '')
    .trim()
    .toLowerCase() === 'true';
}

function buildProvider(): AiSuggestionProvider {
  const baseUrl = process.env.NEXANDRO_AI_RAG_BASE_URL ?? '';
  const apiKey = process.env.NEXANDRO_AI_RAG_API_KEY;
  const timeoutEnv = process.env.NEXANDRO_AI_RAG_TIMEOUT_MS;
  const timeoutMs = timeoutEnv ? Number(timeoutEnv) : undefined;
  const modelName = process.env.NEXANDRO_AI_RAG_MODEL_NAME;
  const modelVersion = process.env.NEXANDRO_AI_RAG_MODEL_VERSION;
  return new GptOssRagProvider({
    baseUrl: baseUrl || 'http://localhost:0/disabled',
    apiKey,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
    modelName,
    modelVersion,
  });
}
