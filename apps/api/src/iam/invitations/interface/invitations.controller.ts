import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../../shared/decorators/roles.decorator';
import {
  WriteResponseDto,
  toWriteResponse,
} from '../../../shared/dto/write-response.dto';
import { InvitationService } from '../application/invitation.service';
import {
  AcceptInvitationDto,
  CreateInvitationDto,
  InvitationAcceptResponseDto,
  InvitationLookupResponseDto,
  InvitationResponseDto,
} from './dto/invitation.dto';

/**
 * Sprint 4 W2-2a — invitation REST surface.
 *
 * Three authenticated Owner endpoints + two unauthenticated public
 * endpoints (`/lookup` + `/accept`). The unauthenticated pair are
 * deliberately mounted on the same controller so the route prefix
 * `/users/invitations` matches the rest of the IAM surface (`/users`,
 * `/users/:id/...`).
 *
 * IMPORTANT: the `token` field of `user_invitations` is never echoed
 * back in any response body. The spec
 * `invitations.controller.spec.ts` asserts this for every endpoint.
 */
@ApiTags('Invitations')
@Controller('users/invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationService) {}

  @Post()
  @Roles('OWNER')
  @ApiOperation({
    summary: 'Create + send an invitation',
    description:
      'Generates a 64-char hex token, persists the row, dispatches the email via the configured EmailService. Token is never echoed back.',
  })
  async create(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Req() req: Request,
    @Body() dto: CreateInvitationDto,
  ): Promise<WriteResponseDto<InvitationResponseDto>> {
    const invitedByUserId = req.user?.userId;
    if (!invitedByUserId) {
      // The RolesGuard would normally 401 first, but be defensive.
      throw new BadRequestException({ code: 'INVITER_UNKNOWN' });
    }
    const created = await this.invitations.create({
      organizationId,
      invitedByUserId,
      email: dto.email,
      role: dto.role,
    });
    return toWriteResponse(InvitationResponseDto.fromEntity(created));
  }

  @Get()
  @Roles('OWNER')
  @ApiOperation({
    summary: 'List pending invitations for an organization',
  })
  async list(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
  ): Promise<InvitationResponseDto[]> {
    const rows = await this.invitations.listPending(organizationId);
    return rows.map((row) => InvitationResponseDto.fromEntity(row));
  }

  @Post(':id/revoke')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  async revoke(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
  ): Promise<WriteResponseDto<InvitationResponseDto>> {
    const revoked = await this.invitations.revoke(id, organizationId);
    return toWriteResponse(InvitationResponseDto.fromEntity(revoked));
  }

  // ---------------- public, unauthenticated ----------------

  @Get('lookup')
  @ApiOperation({
    summary: 'Public metadata read for the accept page',
    description:
      'Returns minimal info to render the accept screen. 404 when token is unknown, revoked, accepted, or expired (response is uniform on purpose; do not leak which).',
  })
  async lookup(@Query('token') token: string): Promise<InvitationLookupResponseDto> {
    if (typeof token !== 'string' || token.length === 0) {
      throw new NotFoundException({ code: 'INVITATION_NOT_FOUND' });
    }
    return this.invitations.lookupByToken(token);
  }

  @Post('accept')
  @ApiOperation({
    summary: 'Accept an invitation (create user + placeholder session)',
    description:
      'Single-transaction: creates the user, marks the invitation accepted. The returned `session` is a placeholder until R8 ships real auth.',
  })
  async accept(@Body() dto: AcceptInvitationDto): Promise<InvitationAcceptResponseDto> {
    return this.invitations.accept(dto);
  }
}
