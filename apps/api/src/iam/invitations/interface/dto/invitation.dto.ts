import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Length, MinLength } from 'class-validator';
import type { UserRole } from '../../../domain/user.entity';
import type { UserInvitation } from '../../domain/user-invitation.entity';

export class CreateInvitationDto {
  @ApiProperty({ example: 'staff@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ['OWNER', 'MANAGER', 'STAFF'] })
  @IsEnum(['OWNER', 'MANAGER', 'STAFF'])
  role!: UserRole;
}

export class AcceptInvitationDto {
  @ApiProperty({
    description: '64-char hex token received in the invitation email link.',
  })
  @IsString()
  @Length(64, 64)
  token!: string;

  @ApiProperty({ minLength: 8, description: 'Plaintext password (bcrypt-hashed server-side).' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({
    description: 'Display name. Defaults to the local-part of the invitation email.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;
}

/**
 * Public-facing invitation row. CRITICAL: `token` is intentionally
 * omitted. The controller spec (`invitations.controller.spec.ts`)
 * asserts the response shape does NOT include the token under any code
 * path; never relax this.
 */
export class InvitationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['OWNER', 'MANAGER', 'STAFF'] }) role!: UserRole;
  @ApiProperty() invitedByUserId!: string;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty({ nullable: true }) acceptedAt!: Date | null;
  @ApiProperty({ nullable: true }) revokedAt!: Date | null;
  @ApiProperty({ enum: ['pending', 'accepted', 'revoked', 'expired'] })
  status!: 'pending' | 'accepted' | 'revoked' | 'expired';
  @ApiProperty() createdAt!: Date;

  static fromEntity(inv: UserInvitation, now: Date = new Date()): InvitationResponseDto {
    return {
      id: inv.id,
      organizationId: inv.organizationId,
      email: inv.email,
      role: inv.role,
      invitedByUserId: inv.invitedByUserId,
      expiresAt: inv.expiresAt,
      acceptedAt: inv.acceptedAt,
      revokedAt: inv.revokedAt,
      status: inv.status(now),
      createdAt: inv.createdAt,
    };
  }
}

export class InvitationLookupResponseDto {
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['OWNER', 'MANAGER', 'STAFF'] }) role!: UserRole;
  @ApiProperty() orgName!: string;
  @ApiProperty() invitedByName!: string;
  @ApiProperty() expiresAt!: Date;
}

export class InvitationAcceptResponseDto {
  @ApiProperty()
  user!: {
    id: string;
    organizationId: string;
    name: string;
    email: string;
    role: UserRole;
  };
  @ApiProperty({
    description: 'R8 placeholder — real session/JWT issuance pending.',
  })
  session!: { kind: 'placeholder'; message: string };
}
