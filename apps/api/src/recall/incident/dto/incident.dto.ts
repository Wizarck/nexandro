import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  RECALL_ADDENDUM_TEXT_MAX,
} from '../../domain/constants';

export class OpenIncidentDto {
  @IsUUID()
  organizationId!: string;

  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  lotIds!: string[];

  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  locationIds!: string[];

  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  recipientList!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class DispatchIncidentDto {
  @IsUUID()
  organizationId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'recipientList must contain at least one address' })
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true, message: 'recipientList contains an invalid email' })
  recipientList!: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  lotIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  locationIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(998)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  bodyText?: string;
}

export class RedispatchIncidentDto {
  @IsUUID()
  organizationId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  recipientList!: string[];
}

export class AddendumAttachmentDto {
  @IsString()
  @MaxLength(255)
  filename!: string;

  @IsString()
  @MaxLength(127)
  contentType!: string;

  @IsString()
  contentBase64!: string;
}

export class AttachAddendumDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @MaxLength(RECALL_ADDENDUM_TEXT_MAX)
  text!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AddendumAttachmentDto)
  attachments?: AddendumAttachmentDto[];
}

export class IncidentQueryDto {
  @IsUUID()
  organizationId!: string;
}
