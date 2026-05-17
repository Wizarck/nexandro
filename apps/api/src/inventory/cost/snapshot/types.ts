import { z } from 'zod';
import type { CostBreakdownEntry, CostSnapshotStrategy } from './domain/cost-snapshot.entity';

/**
 * M3 inventory.cost-snapshot Zod schemas + types.
 *
 * INLINE per Wave 2.1 hard constraint (TS6059 — apps/api MUST NOT import from
 * @nexandro/contracts). Slice #21 batches re-export into the contracts
 * package once the post-Wave-2.2 typing reconciliation is done.
 *
 * Per ADR-SNAPSHOT-SCHEMA (design.md):
 * - CostBreakdownEntrySchema matches the JSONB array element shape.
 * - CostSnapshotReadModel matches the DB row shape (11 columns).
 * - SnapshotConsumptionInputSchema is the service-layer input shape.
 *
 * Per Wave 2.1 lesson: use `.min(1)` over `.nonempty()` for array minimum
 * constraints (the latter type-narrows in ways that fight TypeORM's
 * jsonb -> any decoding round-trip).
 */

const UUID = z.string().uuid();
const COST_STRATEGIES = ['fifo', 'fefo', 'manual'] as const;

/**
 * One contributing-lot entry in the JSONB `breakdown` array.
 * Each FIFO/FEFO split contributes exactly one of these; manual corrections
 * may carry zero or more (zero-length is rejected at the parent schema).
 */
export const CostBreakdownEntrySchema = z.object({
  lot_id: UUID,
  qty: z.number().positive(),
  unit_cost: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
});

export type CostBreakdownEntryShape = z.infer<typeof CostBreakdownEntrySchema>;

/**
 * Full cost_snapshots row Zod shape. Used by the repository at the boundary
 * to validate inputs prior to INSERT (per REQ-SS-2).
 */
export const CostSnapshotReadModelSchema = z.object({
  snapshot_id: UUID,
  organization_id: UUID,
  stock_move_id: UUID,
  lot_id: UUID,
  product_id: UUID,
  strategy: z.enum(COST_STRATEGIES),
  qty_consumed: z.number().positive(),
  total_cost: z.number().nonnegative(),
  breakdown: CostBreakdownEntrySchema.array().min(1),
  correlation_id: UUID,
  created_at: z.date(),
});

export type CostSnapshotReadModel = z.infer<typeof CostSnapshotReadModelSchema>;

/**
 * Service-layer input shape for CostSnapshotService.snapshotConsumption().
 * `snapshot_id` + `created_at` are auto-populated by the service (UUID v4 +
 * now()) so they are omitted from the input contract.
 */
export const SnapshotConsumptionInputSchema = z.object({
  organization_id: UUID,
  stock_move_id: UUID,
  lot_id: UUID,
  product_id: UUID,
  strategy: z.enum(COST_STRATEGIES),
  qty_consumed: z.number().positive(),
  total_cost: z.number().nonnegative(),
  breakdown: CostBreakdownEntrySchema.array().min(1),
  correlation_id: UUID,
});

export type SnapshotConsumptionInput = z.infer<
  typeof SnapshotConsumptionInputSchema
>;

/**
 * Typed audit-event-envelope key for the COST_SNAPSHOT_RECORDED event.
 * Registered here ONLY — AuditLogSubscriber.KNOWN_EVENTS update is claimed
 * by slice #21 (m3-audit-log-hash-chain-hardening) per ADR-SNAPSHOT-NO-EMIT-HERE.
 * Downstream listeners (slice #20 dashboard widgets) can subscribe to this
 * channel directly via EventEmitter2 even before slice #21 lands.
 */
export const COST_SNAPSHOT_RECORDED_EVENT = 'cost.cost-snapshot-recorded' as const;

/**
 * Payload shape emitted on the bus when CostSnapshotService.snapshotConsumption()
 * commits. Matches the AuditEventEnvelope contract from audit-log/types.ts so
 * slice #21 can plug the subscriber registration in without per-event-type
 * translation logic.
 */
export interface CostSnapshotRecordedPayload {
  organizationId: string;
  aggregateType: 'cost_snapshot';
  aggregateId: string;
  actorUserId: string | null;
  actorKind: 'user' | 'agent' | 'system';
  payloadBefore: null;
  payloadAfter: {
    snapshot_id: string;
    organization_id: string;
    stock_move_id: string;
    lot_id: string;
    product_id: string;
    strategy: CostSnapshotStrategy;
    qty_consumed: number;
    total_cost: number;
    breakdown: CostBreakdownEntry[];
    correlation_id: string;
    created_at: string;
  };
  capabilityUsed: 'inventory.cost-resolve';
}
