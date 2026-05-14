import { randomUUID } from 'node:crypto';
import {
  CostSnapshotBreakdownInvariantError,
  CostSnapshotCrossTenantAccessError,
  CostSnapshotImmutableError,
} from './errors';

describe('cost-snapshot domain errors', () => {
  describe('CostSnapshotImmutableError', () => {
    it('carries snapshotId in message + stable code', () => {
      const id = randomUUID();
      const err = new CostSnapshotImmutableError(id);
      expect(err.code).toBe('COST_SNAPSHOT_IMMUTABLE');
      expect(err.message).toContain(id);
      expect(err.message).toContain('append-only');
      expect(err.name).toBe('CostSnapshotImmutableError');
    });
  });

  describe('CostSnapshotBreakdownInvariantError', () => {
    it('surfaces delta on the error instance', () => {
      const err = new CostSnapshotBreakdownInvariantError(7.0, 6.8);
      expect(err.code).toBe('COST_SNAPSHOT_BREAKDOWN_INVARIANT');
      expect(err.delta).toBeCloseTo(0.2, 4);
      expect(err.message).toContain('7');
      expect(err.message).toContain('6.8');
    });

    it('negative delta when subtotal sum overshoots total_cost', () => {
      const err = new CostSnapshotBreakdownInvariantError(5.0, 5.5);
      expect(err.delta).toBeCloseTo(-0.5, 4);
    });
  });

  describe('CostSnapshotCrossTenantAccessError', () => {
    it('carries both ids + stable code', () => {
      const snapshotId = randomUUID();
      const org = randomUUID();
      const err = new CostSnapshotCrossTenantAccessError(snapshotId, org);
      expect(err.code).toBe('COST_SNAPSHOT_CROSS_TENANT_ACCESS');
      expect(err.message).toContain(snapshotId);
      expect(err.message).toContain(org);
    });
  });
});
