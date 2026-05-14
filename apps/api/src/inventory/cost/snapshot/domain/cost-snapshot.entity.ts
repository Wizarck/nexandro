import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Cost strategy used to resolve consumption against contributing lots.
 * Mirrors slice #4's CostResolution.strategy. 'manual' is reserved for
 * operator-submitted corrections that append a second snapshot for the
 * same stock_move_id (per ADR-SNAPSHOT-IMMUTABLE).
 */
export type CostSnapshotStrategy = 'fifo' | 'fefo' | 'manual';

/**
 * Single contributing-lot entry in the JSONB `breakdown` array.
 * `subtotal` SHOULD equal `qty * unit_cost` within €0.0001 rounding;
 * sum of subtotals SHOULD equal the row's `total_cost` within €0.01
 * tolerance (enforced at service layer per REQ-SS-7).
 */
export interface CostBreakdownEntry {
  lot_id: string;
  qty: number;
  unit_cost: number;
  subtotal: number;
}

/**
 * TypeORM returns numeric columns as strings (postgres protocol); convert
 * to JS number for application code while accepting number-typed values on
 * the way back to the DB. Hoisted above the @Entity declaration so the
 * decorator factory captures the function reference at class-eval time —
 * Wave 2.1 typing-cascade lesson (TS6059 / CJS hoist).
 */
const numericTransformer = {
  to: (value: number): number => value,
  from: (value: string | null): number =>
    value === null ? 0 : Number.parseFloat(value),
};

/**
 * Append-only ledger row capturing the resolved cost basis at the moment a
 * Lot was consumed. Per ADR-SNAPSHOT-IMMUTABLE — once written, never updated.
 * Corrections are appended as a NEW row with `strategy='manual'` referencing
 * the original `stock_move_id`.
 *
 * Foundation for FR7 traceability (EU 178/2002 + HACCP) and downstream
 * rollup surfaces (slice #20 AI obs dashboard, future recipe P&L exporter,
 * future recall dossier financial section).
 *
 * Mutation flows are owned by:
 *  - inserts → CostSnapshotService.snapshotConsumption() (this slice;
 *    subscriber on LOT_CONSUMED event from slice #2)
 *  - reads → CostSnapshotRepository.findByStockMoveId / findByProductSince
 *
 * Multi-tenant invariant enforced at the repository (organizationId first
 * parameter on every public method) per ADR-SNAPSHOT-IMMUTABLE companion.
 */
@Entity({ name: 'cost_snapshots' })
@Index('idx_cost_snapshots_org_move_created', [
  'organizationId',
  'stockMoveId',
  'createdAt',
])
@Index('idx_cost_snapshots_org_product_created', [
  'organizationId',
  'productId',
  'createdAt',
])
export class CostSnapshot {
  @PrimaryColumn({ name: 'snapshot_id', type: 'uuid' })
  snapshotId!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'stock_move_id', type: 'uuid' })
  stockMoveId!: string;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ type: 'text' })
  strategy!: CostSnapshotStrategy;

  @Column({
    name: 'qty_consumed',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
  })
  qtyConsumed!: number;

  @Column({
    name: 'total_cost',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
  })
  totalCost!: number;

  @Column({ type: 'jsonb' })
  breakdown!: CostBreakdownEntry[];

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
