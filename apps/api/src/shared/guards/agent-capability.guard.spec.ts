import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import {
  AgentCapabilityGuard,
  capabilityToEnvVar,
} from './agent-capability.guard';

function makeCtx(req: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req as Request }),
    getHandler: () => () => {},
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('capabilityToEnvVar', () => {
  it('transforms namespace.op into UPPER_SNAKE env var', () => {
    expect(capabilityToEnvVar('recipes.create')).toBe(
      'NEXANDRO_AGENT_RECIPES_CREATE_ENABLED',
    );
  });

  it('handles dotted nested namespaces', () => {
    expect(capabilityToEnvVar('iam.users.create')).toBe(
      'NEXANDRO_AGENT_IAM_USERS_CREATE_ENABLED',
    );
  });

  it('handles dashes (supplier-items)', () => {
    expect(capabilityToEnvVar('supplier-items.create')).toBe(
      'NEXANDRO_AGENT_SUPPLIER_ITEMS_CREATE_ENABLED',
    );
  });

  it('splits camelCase ops (changePassword → CHANGE_PASSWORD)', () => {
    expect(capabilityToEnvVar('iam.users.changePassword')).toBe(
      'NEXANDRO_AGENT_IAM_USERS_CHANGE_PASSWORD_ENABLED',
    );
  });

  it('splits camelCase compound ops (promotePreferred → PROMOTE_PREFERRED)', () => {
    expect(capabilityToEnvVar('supplier-items.promotePreferred')).toBe(
      'NEXANDRO_AGENT_SUPPLIER_ITEMS_PROMOTE_PREFERRED_ENABLED',
    );
  });
});

describe('AgentCapabilityGuard', () => {
  const guard = new AgentCapabilityGuard();
  const FLAG = 'NEXANDRO_AGENT_RECIPES_CREATE_ENABLED';

  beforeEach(() => {
    delete process.env[FLAG];
  });

  it('passes through non-agent traffic regardless of flag value', () => {
    process.env[FLAG] = 'false';
    const ctx = makeCtx({ agentContext: undefined });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('passes agent traffic with no capabilityName declared', () => {
    const ctx = makeCtx({
      agentContext: { viaAgent: true, agentName: 'x', capabilityName: null },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws 503 when capability flag is unset (default disabled)', () => {
    const ctx = makeCtx({
      agentContext: {
        viaAgent: true,
        agentName: 'claude',
        capabilityName: 'recipes.create',
      },
    });
    expect(() => guard.canActivate(ctx)).toThrow(ServiceUnavailableException);
  });

  it('throws 503 when capability flag is "false"', () => {
    process.env[FLAG] = 'false';
    const ctx = makeCtx({
      agentContext: {
        viaAgent: true,
        agentName: 'claude',
        capabilityName: 'recipes.create',
      },
    });
    expect(() => guard.canActivate(ctx)).toThrow(ServiceUnavailableException);
  });

  it('passes when capability flag is "true"', () => {
    process.env[FLAG] = 'true';
    const ctx = makeCtx({
      agentContext: {
        viaAgent: true,
        agentName: 'claude',
        capabilityName: 'recipes.create',
      },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('accepts truthy variants ("1", "yes", "TRUE")', () => {
    const ctx = makeCtx({
      agentContext: {
        viaAgent: true,
        agentName: 'claude',
        capabilityName: 'recipes.create',
      },
    });
    for (const v of ['1', 'yes', 'TRUE', 'True']) {
      process.env[FLAG] = v;
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('thrown 503 carries AGENT_CAPABILITY_DISABLED code', () => {
    const ctx = makeCtx({
      agentContext: {
        viaAgent: true,
        agentName: 'claude',
        capabilityName: 'recipes.create',
      },
    });
    try {
      guard.canActivate(ctx);
      fail('expected ServiceUnavailableException');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      const response = (err as ServiceUnavailableException).getResponse() as {
        code?: string;
        capability?: string;
      };
      expect(response.code).toBe('AGENT_CAPABILITY_DISABLED');
      expect(response.capability).toBe('recipes.create');
    }
  });
});
