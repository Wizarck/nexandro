import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request } from 'express';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { AuditEventType } from '../../audit-log/application/types';
import { safeAuditEmit } from '../audit-emit/safe-audit-emit';
import {
  AUDIT_AGGREGATE_KEY,
  AuditAggregateMeta,
} from '../decorators/audit-aggregate.decorator';
import { AuditResolverRegistry } from '../application/audit-resolver-registry';
import { AuthenticatedUserPayload } from '../guards/roles.guard';
import { WriteResponseDto } from '../dto/write-response.dto';

/**
 * M2 Wave 1.13 — m2-mcp-write-capabilities: forensic-grade audit emission
 * for agent-routed writes.
 *
 * Behaviour:
 *   - Skips entirely when `req.agentContext?.viaAgent !== true` (UI/REST
 *     traffic continues to use the lean `AgentAuditMiddleware` from Wave 1.5).
 *   - Skips when the handler lacks `@AuditAggregate(...)` metadata.
 *   - Resolves "before" state via `AuditResolverRegistry` (each BC registers
 *     its `findById` at module bootstrap). Failures fall back to `null`.
 *   - On response success, emits `AGENT_ACTION_FORENSIC` with the
 *     full envelope `{organizationId, aggregateType, aggregateId,
 *     actorUserId, actorKind:'agent', agentName, payloadBefore, payloadAfter}`.
 *     Per ADR-026 (Wave 1.14 m2-audit-log-forensic-split) rich aggregate-anchored
 *     emissions live on this dedicated channel; the lean `AGENT_ACTION_EXECUTED`
 *     channel stays request-anchored from `AgentAuditMiddleware`.
 *   - For create operations (idExtractor=null), `before` is null and
 *     `aggregateId` is extracted from the response payload (`data.id`).
 *   - For delete operations (HTTP 204 / null response), `after` is null.
 *
 * Wired globally via APP_INTERCEPTOR. Order: middleware → guards →
 * IdempotencyMiddleware (if write) → JwtAuthGuard → RolesGuard →
 * AgentCapabilityGuard → THIS interceptor → handler.
 */
@Injectable()
export class BeforeAfterAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(BeforeAfterAuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly events: EventEmitter2,
    private readonly resolvers: AuditResolverRegistry,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (req.agentContext?.viaAgent !== true) {
      return next.handle();
    }

    const meta = this.reflector.get<AuditAggregateMeta | undefined>(
      AUDIT_AGGREGATE_KEY,
      ctx.getHandler(),
    );
    if (!meta) {
      return next.handle();
    }

    const id = meta.idExtractor ? meta.idExtractor(req) : null;
    let before: unknown = null;
    if (id) {
      const resolver = this.resolvers.resolverFor(meta.aggregateType);
      if (resolver) {
        try {
          before = await resolver(id, req);
        } catch (err) {
          this.logger.debug(
            `audit.before.resolve_failed: aggregateType=${meta.aggregateType} id=${id} err=${(err as Error).message}`,
          );
          before = null;
        }
      }
    }

    const user = (req as Request & { user?: AuthenticatedUserPayload }).user;

    return next.handle().pipe(
      mergeMap((response) =>
        from(this.emitForensicRow(response, meta, id, before, user, req).then(() => response)),
      ),
    );
  }

  /**
   * Awaits subscribers via `emitAsync` so the HTTP response is held until the
   * audit row is persisted. Without this, `tap + emit` returns the response
   * before the @OnEvent handler completes — INT specs read the DB and see 0
   * rows because the write hasn't landed yet (read-after-write hazard across
   * the event bus).
   */
  private async emitForensicRow(
    response: unknown,
    meta: AuditAggregateMeta,
    id: string | null,
    before: unknown,
    user: AuthenticatedUserPayload | undefined,
    req: Request,
  ): Promise<void> {
    const after = unwrapWriteResponse(response);
    const aggregateId = id ?? extractIdFromResponse(after);
    if (!aggregateId) {
      this.logger.debug(
        `audit.skipped: aggregateType=${meta.aggregateType} no aggregateId derivable`,
      );
      return;
    }
    const organizationId = user?.organizationId;
    if (!organizationId) {
      this.logger.debug('audit.skipped: no organizationId on req.user');
      return;
    }
    await safeAuditEmit(
      this.events,
      AuditEventType.AGENT_ACTION_FORENSIC,
      {
        organizationId,
        aggregateType: meta.aggregateType,
        aggregateId,
        actorUserId: user?.userId ?? null,
        actorKind: 'agent' as const,
        agentName: req.agentContext?.agentName,
        payloadBefore: before,
        payloadAfter: after,
        reason: req.agentContext?.capabilityName ?? undefined,
      },
      this.logger,
    );
  }
}

/**
 * If the handler returns a `WriteResponseDto<T>`, extract the inner `data`.
 * Otherwise return the raw response (already the entity, or null).
 */
function unwrapWriteResponse(response: unknown): unknown {
  if (response === null || response === undefined) return null;
  if (typeof response !== 'object') return response;
  const obj = response as Record<string, unknown>;
  if ('data' in obj && 'missingFields' in obj && 'nextRequired' in obj) {
    return (obj as unknown as WriteResponseDto<unknown>).data;
  }
  return response;
}

/** Best-effort id extraction for create-style ops where the id wasn't on the URL. */
function extractIdFromResponse(after: unknown): string | null {
  if (after && typeof after === 'object') {
    const obj = after as Record<string, unknown>;
    const candidate = obj.id;
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return null;
}
