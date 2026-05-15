import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class IngestPhotoDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  photoId!: string;

  @IsIn(['invoice', 'product'])
  kind!: 'invoice' | 'product';

  @IsString()
  @IsOptional()
  capability?: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class ListItemsQueryDto {
  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsIn([
    'pending_extraction',
    'auto_filled',
    'awaiting_review',
    'rejected',
    'signed',
    'expired',
  ])
  status?:
    | 'pending_extraction'
    | 'auto_filled'
    | 'awaiting_review'
    | 'rejected'
    | 'signed'
    | 'expired';

  @IsOptional()
  @IsIn(['invoice', 'product'])
  kind?: 'invoice' | 'product';

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ItemDetailQueryDto {
  @IsUUID()
  organizationId!: string;
}

export class FieldCorrectionDto {
  @IsString()
  name!: string;

  // Value is string | number | null — class-validator can't express that
  // tagged union cleanly, so we leave it untyped and validate at the
  // service boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value!: any;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsObject()
  @IsOptional()
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export class SignItemDto {
  @IsUUID()
  organizationId!: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FieldCorrectionDto)
  fieldCorrections!: FieldCorrectionDto[];

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class ReclassifyItemDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
