/**
 * AI pricing registry — typed shape only.
 *
 * Per ADR-030 § AI Observability BC, the actual `ai_pricing` table + seed
 * data lands in slice #19 (`m3-ai-obs-budget-tier-emitter`). This slice
 * ships the typed shape so downstream code (slice #19's seeder + slice
 * #20's dashboard) can already typecheck against a stable structure.
 */

export interface AiPricingEntry {
  /** Canonical model name (matches `gen_ai.request.model` span attribute). */
  modelName: string;
  /** Pinned model version (matches `gen_ai.response.model` when available). */
  modelVersion: string;
  /** Cost per 1M input tokens, USD. */
  inputCostPerMillion: number;
  /** Cost per 1M output tokens, USD. */
  outputCostPerMillion: number;
  /** ISO-8601 date this price came into effect (Open Pricing Calendar). */
  effectiveAt: string;
}

/**
 * Empty registry in this slice. Slice #19 will populate this from a
 * seeder migration; slice #20 will read it to render the cost-by-model
 * dashboard widget.
 */
export const AI_PRICING_REGISTRY: ReadonlyArray<AiPricingEntry> = [];
