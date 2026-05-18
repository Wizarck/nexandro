import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { DataSource } from 'typeorm';
import { Organization } from '../../domain/organization.entity';
import { User } from '../../domain/user.entity';
import { EmailService } from '../../../shared/email/email.service';
import { UserInvitation } from '../domain/user-invitation.entity';
import { UserInvitationRepository } from '../infrastructure/user-invitation.repository';
import { InvitationService } from './invitation.service';

/**
 * Sprint 4 W2-2a — InvitationService unit specs.
 *
 * Pattern mirrors `agent-credentials.service.spec.ts`: hand-rolled
 * jest mocks for the repo + email + DataSource collaborators, then
 * direct `new InvitationService(...)` (no NestJS testing module — the
 * service has no Nest-side state to wire). The transactional `accept`
 * path is covered by a `dataSource.transaction(cb)` mock that hands the
 * callback a fake `EntityManager` whose `findOne` / `save` are scriptable
 * per test.
 */

const ORG_A = '11111111-1111-4111-8111-111111111111';
const INVITER_ID = '22222222-2222-4222-8222-222222222222';
const ACCEPTING_USER_ID = '33333333-3333-4333-8333-333333333333';
const VALID_TOKEN = 'a'.repeat(64);

function makeRepo(): jest.Mocked<UserInvitationRepository> {
  return {
    findLiveByOrgAndEmail: jest.fn(),
    findPendingByOrg: jest.fn(),
    findByToken: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<UserInvitationRepository>;
}

function makeEmail(): jest.Mocked<EmailService> {
  return {
    sendInvitation: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<EmailService>;
}

interface TxManagerScript {
  invitation?: UserInvitation | null;
  existingUser?: User | null;
  /** Throw from `mgr.save(User)` (e.g. simulate duplicate index race). */
  saveUserError?: Error;
}

/**
 * Build a DataSource whose `transaction(cb)` resolves `cb(mgr)` where
 * `mgr` is a scriptable EntityManager. `createEntityManager()` returns
 * a separate manager used by `resolveOrgAndInviter()`.
 */
function makeDataSource(
  txScript: TxManagerScript = {},
  orgInfo: { orgName?: string; inviterName?: string } = {},
): {
  ds: jest.Mocked<DataSource>;
  txMgr: { findOne: jest.Mock; save: jest.Mock };
  resolveMgr: { findOne: jest.Mock };
} {
  const txMgr = {
    findOne: jest.fn().mockImplementation(async (target: unknown) => {
      if (target === UserInvitation) {
        return txScript.invitation ?? null;
      }
      if (target === User) {
        return txScript.existingUser ?? null;
      }
      return null;
    }),
    save: jest.fn().mockImplementation(async (entity: unknown) => {
      if (txScript.saveUserError && entity instanceof User) {
        throw txScript.saveUserError;
      }
      return entity;
    }),
  };

  const resolveMgr = {
    findOne: jest.fn().mockImplementation(async (target: unknown) => {
      if (target === Organization) {
        if (orgInfo.orgName === undefined) return null;
        return { name: orgInfo.orgName } as Partial<Organization>;
      }
      if (target === User) {
        if (orgInfo.inviterName === undefined) return null;
        return { name: orgInfo.inviterName } as Partial<User>;
      }
      return null;
    }),
  };

  const ds = {
    transaction: jest.fn().mockImplementation(async (cb: unknown) => {
      const callback = cb as (mgr: unknown) => Promise<unknown>;
      return callback(txMgr);
    }),
    createEntityManager: jest.fn().mockReturnValue(resolveMgr),
  } as unknown as jest.Mocked<DataSource>;

  return { ds, txMgr, resolveMgr };
}

function makeInvitation(
  overrides: Partial<{
    token: string;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
  }> = {},
): UserInvitation {
  const inv = UserInvitation.create({
    organizationId: ORG_A,
    email: 'staff@example.com',
    role: 'STAFF',
    token: overrides.token ?? VALID_TOKEN,
    invitedByUserId: INVITER_ID,
    expiresAt: overrides.expiresAt,
  });
  inv.createdAt = new Date();
  if (overrides.acceptedAt !== undefined) {
    inv.acceptedAt = overrides.acceptedAt;
    inv.acceptedUserId = ACCEPTING_USER_ID;
  }
  if (overrides.revokedAt !== undefined) {
    inv.revokedAt = overrides.revokedAt;
  }
  return inv;
}

describe('InvitationService — create()', () => {
  it('generates a 64-char hex token, sets expiresAt ~7 days out, and persists', async () => {
    const repo = makeRepo();
    repo.findLiveByOrgAndEmail.mockResolvedValue(null);
    repo.save.mockImplementation(async (inv) => inv as UserInvitation);
    const email = makeEmail();
    const { ds } = makeDataSource({}, { orgName: 'Acme', inviterName: 'Owner Olga' });
    const svc = new InvitationService(ds, repo, email);

    const before = Date.now();
    const created = await svc.create({
      organizationId: ORG_A,
      invitedByUserId: INVITER_ID,
      email: 'NEW.staff@example.com',
      role: 'STAFF',
    });
    const after = Date.now();

    expect(created.token).toMatch(/^[0-9a-f]{64}$/);
    expect(created.email).toBe('new.staff@example.com');
    expect(created.role).toBe('STAFF');
    expect(created.organizationId).toBe(ORG_A);
    expect(created.invitedByUserId).toBe(INVITER_ID);
    expect(created.acceptedAt).toBeNull();
    expect(created.revokedAt).toBeNull();

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const expectedMin = before + SEVEN_DAYS_MS - 1_000;
    const expectedMax = after + SEVEN_DAYS_MS + 1_000;
    expect(created.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(created.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);

    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('dispatches the invitation email with the accept URL embedding the freshly-generated token', async () => {
    const repo = makeRepo();
    repo.findLiveByOrgAndEmail.mockResolvedValue(null);
    repo.save.mockImplementation(async (inv) => inv as UserInvitation);
    const email = makeEmail();
    const { ds } = makeDataSource({}, { orgName: 'Acme S.L.', inviterName: 'Owner Olga' });
    const svc = new InvitationService(ds, repo, email);

    const created = await svc.create({
      organizationId: ORG_A,
      invitedByUserId: INVITER_ID,
      email: 'staff@example.com',
      role: 'MANAGER',
    });

    expect(email.sendInvitation).toHaveBeenCalledTimes(1);
    const [to, acceptUrl, role, orgName, invitedByName] =
      email.sendInvitation.mock.calls[0];
    expect(to).toBe('staff@example.com');
    expect(acceptUrl).toContain(created.token);
    expect(role).toBe('MANAGER');
    expect(orgName).toBe('Acme S.L.');
    expect(invitedByName).toBe('Owner Olga');
  });

  it('rejects with ConflictException INVITATION_ALREADY_PENDING when a live invite exists for (org, email)', async () => {
    const repo = makeRepo();
    repo.findLiveByOrgAndEmail.mockResolvedValue(makeInvitation());
    const email = makeEmail();
    const { ds } = makeDataSource();
    const svc = new InvitationService(ds, repo, email);

    await expect(
      svc.create({
        organizationId: ORG_A,
        invitedByUserId: INVITER_ID,
        email: 'staff@example.com',
        role: 'STAFF',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(repo.save).not.toHaveBeenCalled();
    expect(email.sendInvitation).not.toHaveBeenCalled();
  });

  it('still persists the invitation even when email dispatch throws (best-effort send)', async () => {
    const repo = makeRepo();
    repo.findLiveByOrgAndEmail.mockResolvedValue(null);
    repo.save.mockImplementation(async (inv) => inv as UserInvitation);
    const email = makeEmail();
    email.sendInvitation.mockRejectedValue(new Error('SMTP outage'));
    const { ds } = makeDataSource({}, { orgName: 'Acme', inviterName: 'Owner Olga' });
    const svc = new InvitationService(ds, repo, email);

    const created = await svc.create({
      organizationId: ORG_A,
      invitedByUserId: INVITER_ID,
      email: 'staff@example.com',
      role: 'STAFF',
    });

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(email.sendInvitation).toHaveBeenCalledTimes(1);
  });
});

describe('InvitationService — listPending()', () => {
  it('delegates to repo.findPendingByOrg scoped to the calling org', async () => {
    const repo = makeRepo();
    const row = makeInvitation();
    repo.findPendingByOrg.mockResolvedValue([row]);
    const svc = new InvitationService(makeDataSource().ds, repo, makeEmail());

    const rows = await svc.listPending(ORG_A);
    expect(rows).toEqual([row]);
    expect(repo.findPendingByOrg).toHaveBeenCalledWith(ORG_A);
  });
});

describe('InvitationService — lookupByToken()', () => {
  it('returns metadata for a valid pending token', async () => {
    const inv = makeInvitation();
    const repo = makeRepo();
    repo.findByToken.mockResolvedValue(inv);
    const { ds } = makeDataSource({}, { orgName: 'Acme', inviterName: 'Owner Olga' });
    const svc = new InvitationService(ds, repo, makeEmail());

    const lookup = await svc.lookupByToken(inv.token);
    expect(lookup).toEqual({
      email: inv.email,
      role: inv.role,
      orgName: 'Acme',
      invitedByName: 'Owner Olga',
      expiresAt: inv.expiresAt,
    });
    expect(repo.findByToken).toHaveBeenCalledWith(inv.token);
  });

  it('falls back to friendly defaults when org / inviter rows are missing', async () => {
    const inv = makeInvitation();
    const repo = makeRepo();
    repo.findByToken.mockResolvedValue(inv);
    const { ds } = makeDataSource({}, {}); // no orgInfo
    const svc = new InvitationService(ds, repo, makeEmail());

    const lookup = await svc.lookupByToken(inv.token);
    expect(lookup.orgName).toBe('tu organización');
    expect(lookup.invitedByName).toBe('Un compañero');
  });

  it('throws NotFoundException for an unknown token', async () => {
    const repo = makeRepo();
    repo.findByToken.mockResolvedValue(null);
    const svc = new InvitationService(makeDataSource().ds, repo, makeEmail());

    await expect(svc.lookupByToken(VALID_TOKEN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException for malformed token shapes (no DB hit)', async () => {
    const repo = makeRepo();
    const svc = new InvitationService(makeDataSource().ds, repo, makeEmail());

    await expect(svc.lookupByToken('not-hex')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.lookupByToken('a'.repeat(63))).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findByToken).not.toHaveBeenCalled();
  });

  it('throws NotFoundException (uniform 404) for revoked tokens', async () => {
    const revoked = makeInvitation({ revokedAt: new Date() });
    const repo = makeRepo();
    repo.findByToken.mockResolvedValue(revoked);
    const svc = new InvitationService(makeDataSource().ds, repo, makeEmail());

    await expect(svc.lookupByToken(revoked.token)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException (uniform 404) for expired tokens', async () => {
    const expired = makeInvitation({
      expiresAt: new Date(Date.now() - 60_000),
    });
    const repo = makeRepo();
    repo.findByToken.mockResolvedValue(expired);
    const svc = new InvitationService(makeDataSource().ds, repo, makeEmail());

    await expect(svc.lookupByToken(expired.token)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('InvitationService — accept()', () => {
  it('happy path: bcrypt-hashes the password, INSERTs the user, marks the invitation accepted', async () => {
    const inv = makeInvitation();
    const repo = makeRepo();
    const { ds, txMgr } = makeDataSource({ invitation: inv });
    const svc = new InvitationService(ds, repo, makeEmail());

    const result = await svc.accept({
      token: inv.token,
      password: 'super-secret-pw',
      name: '  New Staffer ',
    });

    expect(result.user.email).toBe('staff@example.com');
    expect(result.user.organizationId).toBe(ORG_A);
    expect(result.user.name).toBe('New Staffer'); // trimmed
    expect(result.user.role).toBe('STAFF');
    expect(result.session).toEqual({
      kind: 'placeholder',
      message: expect.stringContaining('R8'),
    });

    // bcrypt hash was generated at cost 12 and persisted on the user.
    const savedUser = txMgr.save.mock.calls.find(
      ([entity]) => entity instanceof User,
    )?.[0] as User;
    expect(savedUser.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    await expect(
      bcrypt.compare('super-secret-pw', savedUser.passwordHash),
    ).resolves.toBe(true);

    // Invitation row was saved with acceptedAt set.
    expect(inv.acceptedAt).toBeInstanceOf(Date);
    expect(inv.acceptedUserId).toBe(savedUser.id);
  });

  it('falls back to the email local-part when no display name is supplied', async () => {
    const inv = makeInvitation();
    const repo = makeRepo();
    const { ds, txMgr } = makeDataSource({ invitation: inv });
    const svc = new InvitationService(ds, repo, makeEmail());

    const result = await svc.accept({
      token: inv.token,
      password: 'super-secret-pw',
    });

    expect(result.user.name).toBe('staff'); // local-part of staff@example.com
    const savedUser = txMgr.save.mock.calls.find(
      ([entity]) => entity instanceof User,
    )?.[0] as User;
    expect(savedUser.name).toBe('staff');
  });

  it('rejects with BadRequestException PASSWORD_TOO_SHORT when password < 8 chars', async () => {
    const repo = makeRepo();
    const { ds } = makeDataSource({ invitation: makeInvitation() });
    const svc = new InvitationService(ds, repo, makeEmail());

    await expect(
      svc.accept({ token: VALID_TOKEN, password: 'short' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Transaction should never even start.
    expect(ds.transaction).not.toHaveBeenCalled();
  });

  it('rejects with NotFoundException for malformed token shapes (no DB hit)', async () => {
    const repo = makeRepo();
    const { ds } = makeDataSource();
    const svc = new InvitationService(ds, repo, makeEmail());

    await expect(
      svc.accept({ token: 'not-hex', password: 'super-secret-pw' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(ds.transaction).not.toHaveBeenCalled();
  });

  it('rejects with NotFoundException when the token is unknown inside the transaction', async () => {
    const repo = makeRepo();
    const { ds } = makeDataSource({ invitation: null });
    const svc = new InvitationService(ds, repo, makeEmail());

    await expect(
      svc.accept({ token: VALID_TOKEN, password: 'super-secret-pw' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects with ConflictException INVITATION_ALREADY_ACCEPTED when invitation was previously accepted', async () => {
    const accepted = makeInvitation({ acceptedAt: new Date(Date.now() - 60_000) });
    const repo = makeRepo();
    const { ds, txMgr } = makeDataSource({ invitation: accepted });
    const svc = new InvitationService(ds, repo, makeEmail());

    await expect(
      svc.accept({ token: accepted.token, password: 'super-secret-pw' }),
    ).rejects.toMatchObject({
      response: { code: 'INVITATION_ALREADY_ACCEPTED' },
    });
    // No user save attempted.
    expect(
      txMgr.save.mock.calls.find(([entity]) => entity instanceof User),
    ).toBeUndefined();
  });

  it('rejects with ConflictException INVITATION_REVOKED when invitation was revoked', async () => {
    const revoked = makeInvitation({ revokedAt: new Date(Date.now() - 60_000) });
    const repo = makeRepo();
    const { ds } = makeDataSource({ invitation: revoked });
    const svc = new InvitationService(ds, repo, makeEmail());

    await expect(
      svc.accept({ token: revoked.token, password: 'super-secret-pw' }),
    ).rejects.toMatchObject({
      response: { code: 'INVITATION_REVOKED' },
    });
  });

  it('rejects with ConflictException INVITATION_EXPIRED when expiresAt has passed', async () => {
    const expired = makeInvitation({
      expiresAt: new Date(Date.now() - 60_000),
    });
    const repo = makeRepo();
    const { ds } = makeDataSource({ invitation: expired });
    const svc = new InvitationService(ds, repo, makeEmail());

    await expect(
      svc.accept({ token: expired.token, password: 'super-secret-pw' }),
    ).rejects.toMatchObject({
      response: { code: 'INVITATION_EXPIRED' },
    });
  });

  it('rejects with ConflictException USER_EMAIL_DUPLICATE when a user with that email already exists in the org', async () => {
    const inv = makeInvitation();
    const existing = User.create({
      organizationId: ORG_A,
      name: 'Existing',
      email: 'staff@example.com',
      passwordHash: '$2b$12$KIXMHnFdTsHHBMmEJYRzKePQGyDOuxF7vSj.O5kmaYxLHJyxeBoAi',
      role: 'STAFF',
    });
    const repo = makeRepo();
    const { ds, txMgr } = makeDataSource({ invitation: inv, existingUser: existing });
    const svc = new InvitationService(ds, repo, makeEmail());

    await expect(
      svc.accept({ token: inv.token, password: 'super-secret-pw' }),
    ).rejects.toMatchObject({
      response: { code: 'USER_EMAIL_DUPLICATE' },
    });
    // No INSERT for the new user.
    expect(
      txMgr.save.mock.calls.find(
        ([entity]) => entity instanceof User && (entity as User).id !== existing.id,
      ),
    ).toBeUndefined();
  });
});

describe('InvitationService — revoke()', () => {
  it('sets revokedAt and persists the row', async () => {
    const inv = makeInvitation();
    const repo = makeRepo();
    repo.findOneBy.mockResolvedValue(inv);
    repo.save.mockImplementation(async (i) => i as UserInvitation);
    const svc = new InvitationService(makeDataSource().ds, repo, makeEmail());

    const before = Date.now();
    const revoked = await svc.revoke(inv.id, ORG_A);
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    expect(revoked.revokedAt!.getTime()).toBeGreaterThanOrEqual(before - 1_000);
    expect(repo.save).toHaveBeenCalledWith(inv);
  });

  it('is idempotent: a second revoke leaves the original revokedAt timestamp untouched', async () => {
    const inv = makeInvitation();
    const initialRevoke = new Date(Date.now() - 10_000);
    inv.revoke(initialRevoke);
    const repo = makeRepo();
    repo.findOneBy.mockResolvedValue(inv);
    repo.save.mockImplementation(async (i) => i as UserInvitation);
    const svc = new InvitationService(makeDataSource().ds, repo, makeEmail());

    const updated = await svc.revoke(inv.id, ORG_A);
    expect(updated.revokedAt).toEqual(initialRevoke);
  });

  it('throws NotFoundException when the id is unknown', async () => {
    const repo = makeRepo();
    repo.findOneBy.mockResolvedValue(null);
    const svc = new InvitationService(makeDataSource().ds, repo, makeEmail());

    await expect(
      svc.revoke('99999999-9999-4999-8999-999999999999', ORG_A),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException on org-scope mismatch (no existence leak)', async () => {
    const inv = makeInvitation();
    const repo = makeRepo();
    repo.findOneBy.mockResolvedValue(inv);
    const svc = new InvitationService(makeDataSource().ds, repo, makeEmail());

    await expect(
      svc.revoke(inv.id, '88888888-8888-4888-8888-888888888888'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects with ConflictException INVITATION_ALREADY_ACCEPTED on a row that was already accepted', async () => {
    const accepted = makeInvitation({ acceptedAt: new Date() });
    const repo = makeRepo();
    repo.findOneBy.mockResolvedValue(accepted);
    const svc = new InvitationService(makeDataSource().ds, repo, makeEmail());

    await expect(svc.revoke(accepted.id, ORG_A)).rejects.toMatchObject({
      response: { code: 'INVITATION_ALREADY_ACCEPTED' },
    });
  });
});

describe('InvitationService — state machine guards', () => {
  it('does NOT allow revoke -> accept transition (accept rejects with INVITATION_REVOKED)', async () => {
    const inv = makeInvitation({ revokedAt: new Date(Date.now() - 60_000) });
    const repo = makeRepo();
    const { ds } = makeDataSource({ invitation: inv });
    const svc = new InvitationService(ds, repo, makeEmail());

    await expect(
      svc.accept({ token: inv.token, password: 'super-secret-pw' }),
    ).rejects.toMatchObject({ response: { code: 'INVITATION_REVOKED' } });
  });

  it('does NOT allow accept -> revoke transition (revoke rejects with INVITATION_ALREADY_ACCEPTED)', async () => {
    const inv = makeInvitation({ acceptedAt: new Date(Date.now() - 60_000) });
    const repo = makeRepo();
    repo.findOneBy.mockResolvedValue(inv);
    const svc = new InvitationService(makeDataSource().ds, repo, makeEmail());

    await expect(svc.revoke(inv.id, ORG_A)).rejects.toMatchObject({
      response: { code: 'INVITATION_ALREADY_ACCEPTED' },
    });
  });
});
