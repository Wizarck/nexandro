import { createHash, randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable } from 'rxjs';
import { AuditEventType, AuditEventEnvelope } from '../../audit-log/application/types';
import { safeAuditEmit } from '../../shared/audit-emit/safe-audit-emit';
import { OrganizationRepository } from '../../iam/infrastructure/organization.repository';
import { ChatRequestDto, ChatSseEvent } from '../interface/dto/agent-chat.dto';

const FLAG_ENV = 'OPENTRATTOS_AGENT_ENABLED';
const HERMES_URL_ENV = 'OPENTRATTOS_HERMES_BASE_URL';
const HERMES_AUTH_ENV = 'OPENTRATTOS_HERMES_AUTH_SECRET';

const HERMES_DEFAULT_TIMEOUT_MS = 60_000;

interface HermesPostBody {
  message: ChatRequestDto['message'];
  bank_id: string;
  user_attribution: { user_id: string; display_name: string };
  metadata?: Record<string, unknown>;
}

/**
 * Wave 1.13 [3b] — `POST /agent-chat/stream` SSE relay.
 *
 * Behaviour:
 *  - Read-once-at-call `OPENTRATTOS_AGENT_ENABLED`. When false, throw 404.
 *  - Resolve `bank_id = opentrattos-{tenant_slug}` from the authenticated
 *    user's organization. Collisions append a short hash of `organizationId`.
 *  - Open an SSE connection to Hermes' `web_via_http_sse` platform with the
 *    shared `X-Web-Auth-Secret`. Relay events 1:1 to the browser.
 *  - Map transport / Hermes-side errors to `event: error` frames so the
 *    client can render them coherently with happy-path output.
 *
 * Audit emission: this service emits one `AGENT_ACTION_FORENSIC` row per
 * completed turn from the Observable's terminal path (per ADR-026 Wave 1.14).
 * The Wave 1.13 [3a] `BeforeAfterAuditInterceptor` is bypassed because its
 * `mergeMap` semantics would emit one row per SSE event (token, tool-calling,
 * done) instead of one row per turn — see ADR-027 streaming-handler audit
 * pattern.
 *
 * Idempotency replay for SSE is deferred to slice 3c
 * (`m2-mcp-agent-registry-bench`); `cacheableTextForIdempotency()` is the
 * helper that 3c will plug into the cache layer.
 */
@Injectable()
export class AgentChatService {
  private readonly logger = new Logger(AgentChatService.name);

  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly events: EventEmitter2,
  ) {}

  isEnabled(): boolean {
    return readBoolEnv(FLAG_ENV);
  }

  /**
   * Build the deterministic `opentrattos-{tenant_slug}` bank id for an org.
   *
   * Strategy: slugify `organization.name` (lowercase ASCII, dashes, ≤32
   * chars). Falls back to the leading 8 hex chars of `sha256(organizationId)`
   * when (a) the org can't be looked up or (b) the name slugifies to empty
   * (e.g. all-emoji names, single multi-byte char). For the predominant
   * single-tenant deployments this yields a stable, human-readable bank id;
   * SaaS multi-tenant deployments (M3+) can introduce a unique slug column
   * to guarantee no cross-org collisions when names are reused.
   */
  async resolveBankId(organizationId: string): Promise<string> {
    const org = await this.organizations.findOneBy({ id: organizationId });
    if (!org) {
      this.logger.warn(`agent-chat.bank.org_not_found id=${organizationId}`);
      return `opentrattos-${shortHash(organizationId)}`;
    }
    const slug = slugify(org.name);
    return slug ? `opentrattos-${slug}` : `opentrattos-${shortHash(organizationId)}`;
  }

  /**
   * Returns an Observable of SSE events that NestJS' `@Sse()` decorator
   * forwards to the browser. The Observable subscribes lazily — when the
   * client connects, we open the Hermes call and push events.
   *
   * @throws NotFoundException when the feature flag is off.
   * @throws ServiceUnavailableException when required env vars are missing.
   */
  stream(
    body: ChatRequestDto,
    user: { userId: string; organizationId: string; displayName?: string },
  ): Observable<ChatSseEvent> {
    if (!this.isEnabled()) {
      // 404 — defence in depth alongside the controller-level 404. Reveals
      // nothing about the flag's state to unauthenticated callers.
      throw new NotFoundException();
    }

    const baseUrl = process.env[HERMES_URL_ENV];
    const authSecret = process.env[HERMES_AUTH_ENV];
    if (!baseUrl || !authSecret) {
      throw new ServiceUnavailableException({
        code: 'AGENT_CHAT_NOT_CONFIGURED',
        message:
          `agent-chat is enabled but missing config: set ${HERMES_URL_ENV} + ${HERMES_AUTH_ENV}`,
      });
    }

    const sessionId = body.sessionId ?? deterministicSessionId(user.userId, user.organizationId);
    // The audit_log.aggregate_id column is typed as UUID; sessionIds are
    // free-form (browser-supplied or `web-{shortHash}` derivations) and
    // would fail the cast. Generate a fresh UUID per turn and carry the
    // chat sessionId in `payloadAfter.sessionId` for forensic linkage.
    const turnAggregateId = randomUUID();
    const collected: ChatSseEvent[] = [];

    return new Observable<ChatSseEvent>((subscriber) => {
      const controller = new AbortController();
      let cancelled = false;
      let auditEmitted = false;
      const emitAuditOnce = (): Promise<void> => {
        if (auditEmitted) return Promise.resolve();
        auditEmitted = true;
        return this.emitTurnAudit(user, turnAggregateId, sessionId, collected, body);
      };
      subscriber.add(() => {
        cancelled = true;
        controller.abort();
        // Stream cancelled / unsubscribed before completion: still emit
        // one audit row so partial turns are forensically visible.
        void emitAuditOnce();
      });

      void this.invokeHermes(body, user, baseUrl, authSecret, controller.signal)
        .then(async (response) => {
          if (cancelled) return;
          if (!response.ok || !response.body) {
            const errEvent: ChatSseEvent = {
              event: 'error',
              data: {
                code: 'HERMES_HTTP_ERROR',
                message: `hermes returned ${response.status}`,
              },
            };
            collected.push(errEvent);
            subscriber.next(errEvent);
            await emitAuditOnce();
            subscriber.complete();
            return;
          }
          for await (const event of parseSseStream(response.body)) {
            if (cancelled) return;
            collected.push(event);
            subscriber.next(event);
            if (event.event === 'done' || event.event === 'error') {
              break;
            }
          }
          await emitAuditOnce();
          subscriber.complete();
        })
        .catch(async (err: unknown) => {
          if (cancelled) {
            subscriber.complete();
            return;
          }
          const errEvent: ChatSseEvent = {
            event: 'error',
            data: {
              code: 'HERMES_TRANSPORT_ERROR',
              message: (err as Error).message ?? 'unknown',
            },
          };
          collected.push(errEvent);
          subscriber.next(errEvent);
          await emitAuditOnce();
          subscriber.complete();
        });
    });
  }

  /**
   * Emit the per-turn forensic audit row. Awaits subscribers (via
   * `emitAsync`) so callers that read the audit table immediately after
   * receiving the SSE response see the row — without `emitAsync` the
   * INT specs see an empty table due to the read-after-write hazard
   * across the event bus.
   */
  private async emitTurnAudit(
    user: { userId: string; organizationId: string },
    aggregateId: string,
    sessionId: string,
    events: ChatSseEvent[],
    body: ChatRequestDto,
  ): Promise<void> {
    const summary = this.cacheableTextForIdempotency(events);
    const errored = events.find((e) => e.event === 'error');
    const messageDigest = createHash('sha256')
      .update(JSON.stringify(body.message))
      .digest('hex');

    const envelope: AuditEventEnvelope = {
      organizationId: user.organizationId,
      aggregateType: 'chat_session',
      aggregateId,
      actorUserId: user.userId,
      actorKind: 'agent',
      agentName: 'hermes-web',
      payloadBefore: null,
      payloadAfter: {
        sessionId,
        finishReason: summary.finishReason,
        replyChars: summary.text.length,
        messageType: body.message.type,
        messageDigest,
        ...(errored ? { errorCode: errored.data.code } : {}),
      },
      reason: 'chat.message',
    };
    await safeAuditEmit(
      this.events,
      AuditEventType.AGENT_ACTION_FORENSIC,
      envelope,
      this.logger,
    );
  }

  /**
   * Internal — used by tests + by the controller-level idempotency cache to
   * record a deterministic body for the cached replay path. Returns
   * `{ kind: 'sse-replay', text, finishReason, images? }` consumable by the
   * Wave 1.13 [3c] `IdempotencyMiddleware` SSE branch.
   *
   * Wave 1.13 [3b] shipped this helper text-only; [3c] extends it to also
   * collect `event: image` payloads into the optional `images` array, so
   * a chef who retries a turn that included image generation gets the
   * images replayed too. Tool-calling intermediates remain dropped — they
   * are only meaningful in the live stream.
   */
  cacheableTextForIdempotency(events: ChatSseEvent[]): {
    kind: 'sse-replay';
    text: string;
    finishReason: string;
    images?: { url: string; caption?: string }[];
  } {
    let text = '';
    let finish = 'stop';
    const images: { url: string; caption?: string }[] = [];
    for (const e of events) {
      if (e.event === 'token') text += e.data.chunk;
      else if (e.event === 'image') {
        const obj = e.data as { url: string; caption?: string };
        images.push(obj.caption ? { url: obj.url, caption: obj.caption } : { url: obj.url });
      } else if (e.event === 'done') {
        finish = e.data.finishReason ?? 'stop';
      }
    }
    const out: {
      kind: 'sse-replay';
      text: string;
      finishReason: string;
      images?: { url: string; caption?: string }[];
    } = { kind: 'sse-replay', text, finishReason: finish };
    if (images.length > 0) out.images = images;
    return out;
  }

  /**
   * Build the Hermes POST body and execute the request. Exposed (private
   * scope) so unit tests can assert the body shape via a mocked `fetch`.
   */
  private async invokeHermes(
    body: ChatRequestDto,
    user: { userId: string; organizationId: string; displayName?: string },
    baseUrl: string,
    authSecret: string,
    signal: AbortSignal,
  ): Promise<Response> {
    const sessionId = body.sessionId ?? deterministicSessionId(user.userId, user.organizationId);
    const bankId = await this.resolveBankId(user.organizationId);

    const hermesBody: HermesPostBody = {
      message: body.message,
      bank_id: bankId,
      user_attribution: {
        user_id: user.userId,
        display_name: user.displayName ?? user.userId,
      },
      metadata: body.metadata,
    };

    const url = new URL(
      `/web/${encodeURIComponent(sessionId)}`,
      baseUrl,
    ).toString();

    const timeout = setTimeout(
      () => signal.dispatchEvent(new Event('abort')),
      HERMES_DEFAULT_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          'x-web-auth-secret': authSecret,
        },
        body: JSON.stringify(hermesBody),
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Deterministic session id when the client doesn't pass one. Re-derives the
 * same id within a (userId, orgId) pair so a page refresh continues the
 * same Hermes-side session.
 */
function deterministicSessionId(userId: string, organizationId: string): string {
  return `web-${shortHash(`${userId}:${organizationId}`)}`;
}

function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8);
}

function readBoolEnv(name: string): boolean {
  const v = process.env[name];
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === 'true' || t === '1' || t === 'yes';
}

/**
 * Async iterator over an SSE response body. Yields a `ChatSseEvent` per
 * complete event frame. Tolerates partial frames across chunk boundaries
 * and ignores comment / unknown events.
 */
async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    // Frames end with a blank line (\n\n).
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const parsed = parseSseFrame(frame);
      if (parsed) yield parsed;
    }
  }
}

function parseSseFrame(frame: string): ChatSseEvent | null {
  let event: string | null = null;
  let dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!event || dataLines.length === 0) return null;
  let data: unknown;
  try {
    data = JSON.parse(dataLines.join('\n'));
  } catch {
    return null;
  }
  switch (event) {
    case 'token':
    case 'tool-calling':
    case 'proactive':
    case 'image':
    case 'done':
    case 'error':
      return { event, data } as ChatSseEvent;
    default:
      return null;
  }
}
