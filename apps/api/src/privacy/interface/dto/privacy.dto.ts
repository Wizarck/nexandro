import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  OrganizationDpoContact,
  OrganizationRetentionPolicy,
} from '../../../iam/domain/organization.entity';
import { RETENTION_BOUNDS } from '../../application/privacy.service';

/**
 * Read shape returned by `GET /privacy/state?organizationId=…`. Backs the
 * Privacidad surface in `OwnerPrivacySection.tsx`. Includes ONLY GDPR-
 * relevant fields; the wider org config is served by
 * `GET /organizations/:id`.
 */
export class PrivacyStateResponseDto {
  @ApiProperty() organizationId!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  deletionScheduledAt!: string | null;
  @ApiProperty({ type: Object })
  retentionPolicy!: OrganizationRetentionPolicy;
  @ApiPropertyOptional({ type: Object, nullable: true })
  dpoContact!: OrganizationDpoContact | null;
}

/**
 * PATCH /privacy/retention-policy body. All 3 fields optional so the UI
 * can partial-update; bounds enforced both at the DTO (auto 400) and at
 * the service (defensive — auto 422 with `RETENTION_POLICY_OUT_OF_RANGE`).
 */
export class UpdateRetentionPolicyDto {
  @ApiPropertyOptional({
    example: 2555,
    description: `Días de retención del registro de auditoría. Rango [${RETENTION_BOUNDS.audit_log_days.min}, ${RETENTION_BOUNDS.audit_log_days.max}].`,
  })
  @IsOptional()
  @IsInt()
  @Min(RETENTION_BOUNDS.audit_log_days.min)
  @Max(RETENTION_BOUNDS.audit_log_days.max)
  audit_log_days?: number;

  @ApiPropertyOptional({
    example: 90,
    description: `Días de retención de fotos. Rango [${RETENTION_BOUNDS.photos_days.min}, ${RETENTION_BOUNDS.photos_days.max}].`,
  })
  @IsOptional()
  @IsInt()
  @Min(RETENTION_BOUNDS.photos_days.min)
  @Max(RETENTION_BOUNDS.photos_days.max)
  photos_days?: number;

  @ApiPropertyOptional({
    example: 365,
    description: `Días de retención de la cola de revisión M3. Rango [${RETENTION_BOUNDS.m3_review_queue_days.min}, ${RETENTION_BOUNDS.m3_review_queue_days.max}].`,
  })
  @IsOptional()
  @IsInt()
  @Min(RETENTION_BOUNDS.m3_review_queue_days.min)
  @Max(RETENTION_BOUNDS.m3_review_queue_days.max)
  m3_review_queue_days?: number;
}

export class DpoContactDto {
  @ApiProperty({ example: 'Marina López García' })
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiProperty({ example: 'dpo@miempresa.es' })
  @IsEmail()
  @Length(1, 320)
  email!: string;

  @ApiPropertyOptional({ example: '+34 666 123 456' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  phone?: string;
}

/**
 * PATCH /privacy/dpo-contact body. Wrapped so the same endpoint can
 * accept `{ contact: null }` to CLEAR the DPO field, vs partial-update
 * conflation with an empty object.
 */
export class UpdateDpoContactDto {
  @ApiPropertyOptional({
    type: DpoContactDto,
    nullable: true,
    description: 'Pasa `null` explícitamente para vaciar el DPO; un objeto vacío rechaza con 400.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DpoContactDto)
  contact?: DpoContactDto | null;
}

export class DeleteOrganizationResponseDto {
  @ApiProperty() organizationId!: string;
  @ApiProperty() deletionScheduledAt!: string;
  @ApiProperty() graceDays!: number;
}

export class CancelDeleteResponseDto {
  @ApiProperty() organizationId!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  deletionScheduledAt!: null;
  @ApiProperty() wasScheduled!: boolean;
}

export class TwoFactorStubResponseDto {
  @ApiProperty() enabled!: false;
  @ApiProperty() message!: string;
}

export class ApiTokenStubResponseDto {
  @ApiProperty() rotated!: false;
  @ApiProperty() message!: string;
}
