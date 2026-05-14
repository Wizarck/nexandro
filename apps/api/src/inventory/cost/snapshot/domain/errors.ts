/**
 * Domain errors for the inventory.cost-snapshot BC.
 *
 * Per ADR-SNAPSHOT-IMMUTABLE + ADR-SNAPSHOT-SCHEMA + design.md.
 * All errors extend Error with a stable `code` field for app-side mapping
 * to HTTP status codes (controller layer wires this when downstream slices
 * expose endpoints — this slice is backend-only).
 */

export class CostSnapshotImmutableError extends Error {
  public readonly code = 'COST_SNAPSHOT_IMMUTABLE';
  constructor(snapshotId: string) {
    super(
      `CostSnapshot ${snapshotId} is append-only. ` +
        `Use a new 'manual' strategy snapshot to record corrections.`,
    );
    this.name = 'CostSnapshotImmutableError';
  }
}

export class CostSnapshotBreakdownInvariantError extends Error {
  public readonly code = 'COST_SNAPSHOT_BREAKDOWN_INVARIANT';
  public readonly delta: number;
  constructor(totalCost: number, subtotalSum: number) {
    const delta = Number((totalCost - subtotalSum).toFixed(4));
    super(
      `Breakdown sum-of-subtotals (${subtotalSum}) does not match ` +
        `total_cost (${totalCost}); delta=${delta} exceeds €0.01 tolerance.`,
    );
    this.name = 'CostSnapshotBreakdownInvariantError';
    this.delta = delta;
  }
}

export class CostSnapshotCrossTenantAccessError extends Error {
  public readonly code = 'COST_SNAPSHOT_CROSS_TENANT_ACCESS';
  constructor(snapshotId: string, requestedOrg: string) {
    super(
      `Cross-tenant access attempted on cost_snapshot ${snapshotId} by ` +
        `organization ${requestedOrg}. Multi-tenant invariant violation.`,
    );
    this.name = 'CostSnapshotCrossTenantAccessError';
  }
}
