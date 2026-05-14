import { z } from 'zod';

/**
 * M3 AI-observability typed contracts.
 *
 * - `OpenTrattOsTagAttribute` — the cost drill-down primary key. Free-form
 *   kebab-case ASCII, max 64 chars. Used by `SpanEnricherInterceptor` and
 *   surfaced in slice #20 dashboard widget #7.
 * - `OtelSpanAttributes` — the pinned `gen_ai.*` attribute set (semconv
 *   v1.27.0). Drift detection via `apps/api/test/otel-semconv.spec.ts`.
 * - `VisionLlmInput` / `VisionLlmOutput` — DI contract for the vision-LLM
 *   provider surface. Real `extract()` implementations land with slice #17a
 *   (`m3-photo-ingest-backend`); this slice ships interface + Zod schemas
 *   so consumer-side code can already typecheck.
 *
 * Cross-references:
 * - ADR-VISION-OTEL-SEMCONV-PINNED (`design.md` §Decisions)
 * - ADR-VISION-TAG-ATTRIBUTE (`design.md` §Decisions)
 * - architecture-m3.md ADR-030, ADR-038
 */

/**
 * `opentrattos.tag` attribute value. Caller-supplied label that drives the
 * cost-by-tag drill-down in slice #20.
 *
 * Rules (mirrored by `SpanEnricherInterceptor` normalization):
 * - kebab-case ASCII only
 * - starts with [a-z], ends with [a-z0-9]
 * - segments separated by single hyphens, no double hyphens
 * - max 64 chars
 */
export const OpenTrattOsTagAttribute = z
  .string()
  .min(1, 'tag must be at least 1 char')
  .max(64, 'tag must be at most 64 chars')
  .regex(
    /^[a-z](?:[a-z0-9]|-(?=[a-z0-9])){0,62}[a-z0-9]$|^[a-z]$/,
    'tag must be kebab-case ASCII (lowercase letters, digits, hyphens; starts with a letter, no leading/trailing/double hyphens)',
  );

export type OpenTrattOsTagAttributeValue = z.infer<typeof OpenTrattOsTagAttribute>;

/**
 * Pinned `gen_ai.*` attribute set (semantic-conventions v1.27.0).
 *
 * Keys mirror `@opentelemetry/semantic-conventions` `ATTR_GEN_AI_*` exports.
 * The CI test `otel-semconv.spec.ts` asserts emitted spans contain exactly
 * this key set (no extras, no missing) so version drift is caught at PR time.
 *
 * Slice #19 (`m3-ai-obs-budget-tier-emitter`) consumes these attributes to
 * fold into hourly `ai_usage_rollup` rows.
 */
export const OtelSpanAttributes = z.object({
  /** `gen_ai.system` — provider identifier (e.g. `anthropic`, `openai`, `gpt-oss`). */
  'gen_ai.system': z.string().min(1),
  /** `gen_ai.request.model` — requested model name (e.g. `claude-3.5-sonnet`). */
  'gen_ai.request.model': z.string().min(1),
  /** `gen_ai.response.model` — resolved model name from the response (may differ on auto-routing backends). */
  'gen_ai.response.model': z.string().min(1).optional(),
  /** `gen_ai.usage.input_tokens` — prompt token count. */
  'gen_ai.usage.input_tokens': z.number().int().nonnegative().optional(),
  /** `gen_ai.usage.output_tokens` — completion token count. */
  'gen_ai.usage.output_tokens': z.number().int().nonnegative().optional(),
  /** `gen_ai.operation.name` — `chat`, `text_completion`, `embeddings`, etc. */
  'gen_ai.operation.name': z.string().min(1).optional(),
  /** `opentrattos.tag` — see {@link OpenTrattOsTagAttribute}. */
  'opentrattos.tag': OpenTrattOsTagAttribute.optional(),
});

export type OtelSpanAttributesValue = z.infer<typeof OtelSpanAttributes>;

/**
 * Input shape for the vision-LLM extraction surface.
 *
 * Either `photoBytes` (raw buffer) OR `photoUrl` (presigned URL) MUST be
 * present — never both undefined. Iron-rule: outage → adapter returns
 * `null`; partial extraction is NEVER returned (slice #17a enforces).
 */
export const VisionLlmInput = z
  .object({
    /** Image payload as a raw buffer (in-memory; preferred path). */
    photoBytes: z.instanceof(Uint8Array).optional(),
    /** Presigned URL to fetch the image (S3-compat object storage). */
    photoUrl: z.string().url().optional(),
    /** Cost drill-down tag — see {@link OpenTrattOsTagAttribute}. */
    tag: OpenTrattOsTagAttribute,
    /** Capability identifier (e.g. `inventory.ingest-invoice-photo`). Drives audit-log linkage. */
    capability: z.string().min(1),
    /** Optional model hint to override factory selection on a per-call basis. */
    modelHint: z.string().min(1).optional(),
  })
  .refine(
    (input) => input.photoBytes !== undefined || input.photoUrl !== undefined,
    {
      message: 'VisionLlmInput requires either photoBytes or photoUrl',
      path: ['photoBytes'],
    },
  );

export type VisionLlmInputValue = z.infer<typeof VisionLlmInput>;

/**
 * Output shape returned by the vision-LLM extraction surface.
 *
 * `fields[].confidence` is in `[0, 1]` and drives slice #17a HITL queue
 * banding (FR29). `value` may be `null` to mark "field present but
 * unreadable" — but the WHOLE result is non-partial: if extraction fails
 * end-to-end, the adapter returns `null` instead of an `VisionLlmOutput`
 * with empty fields.
 */
export const VisionLlmOutput = z.object({
  fields: z
    .array(
      z.object({
        name: z.string().min(1),
        value: z.union([z.string(), z.number(), z.null()]),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1, 'VisionLlmOutput.fields must contain at least 1 field; null whole-output is the outage path'),
});

export type VisionLlmOutputValue = z.infer<typeof VisionLlmOutput>;
