import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Per-org monotonic PO-number counter.
 *
 * Per ADR-PO-NUMBER-FORMAT: row-locked via `SELECT ... FOR UPDATE` for
 * monotonic allocation. Composite primary key on (organization_id, year);
 * a new row is created on first PO of each calendar year per org.
 *
 * The application service is `PoCounterService` (in `infrastructure/`).
 * `next_value` is the NEXT number to allocate; the service returns the
 * current value and increments atomically.
 */
@Entity({ name: 'po_counters' })
export class PoCounter {
  @PrimaryColumn({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @PrimaryColumn({ type: 'int' })
  year!: number;

  @Column({ name: 'next_value', type: 'int', default: 1 })
  nextValue!: number;
}
