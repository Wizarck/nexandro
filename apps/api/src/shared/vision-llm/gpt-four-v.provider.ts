import { Injectable } from '@nestjs/common';
import type { VisionLlmInputValue, VisionLlmOutputValue } from '@opentrattos/contracts';
import { NotImplementedError } from './errors';
import type { VisionLlmProvider } from './vision-llm-provider.interface';

/**
 * OpenAI GPT-4-V (vision) adapter (Enterprise build).
 *
 * Stub in this slice. Slice #17a wires the real OpenAI SDK calls,
 * retry/backoff, and the iron-rule null-on-outage contract. The OpenAI
 * SDK package is NOT bundled in this slice's package.json — it lands with
 * slice #17a alongside the real `extract()` implementation.
 */
@Injectable()
export class GptFourVProvider implements VisionLlmProvider {
  readonly id = 'gpt-four-v';
  readonly modelName = 'gpt-4o';
  readonly modelVersion = 'v0-stub';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async extract(_input: VisionLlmInputValue): Promise<VisionLlmOutputValue | null> {
    throw new NotImplementedError(
      'Vision LLM extraction not yet wired; slice #17a delivers',
    );
  }
}
