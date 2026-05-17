import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAggregate } from '../../shared/decorators/audit-aggregate.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  WriteResponseDto,
  toWriteResponse,
} from '../../shared/dto/write-response.dto';
import {
  AcceptSuggestionDto,
  AiSuggestionResponseDto,
  RejectSuggestionDto,
  SuggestWasteDto,
  SuggestYieldDto,
  SuggestionEnvelopeDto,
} from './dto/ai-suggestion.dto';
import { AiSuggestionsService } from '../application/ai-suggestions.service';
import {
  AiSuggestionAlreadyActedError,
  AiSuggestionNotFoundError,
  AiSuggestionRejectReasonError,
  AiSuggestionTweakValueError,
  AiSuggestionsDisabledError,
} from '../application/errors';
import { AI_YIELD_SUGGESTIONS_ENABLED } from '../application/types';

/**
 * REST surface for AI yield + waste suggestions per FR16-19.
 *
 * Feature-flag guard: when `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=false`
 * every endpoint returns 404 (the surface is invisible to clients).
 *
 * RBAC: Owner + Manager only. Staff blocked at 403 by the global RolesGuard.
 *
 * Iron rule (FR19): when the provider returns no citation, the response is
 * `{ suggestion: null, reason: 'no_citation_available' }` so the chef is
 * directed to manual entry — never a degraded "trust-me" suggestion.
 *
 * NOTE: In MVP the `userId` for accept/reject audit comes from the request
 * body's `organizationId` ownership context. Real JWT-based actor extraction
 * is out of scope for this slice; the placeholder uses `organizationId` as
 * the actor proxy until auth lands. Audit table integration ships with the
 * future `audit_log` slice.
 */
@ApiTags('AI Suggestions')
@Controller('ai-suggestions')
export class AiSuggestionsController {
  constructor(
    private readonly service: AiSuggestionsService,
    @Inject(AI_YIELD_SUGGESTIONS_ENABLED) private readonly enabled: boolean,
  ) {}

  @Post('yield')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('ai_suggestion', null)
  @ApiOperation({
    summary: 'Request an AI suggestion for an Ingredient yield% (FR16)',
    description:
      'Cache lookup → provider call → iron-rule guard → persist row. When the provider cannot cite, returns `{ suggestion: null, reason: "no_citation_available" }`. 404 when feature flag disabled.',
  })
  async suggestYield(
    @Body() dto: SuggestYieldDto,
  ): Promise<WriteResponseDto<SuggestionEnvelopeDto>> {
    this.assertFlagEnabled();
    try {
      const row = await this.service.suggestYield({
        organizationId: dto.organizationId,
        ingredientId: dto.ingredientId,
        contextHash: dto.contextHash,
      });
      return toWriteResponse({
        suggestion: row ? AiSuggestionResponseDto.fromEntity(row) : null,
        reason: row ? undefined : 'no_citation_available',
      });
    } catch (err) {
      this.translateAndThrow(err);
    }
  }

  @Post('waste')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('ai_suggestion', null)
  @ApiOperation({
    summary: 'Request an AI suggestion for a Recipe wasteFactor (FR17)',
  })
  async suggestWaste(
    @Body() dto: SuggestWasteDto,
  ): Promise<WriteResponseDto<SuggestionEnvelopeDto>> {
    this.assertFlagEnabled();
    try {
      const row = await this.service.suggestWaste({
        organizationId: dto.organizationId,
        recipeId: dto.recipeId,
        contextHash: dto.contextHash,
      });
      return toWriteResponse({
        suggestion: row ? AiSuggestionResponseDto.fromEntity(row) : null,
        reason: row ? undefined : 'no_citation_available',
      });
    } catch (err) {
      this.translateAndThrow(err);
    }
  }

  @Post(':id/accept')
  @HttpCode(200)
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('ai_suggestion')
  @ApiOperation({
    summary: 'Accept (or accept-then-tweak) a previously-issued suggestion (FR18)',
    description:
      'When `value` is omitted, the chef accepts the suggestion as-is. When `value` is set, the chef accepts a different number (a "tweak").',
  })
  async accept(
    @Param('id', new ParseUUIDPipe({ version: '4' })) suggestionId: string,
    @Body() dto: AcceptSuggestionDto,
  ): Promise<WriteResponseDto<AiSuggestionResponseDto>> {
    this.assertFlagEnabled();
    try {
      const row = await this.service.acceptSuggestion({
        organizationId: dto.organizationId,
        userId: dto.organizationId, // MVP: actor placeholder; future audit_log slice resolves real userId
        suggestionId,
        valueOverride: dto.value,
      });
      return toWriteResponse(AiSuggestionResponseDto.fromEntity(row));
    } catch (err) {
      this.translateAndThrow(err);
    }
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('ai_suggestion')
  @ApiOperation({
    summary: 'Reject a previously-issued suggestion with audited reason (FR18)',
  })
  async reject(
    @Param('id', new ParseUUIDPipe({ version: '4' })) suggestionId: string,
    @Body() dto: RejectSuggestionDto,
  ): Promise<WriteResponseDto<AiSuggestionResponseDto>> {
    this.assertFlagEnabled();
    try {
      const row = await this.service.rejectSuggestion({
        organizationId: dto.organizationId,
        userId: dto.organizationId,
        suggestionId,
        reason: dto.reason,
      });
      return toWriteResponse(AiSuggestionResponseDto.fromEntity(row));
    } catch (err) {
      this.translateAndThrow(err);
    }
  }

  private assertFlagEnabled(): void {
    if (!this.enabled) {
      throw new NotFoundException({ code: 'AI_SUGGESTIONS_DISABLED' });
    }
  }

  private translateAndThrow(err: unknown): never {
    if (err instanceof AiSuggestionsDisabledError) {
      throw new NotFoundException({ code: 'AI_SUGGESTIONS_DISABLED' });
    }
    if (err instanceof AiSuggestionNotFoundError) {
      throw new NotFoundException({ code: 'AI_SUGGESTION_NOT_FOUND', suggestionId: err.suggestionId });
    }
    if (err instanceof AiSuggestionAlreadyActedError) {
      throw new ConflictException({
        code: 'AI_SUGGESTION_ALREADY_ACTED',
        suggestionId: err.suggestionId,
        status: err.status,
      });
    }
    if (err instanceof AiSuggestionRejectReasonError) {
      throw new UnprocessableEntityException({
        code: 'AI_SUGGESTION_REJECT_REASON_TOO_SHORT',
        minLength: err.minLength,
      });
    }
    if (err instanceof AiSuggestionTweakValueError) {
      throw new UnprocessableEntityException({
        code: 'AI_SUGGESTION_TWEAK_VALUE_OUT_OF_RANGE',
      });
    }
    // Unknown error — re-throw to let the global filter render 500.
    throw err instanceof Error ? err : new ForbiddenException(String(err));
  }
}
