/**
 * Errors thrown by the vision-LLM provider DI surface.
 *
 * - `NotImplementedError` — thrown by every adapter's `extract()` stub in
 *   this slice; replaced by real implementations in slice #17a
 *   (`m3-photo-ingest-backend`).
 * - `UnknownVisionLlmProviderError` — thrown by `VisionLlmFactory` at
 *   module-init when `OPENTRATTOS_VISION_LLM_PROVIDER` env names an
 *   unknown adapter. Fails at boot, NOT at first call.
 */

export class NotImplementedError extends Error {
  constructor(message?: string) {
    super(message ?? 'Vision LLM extraction not yet wired; slice #17a delivers');
    this.name = 'NotImplementedError';
  }
}

export const KNOWN_VISION_LLM_PROVIDERS = [
  'gpt-oss-vision-rag-proxy',
  'claude-vision',
  'gpt-four-v',
] as const;

export type KnownVisionLlmProviderId = (typeof KNOWN_VISION_LLM_PROVIDERS)[number];

export class UnknownVisionLlmProviderError extends Error {
  readonly providedValue: string;

  constructor(providedValue: string) {
    super(
      `${providedValue}; expected one of: ${KNOWN_VISION_LLM_PROVIDERS.join(', ')}`,
    );
    this.name = 'UnknownVisionLlmProviderError';
    this.providedValue = providedValue;
  }
}
