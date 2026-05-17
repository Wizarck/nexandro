import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * M2 Wave 1.13 — m2-mcp-write-capabilities: per-capability kill-switch guard.
 *
 * Behaviour:
 *   - Pass-through when `req.agentContext?.viaAgent !== true` (UI/REST
 *     traffic ignores all agent flags).
 *   - When agent traffic carries `req.agentContext.capabilityName`, look up
 *     the env var `NEXANDRO_AGENT_<NAMESPACE>_<OP>_ENABLED` (transformed
 *     from the capability dot-notation). Default is `false` (disabled).
 *   - Disabled → throw `ServiceUnavailableException` with
 *     `code: AGENT_CAPABILITY_DISABLED`. The middleware does NOT emit any
 *     audit row for the rejected request (the rejection itself is the
 *     telemetry signal — operators can monitor 503 rates per capability).
 *
 * Order: wired globally; runs AFTER JwtAuthGuard + RolesGuard so unauthorised
 * requests still 401/403 first.
 *
 * Capability → env var transformation:
 *   `recipes.create`        → `NEXANDRO_AGENT_RECIPES_CREATE_ENABLED`
 *   `iam.users.changePassword` → `NEXANDRO_AGENT_IAM_USERS_CHANGE_PASSWORD_ENABLED`
 *   `supplier-items.promotePreferred` → `NEXANDRO_AGENT_SUPPLIER_ITEMS_PROMOTE_PREFERRED_ENABLED`
 */
@Injectable()
export class AgentCapabilityGuard implements CanActivate {
  private readonly logger = new Logger(AgentCapabilityGuard.name);

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (req.agentContext?.viaAgent !== true) {
      return true;
    }
    const capability = req.agentContext.capabilityName;
    if (!capability) {
      // Agent traffic without a declared capability — pass through. Audit
      // already records `viaAgent=true, capabilityName=null`. This handles
      // legacy clients that haven't set X-Agent-Capability yet.
      return true;
    }
    const envName = capabilityToEnvVar(capability);
    const enabled = readBoolFlag(envName);
    if (!enabled) {
      this.logger.warn(
        `agent.capability.rejected: capability=${capability} envVar=${envName} viaAgent=true`,
      );
      throw new ServiceUnavailableException({
        code: 'AGENT_CAPABILITY_DISABLED',
        message: `Agent capability '${capability}' is disabled. Set ${envName}=true to enable.`,
        capability,
      });
    }
    return true;
  }
}

/** Pure helper — exported for tests. */
export function capabilityToEnvVar(capability: string): string {
  const upper = capability
    .replace(/[.\-]/g, '_')
    .replace(/([A-Z])/g, '_$1')
    .toUpperCase()
    .replace(/__+/g, '_');
  return `NEXANDRO_AGENT_${upper}_ENABLED`;
}

function readBoolFlag(name: string): boolean {
  const raw = process.env[name];
  if (raw === undefined) return false;
  const normalised = String(raw).trim().toLowerCase();
  return normalised === 'true' || normalised === '1' || normalised === 'yes';
}
