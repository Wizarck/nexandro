import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { UserInvitation } from '../domain/user-invitation.entity';

@Injectable()
export class UserInvitationRepository extends Repository<UserInvitation> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(UserInvitation, dataSource.createEntityManager());
  }

  /**
   * Pending = not yet accepted AND not revoked. Caller (the service)
   * filters out expired rows from the response if needed; the DB-level
   * `expires_at` check stays out of SQL so a future "grace period"
   * config doesn't require a migration.
   */
  async findPendingByOrg(organizationId: string): Promise<UserInvitation[]> {
    return this.find({
      where: {
        organizationId,
        acceptedAt: IsNull(),
        revokedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findByToken(token: string): Promise<UserInvitation | null> {
    return this.findOneBy({ token });
  }

  /**
   * Live = not yet accepted AND not revoked, regardless of expiry. Used
   * by the create flow to enforce the partial unique index in code
   * (we'd rather raise a 409 than a 23505 surprise).
   */
  async findLiveByOrgAndEmail(
    organizationId: string,
    email: string,
  ): Promise<UserInvitation | null> {
    return this.findOne({
      where: {
        organizationId,
        email: email.trim().toLowerCase(),
        acceptedAt: IsNull(),
        revokedAt: IsNull(),
      },
    });
  }
}
