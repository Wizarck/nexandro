import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditResolverRegistry } from '../shared/application/audit-resolver-registry';
import { EmailModule } from '../shared/email/email.module';
import { SharedModule } from '../shared/shared.module';
import { AssignUserToLocations } from './application/assign-user-to-locations.use-case';
import { CreateOrganization } from './application/create-organization.use-case';
import { Location } from './domain/location.entity';
import { Organization } from './domain/organization.entity';
import { User } from './domain/user.entity';
import { UserLocation } from './domain/user-location.entity';
import { UserInvitation } from './invitations/domain/user-invitation.entity';
import { InvitationService } from './invitations/application/invitation.service';
import { UserInvitationRepository } from './invitations/infrastructure/user-invitation.repository';
import { InvitationsController } from './invitations/interface/invitations.controller';
import { LocationRepository } from './infrastructure/location.repository';
import { OrganizationRepository } from './infrastructure/organization.repository';
import { UserLocationRepository } from './infrastructure/user-location.repository';
import { UserRepository } from './infrastructure/user.repository';
import { LocationController } from './interface/location.controller';
import { OrganizationController } from './interface/organization.controller';
import { UserController } from './interface/user.controller';

@Module({
  imports: [
    SharedModule,
    EmailModule,
    TypeOrmModule.forFeature([Organization, User, Location, UserLocation, UserInvitation]),
  ],
  controllers: [
    OrganizationController,
    UserController,
    LocationController,
    InvitationsController,
  ],
  providers: [
    OrganizationRepository,
    UserRepository,
    LocationRepository,
    UserLocationRepository,
    UserInvitationRepository,
    CreateOrganization,
    AssignUserToLocations,
    InvitationService,
  ],
  exports: [
    OrganizationRepository,
    UserRepository,
    LocationRepository,
    UserLocationRepository,
    UserInvitationRepository,
    CreateOrganization,
    AssignUserToLocations,
    InvitationService,
  ],
})
export class IamModule implements OnApplicationBootstrap {
  constructor(
    private readonly users: UserRepository,
    private readonly locations: LocationRepository,
    private readonly organizations: OrganizationRepository,
    private readonly registry: AuditResolverRegistry,
  ) {}

  onApplicationBootstrap(): void {
    this.registry.register('user', async (id) => {
      try {
        return (await this.users.findOneBy({ id })) ?? null;
      } catch {
        return null;
      }
    });
    this.registry.register('location', async (id) => {
      try {
        return (await this.locations.findOneBy({ id })) ?? null;
      } catch {
        return null;
      }
    });
    this.registry.register('organization', async (id) => {
      try {
        return (await this.organizations.findOneBy({ id })) ?? null;
      } catch {
        return null;
      }
    });
  }
}
