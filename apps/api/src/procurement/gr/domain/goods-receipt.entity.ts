import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type GoodsReceiptState = 'draft' | 'confirmed' | 'cancelled';

export const GR_STATES: readonly GoodsReceiptState[] = [
  'draft',
  'confirmed',
  'cancelled',
];

/**
 * GoodsReceipt header — one row per supplier delivery (PO-linked or
 * independent/direct purchase). Per ADR-GR-LOT-CREATION-SEAM: confirmation
 * of this aggregate materializes one `lots` row per child line.
 *
 * State machine: `draft → confirmed → cancelled`. `cancelled` reachable
 * only from `draft` (ADR-GR-LOT-CREATION-SEAM "Cancellation of a confirmed
 * GR is rejected"). Forward-only state enforcement at application layer.
 *
 * Multi-tenant gate: every read/write goes through `GoodsReceiptRepository`
 * which always WHERE-clauses `organization_id`.
 *
 * po_id NULL allowed for independent GRs (ADR-GR-INDEPENDENT-LOT-NO-PO).
 * received_at_location_id NOT NULL — every GR happens at a kitchen location.
 */
@Entity({ name: 'goods_receipts' })
@Index('idx_gr_org_received', ['organizationId', 'receivedAt'])
@Index('idx_gr_org_supplier_received', [
  'organizationId',
  'supplierId',
  'receivedAt',
])
export class GoodsReceipt {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'po_id', type: 'uuid', nullable: true })
  poId: string | null = null;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId!: string;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ name: 'received_at_location_id', type: 'uuid' })
  receivedAtLocationId!: string;

  @Column({ name: 'receiving_user_id', type: 'uuid' })
  receivingUserId!: string;

  @Column({ name: 'supplier_invoice_ref', type: 'text', nullable: true })
  supplierInvoiceRef: string | null = null;

  @Column({ type: 'text', default: 'draft' })
  state!: GoodsReceiptState;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
