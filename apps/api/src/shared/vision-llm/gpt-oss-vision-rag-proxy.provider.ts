import { Injectable } from '@nestjs/common';
import type { VisionLlmInputValue, VisionLlmOutputValue } from '@opentrattos/contracts';
import { NotImplementedError } from './errors';
import type { VisionLlmProvider } from './vision-llm-provider.interface';

/**
 * Default vision-LLM adapter — extends the AGPL community `tools/rag-proxy/`
 * (from Wave 1.8) with vision capabilities.
 *
 * Stub in this slice (m3-vision-llm-provider-di-otel). Slice #17a
 * (`m3-photo-ingest-backend`) replaces the `extract()` body with the real
 * HTTP call + iron-rule null-on-outage contract.
 */
@Injectable()
export class GptOssVisionRagProxyProvider implements VisionLlmProvider {
  readonly id = 'gpt-oss-vision-rag-proxy';
  readonly modelName = 'gpt-oss-vision-rag';
  readonly modelVersion = 'v0-stub';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async extract(_input: VisionLlmInputValue): Promise<VisionLlmOutputValue | null> {
    throw new NotImplementedError(
      'Vision LLM extraction not yet wired; slice #17a delivers',
    );
  }
}
