import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * TypeORM returns `numeric` columns as strings (postgres wire protocol).
 *
 * CRITICAL: this `const` is declared at module scope ABOVE the `@Entity`
 * class to avoid the TS2448 "block-scoped variable used before its
 * declaration" cascade observed during Wave 2.1. Decorator metadata
 * evaluation hoists the class but NOT the const it references.
 */
const numericTransformer = {
  to: (value: number): number => value,
  from: (value: string | null): number =>
    value === null ? 0 : Number.parseFloat(value),
};

/**
 * GoodsReceiptLine — one row per physical receipt line on a GR.
 * Per ADR-GR-LOT-CREATION-SEAM: each confirmed GR line produces exactly
 * one `lots` row (`lot_id_created` is populated by the confirmation
 * service inside the same transaction).
 *
 * po_line_id NULL allowed for independent GR lines (ADR-GR-INDEPENDENT-
 * LOT-NO-PO). Either ALL lines on a GR have po_line_id set, or NONE do
 * (shape coherence enforced by application validator).
 *
 * Indexes:
 *   - UNIQUE partial `(gr_id, po_line_id) WHERE po_line_id IS NOT NULL`
 *     for idempotency (ADR-GR-IDEMPOTENCY).
 *   - `(gr_id)` for parent-child join from header drawer.
 * Both are declared in migration 0031 (TypeORM @Index here mirrors the
 * non-partial one to satisfy schema-sync tooling; the UNIQUE partial is
 * migration-only because TypeORM @Index does not natively support the
 * `where` clause across versions).
 */
@Entity({ name: 'goods_receipt_lines' })
@Index('idx_gr_line_gr', ['grId'])
export class GoodsReceiptLine {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'gr_id', type: 'uuid' })
  grId!: string;

  @Column({ name: 'po_line_id', type: 'uuid', nullable: true })
  poLineId: string | null = null;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({
    name: 'qty_received_actual',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
  })
  qtyReceivedActual!: number;

  @Column({
    name: 'unit_price_actual',
    type: 'numeric',
    precision: 12,
    scale: 4,
    transformer: numericTransformer,
  })
  unitPriceActual!: number;

  @Column({ name: 'lot_id_created', type: 'uuid', nullable: true })
  lotIdCreated: string | null = null;

  @Column({ name: 'expires_at_override', type: 'timestamptz', nullable: true })
  expiresAtOverride: Date | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
