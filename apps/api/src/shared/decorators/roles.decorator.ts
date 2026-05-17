import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../iam/domain/user.entity';

export const ROLES_METADATA_KEY = 'nexandro:roles';

/**
 * `@Roles('OWNER', 'MANAGER')` on a controller method declares the minimum
 * role set that may invoke it. The accompanying `RolesGuard` reads this
 * metadata and rejects requests whose JWT role claim is not in the set.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_METADATA_KEY, roles);
