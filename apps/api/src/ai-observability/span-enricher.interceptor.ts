import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Global NestJS interceptor that enriches the current OTel span (if any)
 * with the `opentrattos.tag` attribute.
 *
 * - Reads the tag from `request.opentrattosTag` (set by upstream code that
 *   knows the capability — e.g. controllers can use a decorator in a later
 *   slice to declare their tag).
 * - Normalizes the value to lowercase kebab-case ASCII, max 64 chars.
 * - When no tag is found, defaults to `'untagged'` and warns. Slice #20's
 *   dashboard widget #7 surfaces `untagged` rows prominently so misses are
 *   visible.
 *
 * See ADR-VISION-TAG-ATTRIBUTE (`design.md` §Decisions).
 */
@Injectable()
export class SpanEnricherInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SpanEnricherInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap({
        next: () => this.enrichActiveSpan(context),
        error: () => this.enrichActiveSpan(context),
      }),
    );
  }

  private enrichActiveSpan(context: ExecutionContext): void {
    const span = trace.getActiveSpan();
    if (!span) return;

    let rawTag: string | undefined;
    try {
      const httpRequest = context.switchToHttp().getRequest<{ opentrattosTag?: unknown }>();
      if (httpRequest && typeof httpRequest.opentrattosTag === 'string') {
        rawTag = httpRequest.opentrattosTag;
      }
    } catch {
      // not an HTTP context — fall through to untagged
    }

    const handlerName = context.getHandler?.()?.name ?? 'unknown';
    const className = context.getClass?.()?.name ?? 'unknown';

    if (rawTag === undefined || rawTag.trim().length === 0) {
      this.logger.warn(
        `Span emitted without opentrattos.tag from ${className}.${handlerName}; defaulting to 'untagged'`,
      );
      span.setAttribute('opentrattos.tag', 'untagged');
      return;
    }

    const normalized = normalizeTag(rawTag);
    if (normalized.value !== rawTag) {
      this.logger.warn(
        `opentrattos.tag normalized from "${rawTag}" → "${normalized.value}" in ${className}.${handlerName} (${normalized.reason})`,
      );
    }
    span.setAttribute('opentrattos.tag', normalized.value);
  }
}

interface NormalizationResult {
  value: string;
  reason: 'unchanged' | 'normalized-case' | 'truncated' | 'normalized-and-truncated';
}

const MAX_TAG_LENGTH = 64;

/**
 * Normalize a free-form tag into the canonical `opentrattos.tag` shape:
 *  - lowercase
 *  - replace non-[a-z0-9] chars with hyphen
 *  - collapse consecutive hyphens
 *  - strip leading/trailing hyphens
 *  - truncate to {@link MAX_TAG_LENGTH} chars (and re-strip trailing hyphens)
 *
 * Exported for unit testing.
 */
export function normalizeTag(raw: string): NormalizationResult {
  const lowered = raw.toLowerCase();
  const sanitized = lowered
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

  const truncated = sanitized.length > MAX_TAG_LENGTH
    ? sanitized.slice(0, MAX_TAG_LENGTH).replace(/-+$/, '')
    : sanitized;

  const safe = truncated.length === 0 ? 'untagged' : truncated;

  if (safe === raw) {
    return { value: safe, reason: 'unchanged' };
  }
  if (safe.length < sanitized.length) {
    return {
      value: safe,
      reason: safe === sanitized.slice(0, safe.length) ? 'truncated' : 'normalized-and-truncated',
    };
  }
  return { value: safe, reason: 'normalized-case' };
}
