import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  PrivacyService,
  RetentionPolicyValidationError,
} from '../application/privacy.service';
import type { OrganizationDpoContact } from '../../iam/domain/organization.entity';
import {
  ApiTokenStubResponseDto,
  CancelDeleteResponseDto,
  DeleteOrganizationResponseDto,
  PrivacyStateResponseDto,
  TwoFactorStubResponseDto,
  UpdateDpoContactDto,
  UpdateRetentionPolicyDto,
} from './dto/privacy.dto';

/**
 * Sprint 2 P4 — GDPR legal core. Owner-only surface for:
 *   - GET    /privacy/state                  → state for Privacidad UI
 *   - POST   /privacy/export-mi-data         → Art. 15 + 20 ZIP export
 *   - POST   /privacy/delete-organization    → Art. 17 schedule 30d grace
 *   - DELETE /privacy/delete-organization    → cancel within grace
 *   - PATCH  /privacy/retention-policy       → editable retention windows
 *   - PATCH  /privacy/dpo-contact            → DPO contact upsert/clear
 *   - POST   /privacy/two-factor/enable      → R8 placeholder (honest stub)
 *   - POST   /privacy/api-token/rotate       → R8 placeholder (honest stub)
 *
 * Every state-mutating endpoint emits a regulatory audit envelope via
 * `safeAuditEmit` so the AEPD inspection trail records who exercised
 * which right when (per docs/audit-2026-05-18-v3-detail-09-settings.md
 * F-BLOCKER, Privacidad section).
 *
 * Multi-tenant: `organizationId` carried as a query param, gated by the
 * global RolesGuard (`@Roles('OWNER')`) per the same convention as
 * `OrganizationController.update()`. Real tenant pinning lands with R8
 * auth — this surface mirrors the rest of the M3 product for consistency.
 */
@ApiTags('Privacy & GDPR')
@Controller('privacy')
export class PrivacyController {
  private readonly logger = new Logger(PrivacyController.name);

  constructor(private readonly privacy: PrivacyService) {}

  @Get('state')
  @Roles('OWNER')
  @ApiOperation({
    summary: 'GDPR state for the Privacidad UI',
    description:
      'Returns the deletionScheduledAt + retentionPolicy + dpoContact slice the OwnerPrivacySection.tsx surface needs to render. No PII beyond what the Owner already sees in their own settings.',
  })
  async getState(
    @Query('organizationId') organizationId: string,
  ): Promise<PrivacyStateResponseDto> {
    this.requireOrgId(organizationId);
    const state = await this.privacy.getPrivacyState(organizationId);
    return state;
  }

  @Post('export-mi-data')
  @Roles('OWNER')
  @ApiOperation({
    summary: 'GDPR art. 15 (acceso) + art. 20 (portabilidad) — single ZIP export',
    description:
      'Streams a ZIP containing manifest.json + organization.jsonl + users.jsonl + audit_log.jsonl (last 90 days) + ingredients.jsonl + recipes.jsonl + photos_manifest.jsonl. Synchronous — bounded by EXPORT_ROWS_HARD_CAP (50K rows) per file. Audit envelope PRIVACY_EXPORT_REQUESTED is recorded.',
  })
  async exportMiData(
    @Query('organizationId') organizationId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    this.requireOrgId(organizationId);
    const actorUserId = this.extractActorUserId(res);
    const { zip, filename } = await this.privacy.exportOrganization(
      organizationId,
      actorUserId,
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(zip.length));
    return new StreamableFile(Readable.from(zip));
  }

  @Post('delete-organization')
  @Roles('OWNER')
  @ApiOperation({
    summary: 'GDPR art. 17 — schedule organization deletion (30d grace)',
    description:
      'Marks the org with deletionScheduledAt = now + 30 days. Idempotent: re-calling within the grace window resets the timer. The physical delete is performed by a nightly job (out of scope this PR). Cancel via DELETE /privacy/delete-organization within the grace window.',
  })
  async scheduleDelete(
    @Query('organizationId') organizationId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DeleteOrganizationResponseDto> {
    this.requireOrgId(organizationId);
    const actorUserId = this.extractActorUserId(res);
    const { deletionScheduledAt } = await this.privacy.scheduleDeletion(
      organizationId,
      actorUserId,
    );
    return {
      organizationId,
      deletionScheduledAt,
      graceDays: 30,
    };
  }

  @Delete('delete-organization')
  @Roles('OWNER')
  @ApiOperation({
    summary: 'Cancel a scheduled organization deletion (within the 30d grace window)',
    description:
      'Clears deletionScheduledAt. Idempotent — calling when nothing is scheduled returns wasScheduled=false.',
  })
  async cancelDelete(
    @Query('organizationId') organizationId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CancelDeleteResponseDto> {
    this.requireOrgId(organizationId);
    const actorUserId = this.extractActorUserId(res);
    const result = await this.privacy.cancelScheduledDeletion(
      organizationId,
      actorUserId,
    );
    return {
      organizationId,
      deletionScheduledAt: result.deletionScheduledAt,
      wasScheduled: result.wasScheduled,
    };
  }

  @Patch('retention-policy')
  @Roles('OWNER')
  @ApiOperation({
    summary: 'Update per-org retention windows (days)',
    description:
      'Partial update — pass only the fields that change. Bounds enforced (see UpdateRetentionPolicyDto). Persisted as JSONB; the actual archival/eviction crons that respect these overrides land in a follow-up slice.',
  })
  async patchRetentionPolicy(
    @Query('organizationId') organizationId: string,
    @Body() body: UpdateRetentionPolicyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PrivacyStateResponseDto> {
    this.requireOrgId(organizationId);
    const actorUserId = this.extractActorUserId(res);
    try {
      await this.privacy.updateRetentionPolicy(organizationId, body, actorUserId);
    } catch (err) {
      if (err instanceof RetentionPolicyValidationError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
        });
      }
      throw err;
    }
    return this.privacy.getPrivacyState(organizationId);
  }

  @Patch('dpo-contact')
  @Roles('OWNER')
  @ApiOperation({
    summary: 'Upsert (or clear) the Data Protection Officer contact',
    description:
      'Pass `{ contact: { name, email, phone? } }` to upsert; `{ contact: null }` to clear. Used in compliance export bundles + AEPD breach notifications.',
  })
  async patchDpoContact(
    @Query('organizationId') organizationId: string,
    @Body() body: UpdateDpoContactDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PrivacyStateResponseDto> {
    this.requireOrgId(organizationId);
    const actorUserId = this.extractActorUserId(res);
    const next: OrganizationDpoContact | null =
      body.contact === null
        ? null
        : body.contact === undefined
          ? null
          : {
              name: body.contact.name.trim(),
              email: body.contact.email.trim(),
              ...(body.contact.phone ? { phone: body.contact.phone.trim() } : {}),
            };
    await this.privacy.updateDpoContact(organizationId, next, actorUserId);
    return this.privacy.getPrivacyState(organizationId);
  }

  @Post('two-factor/enable')
  @Roles('OWNER')
  @ApiOperation({
    summary: 'R8 placeholder — 2FA / TOTP enablement (honest stub)',
    description:
      'Returns a 200 with a copy explaining 2FA lands with R8 (auth real). No state mutation, no audit envelope (it would be a lie). The frontend surfaces the message verbatim so the Owner sees the honest roadmap signal.',
  })
  enableTwoFactor(): TwoFactorStubResponseDto {
    return {
      enabled: false,
      message:
        'Próximamente: integraremos TOTP cuando R8 (auth real) aterrice. Por ahora la cuenta se gestiona vía Owner SSO en infra.',
    };
  }

  @Post('api-token/rotate')
  @Roles('OWNER')
  @ApiOperation({
    summary: 'R8 placeholder — API token rotation (honest stub)',
    description:
      'Returns a 200 with a copy explaining token rotation lands with R8. No state mutation.',
  })
  rotateApiToken(): ApiTokenStubResponseDto {
    return {
      rotated: false,
      message: 'Disponible con R8 auth (próximamente).',
    };
  }

  // ---------- internals ----------

  private requireOrgId(organizationId: string | undefined): asserts organizationId is string {
    if (!organizationId || typeof organizationId !== 'string') {
      throw new BadRequestException({
        code: 'ORGANIZATION_ID_REQUIRED',
        message: 'organizationId query param is required',
      });
    }
  }

  /**
   * Pull the actor user id from the request. Demo / R8 placeholder
   * implementation: trust `res.req.user?.id` if the upstream auth
   * middleware populated it (DemoAuthMiddleware does); fall back to
   * `null` (the envelope uses `actorKind='system'` in that case).
   */
  private extractActorUserId(res: Response): string | null {
    const req = res.req as unknown as { user?: { id?: unknown } } | undefined;
    const id = req?.user?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  }
}
