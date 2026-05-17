import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { SharedModule } from '../shared/shared.module';
import { AgentChatService } from './application/agent-chat.service';
import { AgentChatController } from './interface/agent-chat.controller';
import { AgentChatEnabledGuard } from './interface/agent-chat-enabled.guard';

/**
 * Wave 1.13 [3b] — m2-mcp-agent-chat-widget BC. Exposes
 * `POST /agent-chat/stream` as an SSE relay to the Hermes
 * `web_via_http_sse` platform.
 *
 * Imports IamModule for `OrganizationRepository` (used to resolve the
 * tenant slug for the Hindsight `bank_id`). SharedModule is `@Global` —
 * gives us the audit + idempotency wiring for free.
 *
 * Feature flag: `NEXANDRO_AGENT_ENABLED`. Read at request time (not at
 * module configure time) so the flag can be flipped without a restart.
 */
@Module({
  imports: [SharedModule, IamModule],
  controllers: [AgentChatController],
  providers: [AgentChatService, AgentChatEnabledGuard],
  exports: [AgentChatService],
})
export class AgentChatModule {}
