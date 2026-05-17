// ============================================================
// M3 InventoryCostResolver — domain types (slice m3-inventory-cost-resolver-fifo-fefo, Wave 2.2)
// ============================================================
//
// Inline types + Zod schemas for the FIFO/FEFO resolver. Per
// ADR-COST-RESOLVER-INTERFACE + [[feedback_subagent_apply_typing_fix_cascade]],
// types live here and are NOT extracted to `packages/contracts/` —
// apps/api never imports `@nexandro/contracts` from its own src tree.
//
// This file OWNS the `CostResolution` shape. Slice #5
// (m3-cost-snapshot-persistence) will import `CostResolution`,
// `CostBreakdownLine`, and the Zod schemas from this file. Treat the
// schema as a stable contract; additive changes only.
//
// Zod conventions (Wave 2.1 lessons):
//   - `.min(1)` over `.nonempty()`
//   - schemas are the source of truth; TS types are inferred
//   - `.parse()` helpers exported alongside for callers that need to
//     validate at boundaries
//
// PURE TYPES — no Nest decorators, no DB imports, no Lot entity import.
// The resolver consumes plain `LotCostRow` rows; mapping from
// `Lot` entity → `LotCostRow` is the service-layer concern.

import { z } from 'zod';

// ---------------------------------------------------------------
// Strategy — the FIFO/FEFO/MANUAL enum the resolver dispatches on.
// `MANUAL` is reserved for products that should fall back to the M2
// supplier-list-price path (e.g., contract-priced spices); product-
// level only, NOT a valid org-override value per ADR-COST-STRATEGY-PER-PRODUCT.
// ---------------------------------------------------------------

export const StrategySchema = z.enum(['FIFO', 'FEFO', 'MANUAL']);
export type Strategy = z.infer<typeof StrategySchema>;

/** The two strategies that the org-policy override accepts; `MANUAL` is excluded. */
export const OrgPolicyStrategySchema = z.enum(['FIFO', 'FEFO']);
export type OrgPolicyStrategy = z.infer<typeof OrgPolicyStrategySchema>;

// ---------------------------------------------------------------
// LotCostRow — the per-lot snapshot row consumed by the pure resolver.
// `unitCostAtReceived` is stamped by slice #7 (m3-gr-aggregate-reconciliation)
// during GR confirmation. Until slice #7 ships, callers will source this
// from `Lot.metadata.unit_cost_at_received` or default 0 — wiring concern,
// not a resolver-input concern.
// ---------------------------------------------------------------

export const LotCostRowSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  locationId: z.string().min(1),
  productId: z.string().min(1),
  receivedAt: z.date(),
  expiresAt: z.date().nullable(),
  quantityRemaining: z.number().nonnegative().finite(),
  unitCostAtReceived: z.number().nonnegative().finite(),
  currency: z.string().min(3).max(3),
});

export type LotCostRow = z.infer<typeof LotCostRowSchema>;

// ---------------------------------------------------------------
// CostBreakdownLine — one breakdown row per lot consumed during a
// `resolveCost` call. Stamped with `receivedAt` + `expiresAt` for
// audit traceability (slice #5 persists these to `audit_log`).
// ---------------------------------------------------------------

export const CostBreakdownLineSchema = z.object({
  lotId: z.string().min(1),
  qty: z.number().nonnegative().finite(),
  unitCost: z.number().nonnegative().finite(),
  subtotal: z.number().nonnegative().finite(),
  receivedAt: z.date(),
  expiresAt: z.date().nullable(),
});

export type CostBreakdownLine = z.infer<typeof CostBreakdownLineSchema>;

// ---------------------------------------------------------------
// CostResolution — the canonical return shape of `resolveCost`.
// Owned by THIS slice; slice #5 imports from here for snapshot persistence.
//
// Invariants asserted by the resolver:
//   - `totalCost === sum(breakdown.subtotal)` within ROLLUP_TOLERANCE (0.0001)
//   - `strategy` is the value `selectStrategy()` chose (after override resolution)
//   - `remainingLots` reflects post-consumption state (input rows minus consumed
//      quantities); used by slice #5 to materialise the snapshot
//   - `asOfTime` echoes the input timestamp for audit traceability
// ---------------------------------------------------------------

export const CostResolutionSchema = z.object({
  totalCost: z.number().nonnegative().finite(),
  currency: z.string().min(3).max(3),
  strategy: StrategySchema,
  breakdown: z.array(CostBreakdownLineSchema).min(1),
  remainingLots: z.array(LotCostRowSchema),
  asOfTime: z.date(),
});

export type CostResolution = z.infer<typeof CostResolutionSchema>;

// ---------------------------------------------------------------
// ResolveCostInput — the input shape for the DI-injectable service.
// `organizationId` is FIRST and required (per ADR-LOT-MULTITENANT-AT-REPO
// extended to the cost resolver: multi-tenant invariant enforced at
// compile time + repository level).
//
// `strategyOverride` is the power-user / test-fixture lever; bypasses
// `selectStrategy()` entirely. Production callers leave it undefined.
// ---------------------------------------------------------------

export const ResolveCostInputSchema = z.object({
  organizationId: z.string().min(1),
  locationId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.number().positive().finite(),
  asOfTime: z.date(),
  strategyOverride: StrategySchema.optional(),
});

export type ResolveCostInput = z.infer<typeof ResolveCostInputSchema>;

// ---------------------------------------------------------------
// Helpers — `.parse()` shortcuts so callers don't reach for the schema
// objects directly. Keeps the import surface narrow at call sites.
// ---------------------------------------------------------------

export const parseLotCostRow = (input: unknown): LotCostRow =>
  LotCostRowSchema.parse(input);
export const parseCostResolution = (input: unknown): CostResolution =>
  CostResolutionSchema.parse(input);
export const parseResolveCostInput = (input: unknown): ResolveCostInput =>
  ResolveCostInputSchema.parse(input);
