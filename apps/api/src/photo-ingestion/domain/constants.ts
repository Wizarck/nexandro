/**
 * Confidence-band constants — single source of truth per ADR-034 + j12.md
 * §Notes for implementation.
 *
 * Path is `apps/api/src/photo-ingestion/domain/constants.ts`. j12.md line 84
 * pins the BC-local location. Magic numbers in service code are PROHIBITED;
 * every comparison MUST import from here.
 *
 * Iron rule (j12 §Decisions): code-level locked, NOT operator-tunable. The
 * EU AI Act expects HITL by design — operators MUST NOT be able to lower
 * the band by configuration, OR raise it to defeat auto-fill.
 *
 * Comparison: inclusive `>=`. `0.85` exactly = auto-fill; `0.60` exactly =
 * flag-for-review. IEEE 754 boundary tests use
 * `0.8499999999999999`, `0.8500000000000001`, `0.5999999999999999`,
 * `0.6000000000000001`.
 */
export const CONFIDENCE_AUTO_FILL = 0.85;
export const CONFIDENCE_FLAG_FOR_REVIEW = 0.6;
