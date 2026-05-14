import { randomUUID } from 'node:crypto';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Discriminator literal union for the t-72h / t-24h bands. */
export type AlertBand = 't-72h' | 't-24h';

export const ALERT_BANDS: readonly AlertBand[] = ['t-72h', 't-24h'];

/**
 * Append-only log row recording each `LotExpiryNearEvent` emission per
 * `(organization_id, lot_id, alert_band)` per 23-hour dedup window.
 *
 * Mutation paths are intentionally absent at the application layer
 * (see `ExpiryAlertsFiredRepository`). The TypeORM entity is read +
 * append; never `save` an existing row's id back through the repo public
 * surface.
 *
 * Per ADR-EXPIRY-DEDUPLICATION (design.md): `expires_at_snapshot`
 * preserves `lots.expires_at` at fire time so the audit trail survives
 * later lot mutation (re-labeling, shelf-life extension).
 */
@Entity({ name: 'expiry_alerts_fired' })
@Index('idx_expiry_alerts_fired_dedup', [
  'organizationId',
  'lotId',
  'alertBand',
  'firedAt',
])
@Index('idx_expiry_alerts_fired_org_fired', ['organizationId', 'firedAt'])
export class ExpiryAlertsFired {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId!: string;

  @Column({ name: 'alert_band', type: 'text' })
  alertBand!: AlertBand;

  @Column({ name: 'fired_at', type: 'timestamptz' })
  firedAt!: Date;

  @Column({ name: 'expires_at_snapshot', type: 'timestamptz' })
  expiresAtSnapshot!: Date;

  /**
   * Construct a new fired-log row. Validates `alertBand` against the
   * literal union (the DB CHECK constraint is a backstop; this catches
   * the bug in unit tests before the migration runs).
   */
  static create(props: {
    organizationId: string;
    lotId: string;
    alertBand: AlertBand;
    expiresAtSnapshot: Date;
    firedAt?: Date;
  }): ExpiryAlertsFired {
    if (!ALERT_BANDS.includes(props.alertBand)) {
      throw new Error(`Invalid alertBand: ${props.alertBand}`);
    }
    const row = new ExpiryAlertsFired();
    row.id = randomUUID();
    row.organizationId = props.organizationId;
    row.lotId = props.lotId;
    row.alertBand = props.alertBand;
    row.expiresAtSnapshot = props.expiresAtSnapshot;
    row.firedAt = props.firedAt ?? new Date();
    return row;
  }
}
