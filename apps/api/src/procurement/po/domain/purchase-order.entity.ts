import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { PoState } from './types';

/**
 * TypeORM returns numeric columns as strings (postgres protocol); convert to
 * JS number for application code while accepting number-typed values on the
 * way back to the DB. numeric(18,4) tops at ~10^14, well within JS Number
 * precision range.
 *
 * HOISTED ABOVE @Entity class per Wave 2.1 lesson
 * [[feedback_subagent_apply_typing_fix_cascade]]: TS2448 block-scoped-variable
 * hazard. DO NOT move below the class.
 */
const numericTransformer = {
  to: (value: number): number => value,
  from: (value: string | null): number =>
    value === null ? 0 : Number.parseFloat(value),
};

/**
 * PurchaseOrder aggregate root.
 *
 * Per design.md ADR-PO-VAT-MONEY-FIELDS: every money column is
 * `numeric(18,4)`; `currency` is ISO 4217 alpha-3 enforced by DB CHECK.
 *
 * State machine: see `state-machine.ts`. Mutation flows other than draft +
 * factory-assisted lifecycle transitions are claimed by downstream slices:
 *  - GR confirmation (sent -> partially_received -> received) → slice #7
 *  - Audit-log emission for PO_* events → slice #21
 *  - Operator UI (j11 procurement table, draft editor) → slice #8
 *
 * Multi-tenant invariant enforced at the repository layer; entity itself
 * carries `organizationId` for column mapping but does no validation.
 */
@Entity({ name: 'purchase_orders' })
export class PurchaseOrder {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId!: string;

  @Column({ name: 'po_number', type: 'text' })
  poNumber!: string;

  @Column({ type: 'text' })
  state!: PoState;

  @Column({ type: 'text' })
  currency!: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
    default: 0,
  })
  subtotal!: number;

  @Column({
    name: 'vat_total',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
    default: 0,
  })
  vatTotal!: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
    default: 0,
  })
  total!: number;

  @Column({ name: 'expected_delivery_date', type: 'date', nullable: true })
  expectedDeliveryDate: Date | null = null;

  @Column({ type: 'text', nullable: true })
  notes: string | null = null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null = null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
