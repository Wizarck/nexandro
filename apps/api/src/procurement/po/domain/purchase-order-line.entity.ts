import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { MoneyUnit } from './types';

/**
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
 * PurchaseOrderLine — child row of PurchaseOrder.
 *
 * Per design.md ADR-PO-LINE-IMMUTABILITY: lines are mutable only while
 * the parent PO is in state `draft`. The repository enforces this — see
 * `PurchaseOrderLineRepository.update` / `.delete`.
 *
 * `organization_id` is DENORMALIZED here to support the multi-tenant
 * repo gate without joining `purchase_orders` on every query.
 *
 * Per ADR-PO-VAT-MONEY-FIELDS: every money column is `numeric(18,4)`;
 * `vat_rate` is `numeric(5,4)`. `vat_inclusive` flag selects which math
 * the factory applies: false → exclusive (line_total = qty * unit_price
 * * (1 + vat_rate)), true → inclusive (unit_price is gross).
 */
@Entity({ name: 'purchase_order_lines' })
export class PurchaseOrderLine {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'purchase_order_id', type: 'uuid' })
  purchaseOrderId!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'line_number', type: 'int' })
  lineNumber!: number;

  @Column({ name: 'ingredient_id', type: 'uuid' })
  ingredientId!: string;

  @Column({
    name: 'quantity_ordered',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
  })
  quantityOrdered!: number;

  @Column({ type: 'text' })
  unit!: MoneyUnit;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
  })
  unitPrice!: number;

  @Column({
    name: 'vat_rate',
    type: 'numeric',
    precision: 5,
    scale: 4,
    transformer: numericTransformer,
    default: 0,
  })
  vatRate!: number;

  @Column({ name: 'vat_inclusive', type: 'boolean', default: false })
  vatInclusive!: boolean;

  @Column({
    name: 'line_subtotal',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
  })
  lineSubtotal!: number;

  @Column({
    name: 'line_vat',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
  })
  lineVat!: number;

  @Column({
    name: 'line_total',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
  })
  lineTotal!: number;
}
