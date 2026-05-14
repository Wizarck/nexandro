import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { InvalidMoveQuantitySignError, InvalidMoveTypeError } from './errors';

export type StockMoveType = 'inbound' | 'outbound' | 'adjustment' | 'waste';
const STOCK_MOVE_TYPES: readonly StockMoveType[] = [
  'inbound',
  'outbound',
  'adjustment',
  'waste',
];

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const numericTransformer = {
  to: (value: number): number => value,
  from: (value: string | null): number =>
    value === null ? 0 : Number.parseFloat(value),
};

export interface StockMoveCreateProps {
  organizationId: string;
  locationId: string;
  lotId: string;
  moveType: StockMoveType;
  /**
   * Signed quantity. Sign convention:
   *  - `inbound`  → strictly positive
   *  - `outbound` → strictly negative
   *  - `waste`    → strictly negative
   *  - `adjustment` → either sign, non-zero
   * Sign validation is enforced at construction (factory + DB CHECK).
   */
  quantity: number;
  actorUserId: string;
  reason?: string | null;
}

/**
 * Append-only ledger row representing a quantity flow against a Lot.
 * Per ADR-LOT-SCHEMA — the parent table of FIFO/FEFO depletion history
 * (slice #4 reads in cost rollups; slice #11-12 reads in recall trace).
 *
 * Mutation flows are owned by downstream slices:
 *  - inbound rows → slice #7 GR confirmation
 *  - outbound rows → slice #2 consumption events
 *  - waste / adjustment rows → M3.x scope (operator-driven)
 *
 * This slice ships the entity + repository (read-only public surface).
 * Repository refuses UPDATE/DELETE; corrections happen via new
 * `adjustment` rows. Per ADR-LOT-NO-EVENT-EMIT-HERE, this slice does NOT
 * emit `STOCK_MOVE_CREATED` audit events — slice #21 wires the subscriber.
 */
@Entity({ name: 'stock_moves' })
@Index('idx_stock_moves_org_lot_created', ['organizationId', 'lotId', 'createdAt'])
export class StockMove {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId!: string;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId!: string;

  @Column({ name: 'move_type', type: 'text' })
  moveType!: StockMoveType;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: numericTransformer,
  })
  quantity!: number;

  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId!: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /**
   * Construct a new StockMove. Does NOT persist; downstream slices persist
   * via `StockMoveRepository.append(move)` (slice #2 / #7).
   *
   * Validation:
   *  - All UUIDs are well-formed.
   *  - `moveType` is in the allowed enum (DB CHECK enforces too).
   *  - `quantity` is non-zero finite (DB CHECK enforces too).
   *  - `quantity` sign matches `moveType` convention.
   */
  static create(props: StockMoveCreateProps): StockMove {
    StockMove.validateUuid('organizationId', props.organizationId);
    StockMove.validateUuid('locationId', props.locationId);
    StockMove.validateUuid('lotId', props.lotId);
    StockMove.validateUuid('actorUserId', props.actorUserId);
    StockMove.validateMoveType(props.moveType);
    StockMove.validateQuantitySign(props.moveType, props.quantity);

    const move = new StockMove();
    move.id = randomUUID();
    move.organizationId = props.organizationId;
    move.locationId = props.locationId;
    move.lotId = props.lotId;
    move.moveType = props.moveType;
    move.quantity = props.quantity;
    move.actorUserId = props.actorUserId;
    move.reason = props.reason ?? null;
    return move;
  }

  private static validateUuid(field: string, value: string): void {
    if (!UUID_RX.test(value)) {
      throw new InvalidMoveTypeError(`${field} is not a valid UUID: ${value}`);
    }
  }

  private static validateMoveType(moveType: string): void {
    if (!STOCK_MOVE_TYPES.includes(moveType as StockMoveType)) {
      throw new InvalidMoveTypeError(moveType);
    }
  }

  private static validateQuantitySign(moveType: StockMoveType, qty: number): void {
    if (!Number.isFinite(qty) || qty === 0) {
      throw new InvalidMoveQuantitySignError(moveType, qty);
    }
    if (moveType === 'inbound' && qty <= 0) {
      throw new InvalidMoveQuantitySignError(moveType, qty);
    }
    if ((moveType === 'outbound' || moveType === 'waste') && qty >= 0) {
      throw new InvalidMoveQuantitySignError(moveType, qty);
    }
    // 'adjustment' accepts either sign (non-zero already validated above).
  }
}
