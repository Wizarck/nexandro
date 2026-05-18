import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { Organization } from '../../domain/organization.entity';
import { User, UserRole } from '../../domain/user.entity';
import { EmailService } from '../../../shared/email/email.service';
import {
  InvitationStateError,
  UserInvitation,
} from '../domain/user-invitation.entity';
import { UserInvitationRepository } from '../infrastructure/user-invitation.repository';

const BCRYPT_COST = 12;
const INVITATION_TTL_DAYS = 7;
const TOKEN_BYTES = 32;

export interface CreateInvitationInput {
  organizationId: string;
  invitedByUserId: string;
  email: string;
  role: UserRole;
}

export interface AcceptInvitationInput {
  token: string;
  password: string;
  /** Optional display name for the freshly-created user. Falls back to the local-part of the email. */
  name?: string;
}

export interface InvitationLookup {
  email: string;
  role: UserRole;
  orgName: string;
  invitedByName: string;
  expiresAt: Date;
}

export interface InvitationAcceptResult {
  user: {
    id: string;
    organizationId: string;
    name: string;
    email: string;
    role: UserRole;
  };
  /**
   * R8 placeholder. The real session/JWT pipeline is not yet implemented
   * in the API; once it ships the controller will swap this stub for a
   * real session payload. Keeping the field so the W2-2b frontend code
   * already wires through it.
   */
  session: { kind: 'placeholder'; message: string };
}

/**
 * Sprint 4 W2-2a — invitation application service.
 *
 * Owns the state machine (`create` / `revoke` / `accept`) and the
 * transactional `accept` flow that materialises a new `users` row in
 * the same DB transaction as the invitation update.
 *
 * The token is generated with `crypto.randomBytes(32).toString('hex')`
 * (256 bits, 64 hex chars) and persisted ONLY in `user_invitations`.
 * The controller MUST NOT echo it back in any HTTP response — see the
 * controller spec which guards this.
 */
@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly invitations: UserInvitationRepository,
    private readonly email: EmailService,
  ) {}

  /**
   * Create + persist an invitation, then dispatch the email.
   * Surfaces a 409 if there's already a live (pending) invitation for
   * the same (org, email).
   */
  async create(input: CreateInvitationInput): Promise<UserInvitation> {
    const live = await this.invitations.findLiveByOrgAndEmail(
      input.organizationId,
      input.email,
    );
    if (live) {
      throw new ConflictException({
        code: 'INVITATION_ALREADY_PENDING',
        message:
          'A pending invitation already exists for this email in this organization. Revoke it before issuing a new one.',
      });
    }

    // Pre-flight tenant check via the existing users repo would require a
    // circular import; instead, the DB-level unique users index will
    // surface a duplicate downstream on `accept`. The invite stays valid
    // and the accept call returns a clean 409 in that branch.

    const token = randomBytes(TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(
      Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const inv = UserInvitation.create({
      organizationId: input.organizationId,
      email: input.email,
      role: input.role,
      token,
      invitedByUserId: input.invitedByUserId,
      expiresAt,
    });

    const saved = await this.invitations.save(inv);

    // Email dispatch is best-effort. A failed send leaves the row in
    // place so the Owner can re-trigger via the UI in a follow-up slice
    // (W2-2c: "resend invitation"). For now, log and swallow so a
    // transient SMTP outage doesn't 500 the create call.
    try {
      const { orgName, invitedByName } = await this.resolveOrgAndInviter(
        saved.organizationId,
        saved.invitedByUserId,
      );
      const acceptUrl = buildAcceptUrl(token);
      await this.email.sendInvitation(
        saved.email,
        acceptUrl,
        saved.role,
        orgName,
        invitedByName,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to dispatch invitation email for ${saved.id}: ${(err as Error).message}. Row is persisted; Owner can resend later.`,
      );
    }

    return saved;
  }

  async listPending(organizationId: string): Promise<UserInvitation[]> {
    return this.invitations.findPendingByOrg(organizationId);
  }

  async revoke(id: string, organizationId: string): Promise<UserInvitation> {
    const inv = await this.invitations.findOneBy({ id });
    if (!inv || inv.organizationId !== organizationId) {
      throw new NotFoundException({ code: 'INVITATION_NOT_FOUND' });
    }
    try {
      inv.revoke();
    } catch (err) {
      if (err instanceof InvitationStateError) {
        throw new ConflictException({ code: err.code });
      }
      throw err;
    }
    return this.invitations.save(inv);
  }

  /**
   * Unauthenticated metadata read for the accept page. Returns minimal
   * info needed to render the welcome screen; returns 404 when the
   * token is unknown, revoked, accepted, or expired — never leak which
   * one.
   */
  async lookupByToken(token: string): Promise<InvitationLookup> {
    if (!isValidTokenShape(token)) {
      // Same response as a real miss — don't help token-shape probing.
      throw new NotFoundException({ code: 'INVITATION_NOT_FOUND' });
    }
    const inv = await this.invitations.findByToken(token);
    if (!inv || inv.status() !== 'pending') {
      throw new NotFoundException({ code: 'INVITATION_NOT_FOUND' });
    }
    const { orgName, invitedByName } = await this.resolveOrgAndInviter(
      inv.organizationId,
      inv.invitedByUserId,
    );
    return {
      email: inv.email,
      role: inv.role,
      orgName,
      invitedByName,
      expiresAt: inv.expiresAt,
    };
  }

  /**
   * Accept the invitation. Runs in a single transaction:
   *   1. Re-load the invitation under lock.
   *   2. Validate status (pending only).
   *   3. INSERT the user (bcrypt-hashed password).
   *   4. UPDATE the invitation with accepted_at + accepted_user_id.
   *
   * Returns the user + a placeholder session. Real auth/JWT issuance
   * lands with R8 (DemoAuthMiddleware replacement); until then the W2-2b
   * frontend handles the "now log in" handoff.
   */
  async accept(input: AcceptInvitationInput): Promise<InvitationAcceptResult> {
    if (!isValidTokenShape(input.token)) {
      throw new NotFoundException({ code: 'INVITATION_NOT_FOUND' });
    }
    if (typeof input.password !== 'string' || input.password.length < 8) {
      throw new BadRequestException({
        code: 'PASSWORD_TOO_SHORT',
        message: 'Password must be at least 8 characters long.',
      });
    }

    return this.dataSource.transaction(async (mgr) => {
      const inv = await mgr.findOne(UserInvitation, {
        where: { token: input.token },
        lock: { mode: 'pessimistic_write' },
      });
      if (!inv) {
        throw new NotFoundException({ code: 'INVITATION_NOT_FOUND' });
      }

      // State validation via the entity helper. The error codes map 1:1
      // to HTTP 409 so the frontend can render a precise message.
      try {
        // We need to validate up-front (without mutating) to surface
        // the right code before the user INSERT. The entity's `accept`
        // does both validation + mutation; mirror its checks here so
        // we don't perform a wasted bcrypt hash on a doomed invite.
        if (inv.acceptedAt !== null) {
          throw new InvitationStateError('INVITATION_ALREADY_ACCEPTED');
        }
        if (inv.revokedAt !== null) {
          throw new InvitationStateError('INVITATION_REVOKED');
        }
        if (inv.isExpiredAt(new Date())) {
          throw new InvitationStateError('INVITATION_EXPIRED');
        }
      } catch (err) {
        if (err instanceof InvitationStateError) {
          throw new ConflictException({ code: err.code });
        }
        throw err;
      }

      // Duplicate-user guard. The UNIQUE index on (organization_id,
      // email) in `users` would catch this anyway, but a precise 409
      // beats a Postgres 23505.
      const existing = await mgr.findOne(User, {
        where: { organizationId: inv.organizationId, email: inv.email },
      });
      if (existing) {
        throw new ConflictException({
          code: 'USER_EMAIL_DUPLICATE',
          message:
            'A user with this email already exists in the organization. The invitation cannot be accepted.',
        });
      }

      const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
      const user = User.create({
        organizationId: inv.organizationId,
        name: input.name?.trim() || deriveNameFromEmail(inv.email),
        email: inv.email,
        passwordHash,
        role: inv.role,
      });
      const savedUser = await mgr.save(user);

      inv.accept(savedUser.id);
      await mgr.save(inv);

      return {
        user: {
          id: savedUser.id,
          organizationId: savedUser.organizationId,
          name: savedUser.name,
          email: savedUser.email,
          role: savedUser.role,
        },
        session: {
          kind: 'placeholder',
          message:
            'Real session issuance lands with R8 auth. Until then, log in via the standard flow.',
        },
      };
    });
  }

  private async resolveOrgAndInviter(
    organizationId: string,
    invitedByUserId: string,
  ): Promise<{ orgName: string; invitedByName: string }> {
    const mgr = this.dataSource.createEntityManager();
    const [org, inviter] = await Promise.all([
      mgr.findOne(Organization, { where: { id: organizationId } }),
      mgr.findOne(User, { where: { id: invitedByUserId } }),
    ]);
    return {
      orgName: org?.name ?? 'tu organización',
      invitedByName: inviter?.name ?? 'Un compañero',
    };
  }
}

function isValidTokenShape(token: unknown): token is string {
  return typeof token === 'string' && /^[0-9a-f]{64}$/.test(token);
}

function deriveNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'Nuevo usuario';
  return local.length > 0 ? local : 'Nuevo usuario';
}

/**
 * The frontend accept page lives at `/invitations/accept?token=...`.
 * The base URL is configurable via `NEXANDRO_APP_BASE_URL`; default is
 * the Vite dev server origin so a local Owner can copy the link from
 * the log output without extra config.
 */
function buildAcceptUrl(token: string): string {
  const base = (process.env.NEXANDRO_APP_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/invitations/accept?token=${encodeURIComponent(token)}`;
}
