import { Injectable, Logger } from '@nestjs/common';
import { trace, type Span, type SpanOptions, type Tracer } from '@opentelemetry/api';

/**
 * Thin wrapper over `@opentelemetry/api` exposing two ergonomic helpers:
 *
 * - `startGenAiSpan(name, attrs, options)` — creates a span with `gen_ai.*`
 *   semconv attributes from the pinned schema. Attribute keys not in the
 *   pinned set are logged at `warn` level (the span still emits — see
 *   ADR-VISION-OTEL-SEMCONV-PINNED §"Span with vendor-specific attribute").
 *
 * - `startSpan(name, options)` — generic helper used by interceptors +
 *   ad-hoc tracing. Accepts an optional `tag` value which is normalized
 *   into the `opentrattos.tag` attribute by `SpanEnricherInterceptor`.
 *
 * Per ADR-VISION-OTEL-PRE-BOOTSTRAP, the actual `NodeSDK.start()` call
 * happens in `apps/api/src/otel-bootstrap.ts` BEFORE any NestJS module
 * loads. This service only consumes the already-bootstrapped global
 * tracer — it never owns SDK lifecycle.
 */

/** Pinned `gen_ai.*` attribute keys (semconv v1.27.0). */
export const PINNED_GEN_AI_ATTRIBUTE_KEYS = [
  'gen_ai.system',
  'gen_ai.request.model',
  'gen_ai.response.model',
  'gen_ai.usage.input_tokens',
  'gen_ai.usage.output_tokens',
  'gen_ai.operation.name',
] as const;

export type PinnedGenAiAttributeKey = (typeof PINNED_GEN_AI_ATTRIBUTE_KEYS)[number];

export interface GenAiSpanAttributes {
  system?: string;
  requestModel?: string;
  responseModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  operationName?: string;
  /** Forwarded to `opentrattos.tag` (must already be normalized by caller). */
  tag?: string;
  /** Additional attributes — logged at `warn` level if not in the pinned set. */
  additional?: Record<string, string | number | boolean>;
}

export interface OpenTrattOsSpanOptions extends SpanOptions {
  /** Caller-supplied tag — normalized into `opentrattos.tag` attribute. */
  tag?: string;
}

export class UnknownSemconvAttributeError extends Error {
  readonly attributeKey: string;
  constructor(key: string) {
    super(
      `Unknown semconv attribute "${key}"; pinned set: ${PINNED_GEN_AI_ATTRIBUTE_KEYS.join(', ')}`,
    );
    this.name = 'UnknownSemconvAttributeError';
    this.attributeKey = key;
  }
}

const TRACER_NAME = 'opentrattos-api';

@Injectable()
export class OtelService {
  private readonly logger = new Logger(OtelService.name);

  /** Returns the global tracer for `service.name=opentrattos-api`. */
  getTracer(): Tracer {
    return trace.getTracer(TRACER_NAME);
  }

  /**
   * Creates a span pre-populated with `gen_ai.*` attributes from the pinned
   * schema. Caller passes ergonomic camelCase keys; this method maps them
   * to the canonical `gen_ai.*` semconv keys.
   */
  startGenAiSpan(
    name: string,
    attrs: GenAiSpanAttributes,
    options: OpenTrattOsSpanOptions = {},
  ): Span {
    const tracer = this.getTracer();
    const span = tracer.startSpan(name, options);

    if (attrs.system !== undefined) span.setAttribute('gen_ai.system', attrs.system);
    if (attrs.requestModel !== undefined) span.setAttribute('gen_ai.request.model', attrs.requestModel);
    if (attrs.responseModel !== undefined) span.setAttribute('gen_ai.response.model', attrs.responseModel);
    if (attrs.inputTokens !== undefined) span.setAttribute('gen_ai.usage.input_tokens', attrs.inputTokens);
    if (attrs.outputTokens !== undefined) span.setAttribute('gen_ai.usage.output_tokens', attrs.outputTokens);
    if (attrs.operationName !== undefined) span.setAttribute('gen_ai.operation.name', attrs.operationName);

    if (attrs.tag !== undefined) {
      span.setAttribute('opentrattos.tag', attrs.tag);
    } else if (options.tag !== undefined) {
      span.setAttribute('opentrattos.tag', options.tag);
    }

    if (attrs.additional) {
      for (const [key, value] of Object.entries(attrs.additional)) {
        if (!(PINNED_GEN_AI_ATTRIBUTE_KEYS as readonly string[]).includes(key) && !key.startsWith('opentrattos.')) {
          this.logger.warn(
            `gen_ai span "${name}" carries non-pinned attribute "${key}"; bump @opentelemetry/semantic-conventions pin if intentional`,
          );
        }
        span.setAttribute(key, value);
      }
    }

    return span;
  }

  /** Generic span — for non-`gen_ai.*` instrumentation paths. */
  startSpan(name: string, options: OpenTrattOsSpanOptions = {}): Span {
    const span = this.getTracer().startSpan(name, options);
    if (options.tag !== undefined) {
      span.setAttribute('opentrattos.tag', options.tag);
    }
    return span;
  }
}
