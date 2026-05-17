import type { VisionLlmInputValue, VisionLlmOutputValue } from './types';

/**
 * Vision-LLM provider DI contract per ADR-038.
 *
 * # Slice #17a ownership (the real `extract` implementation)
 *
 * This slice (m3-vision-llm-provider-di-otel) ships the interface + the
 * factory + 3 adapter STUBS that all throw `NotImplementedError`. The real
 * `extract` implementation — including network calls, retry/backoff, and
 * the **iron-rule null-on-outage contract** — lands in slice #17a
 * (`m3-photo-ingest-backend`).
 *
 * # Iron-rule contract (slice #17a will enforce)
 *
 * On provider outage (network timeout, 5xx HTTP, rate-limit exhaustion
 * after 3 exponential-backoff retries), the adapter MUST return `null`.
 * Partial extractions MUST NEVER be returned — this is the Wave 1.8
 * precedent and the slice #17a HITL queue surfaces null-extraction items
 * as "manual entry required" (FR29 lowest band).
 *
 * The `Promise<VisionLlmOutput | null>` return type forces every TypeScript
 * consumer to handle the null case at compile time.
 */
export interface VisionLlmProvider {
  /** Stable identifier for the adapter. Persisted on audit rows + spans. */
  readonly id: string;

  /** Canonical model name. Drives `gen_ai.request.model` span attribute. */
  readonly modelName: string;

  /** Pinned model version string. Persisted alongside modelName. */
  readonly modelVersion: string;

  /**
   * Extract structured fields from a photo. See ADR-038 for the full
   * contract. Iron-rule: return `null` on any outage; NEVER partial.
   *
   * In this slice, every adapter throws `NotImplementedError`. Slice #17a
   * delivers the real network-bound implementations.
   */
  extract(input: VisionLlmInputValue): Promise<VisionLlmOutputValue | null>;
}

/**
 * NestJS DI token for the resolved provider instance.
 *
 * Consumers (slice #17a's `PhotoIngestionService`) inject via:
 *
 *     constructor(
 *       @Inject(VISION_LLM_PROVIDER) private readonly provider: VisionLlmProvider,
 *     ) {}
 *
 * The factory `VisionLlmFactory` reads `NEXANDRO_VISION_LLM_PROVIDER` at
 * module-init and resolves to one of `GptOssVisionRagProxyProvider`,
 * `ClaudeVisionProvider`, or `GptFourVProvider`.
 */
export const VISION_LLM_PROVIDER = Symbol('VISION_LLM_PROVIDER');
