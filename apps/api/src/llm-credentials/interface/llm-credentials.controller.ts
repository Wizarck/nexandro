import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import {
  LlmCredentialStatus,
  LlmCredentialsService,
} from '../application/llm-credentials.service';
import { UpsertLlmCredentialDto } from './dto/llm-credential.dto';

/**
 * Sprint 4 W2-1a — m4-byo-llm-provider-key. Owner-only REST surface for
 * per-org BYO LLM API keys. The cleartext key NEVER leaves the request
 * body — every response is a `LlmCredentialStatus` shape that only
 * reports `{ provider, hasKey, lastTestedAt, lastTestResult, ... }`.
 *
 * The `:orgId` path param MUST equal the caller's `req.user.organizationId`.
 * Cross-org access from an Owner of org-A trying to read org-B's status
 * gets a 403. (This is defence in depth on top of demo auth — once real
 * auth ships the same check still applies.)
 */
@ApiTags('LLM Credentials')
@Controller('organizations')
export class LlmCredentialsController {
  constructor(private readonly service: LlmCredentialsService) {}

  @Get(':orgId/llm-credentials')
  @Roles('OWNER')
  @ApiOperation({
    summary: 'Get LLM credential status for an organization',
    description:
      'Returns `{ provider, hasKey, lastTestedAt, lastTestResult, lastTestError }`. NEVER returns the API key — the cleartext is unrecoverable through this surface by design.',
  })
  async getStatus(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Req() req: Request,
  ): Promise<LlmCredentialStatus> {
    requireOrgMatch(req, orgId);
    return this.service.getStatus(orgId);
  }

  @Put(':orgId/llm-credentials')
  @HttpCode(204)
  @Roles('OWNER')
  @ApiOperation({
    summary: 'Upsert the LLM credential for an organization',
    description:
      'Encrypts the supplied `apiKey` with AES-256-GCM and persists it. Replaces any existing row. Resets the last-test metadata so the operator must re-test after rotation.',
  })
  async upsert(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Body() dto: UpsertLlmCredentialDto,
    @Req() req: Request,
  ): Promise<void> {
    requireOrgMatch(req, orgId);
    await this.service.upsert(orgId, dto.provider, dto.apiKey);
  }

  @Post(':orgId/llm-credentials/test')
  @HttpCode(200)
  @Roles('OWNER')
  @ApiOperation({
    summary: 'Test connectivity to the configured LLM provider',
    description:
      'Fires a provider-specific cheap GET (e.g. /v1/models) with the decrypted API key and stores the result. Returns the updated `LlmCredentialStatus`.',
  })
  async test(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Req() req: Request,
  ): Promise<LlmCredentialStatus> {
    requireOrgMatch(req, orgId);
    return this.service.test(orgId);
  }

  @Delete(':orgId/llm-credentials')
  @HttpCode(204)
  @Roles('OWNER')
  @ApiOperation({
    summary: 'Clear the LLM credential for an organization',
    description:
      'Hard-deletes the row. The organization falls back to the platform default provider (resolved by downstream callers).',
  })
  async clear(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Req() req: Request,
  ): Promise<void> {
    requireOrgMatch(req, orgId);
    await this.service.clear(orgId);
  }
}

function requireOrgMatch(req: Request, orgId: string): AuthenticatedUserPayload {
  const user = (req as Request & { user?: AuthenticatedUserPayload }).user;
  if (!user) {
    throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
  }
  if (user.organizationId !== orgId) {
    throw new ForbiddenException({
      code: 'ORG_SCOPE_MISMATCH',
      details: { requested: orgId, actual: user.organizationId },
    });
  }
  return user;
}
