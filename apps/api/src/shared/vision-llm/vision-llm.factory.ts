import { Injectable } from '@nestjs/common';
import { ClaudeVisionProvider } from './claude-vision.provider';
import { GptFourVProvider } from './gpt-four-v.provider';
import { GptOssVisionRagProxyProvider } from './gpt-oss-vision-rag-proxy.provider';
import {
  KNOWN_VISION_LLM_PROVIDERS,
  UnknownVisionLlmProviderError,
  type KnownVisionLlmProviderId,
} from './errors';
import type { VisionLlmProvider } from './vision-llm-provider.interface';

export const DEFAULT_VISION_LLM_PROVIDER: KnownVisionLlmProviderId = 'gpt-oss-vision-rag-proxy';

/**
 * Factory selecting the active vision-LLM adapter via the
 * `OPENTRATTOS_VISION_LLM_PROVIDER` env var.
 *
 * - Default: `gpt-oss-vision-rag-proxy` (AGPL community build).
 * - Enterprise: `claude-vision` or `gpt-four-v`.
 *
 * The selection is cached at construction — no per-request branching cost.
 * Unknown env values throw {@link UnknownVisionLlmProviderError} at boot
 * (NOT at first call), so misconfiguration is caught immediately.
 *
 * See ADR-VISION-PROVIDER-FACTORY (`design.md` §Decisions).
 */
@Injectable()
export class VisionLlmFactory {
  private readonly resolvedProvider: VisionLlmProvider;

  constructor(
    private readonly gptOssVisionRagProxy: GptOssVisionRagProxyProvider,
    private readonly claudeVision: ClaudeVisionProvider,
    private readonly gptFourV: GptFourVProvider,
  ) {
    this.resolvedProvider = this.resolve();
  }

  /** Returns the env-selected adapter (cached at construction time). */
  getProvider(): VisionLlmProvider {
    return this.resolvedProvider;
  }

  private resolve(): VisionLlmProvider {
    const raw = (process.env.OPENTRATTOS_VISION_LLM_PROVIDER ?? '').trim();
    const selected = raw.length === 0 ? DEFAULT_VISION_LLM_PROVIDER : raw;

    if (!isKnownProviderId(selected)) {
      throw new UnknownVisionLlmProviderError(selected);
    }

    switch (selected) {
      case 'gpt-oss-vision-rag-proxy':
        return this.gptOssVisionRagProxy;
      case 'claude-vision':
        return this.claudeVision;
      case 'gpt-four-v':
        return this.gptFourV;
      default: {
        // Exhaustiveness guard — TS asserts `selected` is `never` here.
        const _exhaustive: never = selected;
        throw new UnknownVisionLlmProviderError(_exhaustive);
      }
    }
  }
}

function isKnownProviderId(value: string): value is KnownVisionLlmProviderId {
  return (KNOWN_VISION_LLM_PROVIDERS as readonly string[]).includes(value);
}
