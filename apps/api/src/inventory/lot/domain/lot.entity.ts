import { randomUUID } from 'node:crypto';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  InvalidLotExpiryError,
  InvalidLotQuantityError,
  InvalidUnitError,
} from './errors';

export type LotUnit = 'kg' | 'g' | 'L' | 'ml' | 'un';
const LOT_UNITS: readonly LotUnit[] = ['kg', 'g', 'L', 'ml', 'un'];

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Inputs for {@link Lot.create}. `quantityRemaining` defaults to
 * `quantityReceived` — outbound flow lives in `StockMove` (slice #2).
 */
export interface LotCreateProps {
  organizationId: string;
  locationId: string;
  supplierId: string | null;
  receivedAt: Date;
  expiresAt: Date | null;
  quantityReceived: number;
  unit: LotUnit;
  metadata?: Record<string, unknown> | null;
}

/**
 * Discrete batch of stock received at one location at one time from one supplier.
 * Per ADR-LOT-SCHEMA — foundation for FR4 (lot generation on GR), FR6 (consumption),
 * FR7 (cost resolver), FR8 (expiry alerts), and recall trace (FR14-FR20).
 *
 * Mutation flows are owned by downstream slices:
 *  - Creation → slice #7 m3-gr-aggregate-reconciliation
 *  - Consumption (decrement quantity_remaining via stock_moves) → slice #2
 *  - Expiry alerting (read-only scan) → slice #3
 *
 * This slice ships the entity + repository + factory only. No service-layer
 * mutation API exposed. Multi-tenant invariant enforced at repository.
 */
@Entity({ name: 'lots' })
@Index('idx_lots_org_supplier_received', [
  'organizationId',
  'supplierId',
  'receivedAt',
])
export class Lot {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId!: string;

  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId: string | null = null;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null = null;

  @Column({
    name: 'quantity_received',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
  })
  quantityReceived!: number;

  @Column({
    name: 'quantity_remaining',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
  })
  quantityRemaining!: number;

  @Column({ type: 'text' })
  unit!: LotUnit;

  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown> | null = {};

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /**
   * Construct a new Lot. Does NOT persist; slice #7's GR confirmation flow
   * persists via `LotRepository.save(lot)`.
   *
   * Validation:
   *  - `organizationId` + `locationId` must be valid UUIDs
   *  - `quantityReceived` must be > 0 (CHECK constraint enforces at DB level too)
   *  - `expiresAt`, if set, must be > `receivedAt` (a lot that expires before
   *    it's received is nonsensical — likely operator error)
   *  - `unit` must be in the allowed enum (CHECK constraint enforces at DB too)
   */
  static create(props: LotCreateProps): Lot {
    Lot.validateUuid('organizationId', props.organizationId);
    Lot.validateUuid('locationId', props.locationId);
    if (props.supplierId !== null) {
      Lot.validateUuid('supplierId', props.supplierId);
    }
    Lot.validateQuantity(props.quantityReceived);
    Lot.validateUnit(props.unit);
    Lot.validateExpiry(props.receivedAt, props.expiresAt);

    const lot = new Lot();
    lot.id = randomUUID();
    lot.organizationId = props.organizationId;
    lot.locationId = props.locationId;
    lot.supplierId = props.supplierId;
    lot.receivedAt = props.receivedAt;
    lot.expiresAt = props.expiresAt;
    lot.quantityReceived = props.quantityReceived;
    // Invariant: a fresh Lot has full remaining quantity. Outbound flow
    // (slice #2) decrements via stock_moves with sync invariant tested
    // by INT test (slice #5 wires the nightly rollup check).
    lot.quantityRemaining = props.quantityReceived;
    lot.unit = props.unit;
    lot.metadata = props.metadata ?? {};
    return lot;
  }

  private static validateUuid(field: string, value: string): void {
    if (!UUID_RX.test(value)) {
      throw new InvalidLotQuantityError(`${field} is not a valid UUID: ${value}`);
    }
  }

  private static validateQuantity(qty: number): void {
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new InvalidLotQuantityError(
        `quantityReceived must be a positive finite number; got ${qty}.`,
      );
    }
  }

  private static validateUnit(unit: string): void {
    if (!LOT_UNITS.includes(unit as LotUnit)) {
      throw new InvalidUnitError(unit);
    }
  }

  private static validateExpiry(receivedAt: Date, expiresAt: Date | null): void {
    if (expiresAt === null) return;
    if (expiresAt.getTime() <= receivedAt.getTime()) {
      throw new InvalidLotExpiryError(receivedAt, expiresAt);
    }
  }
}

/**
 * TypeORM returns numeric columns as strings (postgres protocol); convert
 * to JS number for application code while accepting number-typed values on
 * the way back to the DB. This loses precision beyond ~15 significant digits
 * but numeric(18,4) tops out at ~10^14 — well within JS Number range.
 */
const numericTransformer = {
  to: (value: number): number => value,
  from: (value: string | null): number =>
    value === null ? 0 : Number.parseFloat(value),
};
