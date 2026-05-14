import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { ReverseAnchorKind } from '../../types';

/**
 * Query parameters for `GET /m3/recall/trace/forward`.
 *
 * `organizationId` is required (multi-tenant gate). `lotId` is the root
 * of the forward walk.
 */
export class TraceForwardQueryDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  lotId!: string;
}

const REVERSE_ANCHOR_KINDS: readonly ReverseAnchorKind[] = [
  'symptom',
  'menu-item',
  'recipe',
];

/**
 * Query parameters for `GET /m3/recall/trace/reverse`.
 *
 * `anchorKind='symptom'` is accepted by DTO validation but rejected at
 * the service boundary (slice #11 ships the resolver) — service throws
 * `RecallInvalidAnchorKindError` mapped to HTTP 422.
 */
export class TraceReverseQueryDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  anchorId!: string;

  @IsIn(REVERSE_ANCHOR_KINDS as unknown as string[])
  anchorKind!: ReverseAnchorKind;
}

/**
 * Caller-supplied per-request opts. Currently only `maxDepth` to allow
 * QA / operator override (capped at the org level + module hard cap).
 */
export class TraceOptionsQueryDto {
  @IsOptional()
  maxDepth?: number;
}
