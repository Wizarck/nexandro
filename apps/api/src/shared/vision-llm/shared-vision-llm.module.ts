import { Module } from '@nestjs/common';
import { ClaudeVisionProvider } from './claude-vision.provider';
import { GptFourVProvider } from './gpt-four-v.provider';
import { GptOssVisionRagProxyProvider } from './gpt-oss-vision-rag-proxy.provider';
import { VISION_LLM_PROVIDER } from './vision-llm-provider.interface';
import { VisionLlmFactory } from './vision-llm.factory';

/**
 * Shared module exposing the vision-LLM provider DI surface.
 *
 * Consumers (slice #17a's `PhotoIngestionModule`) import this module and
 * inject `@Inject(VISION_LLM_PROVIDER)` for the env-resolved adapter.
 *
 * See ADR-VISION-PROVIDER-FACTORY (`design.md` §Decisions).
 */
@Module({
  providers: [
    GptOssVisionRagProxyProvider,
    ClaudeVisionProvider,
    GptFourVProvider,
    VisionLlmFactory,
    {
      provide: VISION_LLM_PROVIDER,
      useFactory: (factory: VisionLlmFactory) => factory.getProvider(),
      inject: [VisionLlmFactory],
    },
  ],
  exports: [VisionLlmFactory, VISION_LLM_PROVIDER],
})
export class SharedVisionLlmModule {}
