import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../iam/domain/user.entity';
import { ROLES_METADATA_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUserPayload, RolesGuard } from './roles.guard';

function makeCtx(user: AuthenticatedUserPayload | undefined, _required: UserRole[] | undefined): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

function makeReflector(required: UserRole[] | undefined): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('allows when no @Roles is set', () => {
    const guard = new RolesGuard(makeReflector(undefined));
    expect(guard.canActivate(makeCtx({ userId: 'u', organizationId: 'o', role: 'STAFF' }, undefined))).toBe(true);
  });

  it('throws Unauthorized when user is missing', () => {
    const guard = new RolesGuard(makeReflector(['OWNER']));
    expect(() => guard.canActivate(makeCtx(undefined, ['OWNER']))).toThrow(UnauthorizedException);
  });

  describe('OWNER-only endpoint (currency change, settings)', () => {
    const guard = new RolesGuard(makeReflector(['OWNER']));
    it.each<[UserRole, boolean]>([
      ['OWNER', true],
      ['MANAGER', false],
      ['STAFF', false],
    ])('role %s → allowed=%s', (role, allowed) => {
      const ctx = makeCtx({ userId: 'u', organizationId: 'o', role }, ['OWNER']);
      if (allowed) {
        expect(guard.canActivate(ctx)).toBe(true);
      } else {
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      }
    });
  });

  describe('OWNER+MANAGER endpoint (CRUD ingredients, suppliers)', () => {
    const guard = new RolesGuard(makeReflector(['OWNER', 'MANAGER']));
    it.each<[UserRole, boolean]>([
      ['OWNER', true],
      ['MANAGER', true],
      ['STAFF', false],
    ])('role %s → allowed=%s', (role, allowed) => {
      const ctx = makeCtx({ userId: 'u', organizationId: 'o', role }, ['OWNER', 'MANAGER']);
      if (allowed) {
        expect(guard.canActivate(ctx)).toBe(true);
      } else {
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      }
    });
  });

  describe('STAFF-readable endpoint (list ingredients, recipes)', () => {
    const guard = new RolesGuard(makeReflector(['OWNER', 'MANAGER', 'STAFF']));
    it.each<UserRole>(['OWNER', 'MANAGER', 'STAFF'])('role %s allowed', (role) => {
      const ctx = makeCtx({ userId: 'u', organizationId: 'o', role }, ['OWNER', 'MANAGER', 'STAFF']);
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});

describe('@Roles metadata key', () => {
  it('uses the canonical metadata key (RolesGuard reads this exact key)', () => {
    expect(ROLES_METADATA_KEY).toBe('nexandro:roles');
  });
});
