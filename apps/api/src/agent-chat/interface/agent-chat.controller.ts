import {
  Body,
  Controller,
  NotFoundException,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';
import { AgentChatService } from '../application/agent-chat.service';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import { ChatRequestDto, ChatSseEvent } from './dto/agent-chat.dto';
import { AgentChatEnabledGuard } from './agent-chat-enabled.guard';

/**
 * Wave 1.13 [3b] — first-party web-chat surface.
 *
 * `NEXANDRO_AGENT_ENABLED=false` → 404 (enforced by `AgentChatEnabledGuard`,
 * which runs before the `@Sse()` handler opens the stream). Authenticated
 * users of any role can chat; tool-call authorisation is handled per-capability
 * by the existing AgentCapabilityGuard (Wave 1.13 [3a]) once Hermes invokes
 * a write.
 *
 * Audit emission lives in `AgentChatService.stream()` rather than via the
 * shared `BeforeAfterAuditInterceptor`. The interceptor's `mergeMap` would
 * fire one audit row per SSE event (token, tool-calling, done) — incorrect
 * for chat, where we want exactly one row per turn. Browser-supplied
 * `X-Agent-*` headers are deliberately ignored: the agentName='hermes-web'
 * attribution is hardcoded server-side.
 */
@ApiTags('agent-chat')
@Controller('agent-chat')
export class AgentChatController {
  constructor(private readonly service: AgentChatService) {}

  @Post('stream')
  @UseGuards(AgentChatEnabledGuard)
  @Sse()
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({
    summary: 'Open an SSE chat stream with the nexandro agent (feature-flagged)',
  })
  stream(
    @Body() body: ChatRequestDto,
    @Req() req: Request,
  ): Observable<{ data: unknown; type: string }> {
    const user = (req as Request & { user?: AuthenticatedUserPayload }).user;
    if (!user) {
      // Should be impossible — auth runs before us — but kept as a safety
      // net so a misconfigured pipeline can't leak chat to anonymous callers.
      throw new NotFoundException();
    }

    // Map ChatSseEvent → NestJS MessageEvent shape so @Sse() emits proper
    // SSE frames with `event: <type>` lines (instead of folding the event
    // type into the data payload). This keeps the wire format aligned with
    // what Hermes itself emits, and lets browser EventSource consumers
    // dispatch by event name without parsing the JSON.
    return this.service
      .stream(body, {
        userId: user.userId,
        organizationId: user.organizationId,
      })
      .pipe(map((event: ChatSseEvent) => ({ data: event.data, type: event.event })));
  }
}
