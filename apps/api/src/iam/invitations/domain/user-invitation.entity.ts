import { randomUUID } from 'node:crypto';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { UserRole } from '../../domain/user.entity';

const USER_ROLES: readonly UserRole[] = ['OWNER', 'MANAGER', 'STAFF'];
const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RX = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
const TOKEN_RX = /^[0-9a-f]{64}$/;

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface UserInvitationCreateProps {
  organizationId: string;
  email: string;
  role: UserRole;
  token: string;
  invitedByUserId: string;
  /** Optional override; default = now + 7 days. */
  expiresAt?: Date;
}

/**
 * Sprint 4 W2-2a — invitation aggregate.
 *
 * The entity owns its state-machine helpers (accept / revoke / status)
 * so the application service stays a thin transaction boundary. Token
 * format (64 hex chars from `crypto.randomBytes(32).toString('hex')`)
 * is validated at construction so a malformed value can't be persisted.
 */
@Entity({ name: 'user_invitations' })
@Index('ix_user_invitations_org_email', ['organizationId', 'email'])
export class UserInvitation {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: UserRole;

  @Column({ type: 'varchar', length: 64, unique: true })
  token!: string;

  @Column({ name: 'invited_by_user_id', type: 'uuid' })
  invitedByUserId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null = null;

  @Column({ name: 'accepted_user_id', type: 'uuid', nullable: true })
  acceptedUserId: string | null = null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  static create(props: UserInvitationCreateProps): UserInvitation {
    UserInvitation.validateUuid('organizationId', props.organizationId);
    UserInvitation.validateUuid('invitedByUserId', props.invitedByUserId);
    UserInvitation.validateRole(props.role);
    UserInvitation.validateToken(props.token);
    const email = UserInvitation.normaliseEmail(props.email);

    const inv = new UserInvitation();
    inv.id = randomUUID();
    inv.organizationId = props.organizationId;
    inv.email = email;
    inv.role = props.role;
    inv.token = props.token;
    inv.invitedByUserId = props.invitedByUserId;
    inv.expiresAt =
      props.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    inv.acceptedAt = null;
    inv.acceptedUserId = null;
    inv.revokedAt = null;
    return inv;
  }

  /** Mark this invitation as accepted by the freshly-created user. */
  accept(userId: string, at: Date = new Date()): void {
    UserInvitation.validateUuid('acceptedUserId', userId);
    if (this.acceptedAt !== null) {
      throw new InvitationStateError('INVITATION_ALREADY_ACCEPTED');
    }
    if (this.revokedAt !== null) {
      throw new InvitationStateError('INVITATION_REVOKED');
    }
    if (this.isExpiredAt(at)) {
      throw new InvitationStateError('INVITATION_EXPIRED');
    }
    this.acceptedAt = at;
    this.acceptedUserId = userId;
  }

  revoke(at: Date = new Date()): void {
    if (this.acceptedAt !== null) {
      throw new InvitationStateError('INVITATION_ALREADY_ACCEPTED');
    }
    if (this.revokedAt !== null) {
      // Idempotent — second revoke is a no-op.
      return;
    }
    this.revokedAt = at;
  }

  status(now: Date = new Date()): InvitationStatus {
    if (this.acceptedAt !== null) return 'accepted';
    if (this.revokedAt !== null) return 'revoked';
    if (this.isExpiredAt(now)) return 'expired';
    return 'pending';
  }

  isExpiredAt(at: Date): boolean {
    return this.expiresAt.getTime() <= at.getTime();
  }

  private static validateUuid(field: string, value: string): void {
    if (typeof value !== 'string' || !UUID_RX.test(value)) {
      throw new Error(`UserInvitation.${field} must be a UUID; got "${value}"`);
    }
  }

  private static validateRole(role: UserRole): void {
    if (!USER_ROLES.includes(role)) {
      throw new Error(
        `UserInvitation.role must be one of ${USER_ROLES.join(', ')}; got "${role}"`,
      );
    }
  }

  private static validateToken(token: string): void {
    if (typeof token !== 'string' || !TOKEN_RX.test(token)) {
      throw new Error(
        'UserInvitation.token must be a 64-char hex string (crypto.randomBytes(32).toString("hex"))',
      );
    }
  }

  private static normaliseEmail(email: string): string {
    if (typeof email !== 'string' || !EMAIL_RX.test(email.trim())) {
      throw new Error(
        `UserInvitation.email is not a valid email address; got "${email}"`,
      );
    }
    return email.trim().toLowerCase();
  }
}

export type InvitationStateErrorCode =
  | 'INVITATION_ALREADY_ACCEPTED'
  | 'INVITATION_REVOKED'
  | 'INVITATION_EXPIRED';

export class InvitationStateError extends Error {
  constructor(public readonly code: InvitationStateErrorCode) {
    super(code);
    this.name = 'InvitationStateError';
  }
}
