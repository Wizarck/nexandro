import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * IAM user write capabilities — mirrors apps/api `UserController` 1:1.
 *
 *   iam.users.create         → POST   /users
 *   iam.users.update         → PATCH  /users/:id
 *   iam.users.changePassword → POST   /users/:id/change-password
 *   iam.users.addLocation    → POST   /users/:id/locations    (replaces full set)
 *   iam.users.removeLocation → DELETE /users/:id/locations/:locationId
 *
 * NOTE on `iam.users.addLocation`: the underlying REST endpoint is
 * `AssignLocationsDto` (locationIds array) which REPLACES the user's full
 * location set rather than appending one. The capability name retains the
 * `addLocation` label per the slice spec; the schema reflects the actual
 * REST contract (full-set replace).
 */

const idempotencyKey = z.string().optional();
const role = z.enum(['OWNER', 'MANAGER', 'STAFF']);

export const IAM_USERS_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'iam.users.create',
    title: 'Create a user',
    description:
      'Create a new user. Plaintext password is bcrypt-hashed at cost 12 before persisting; the plaintext never touches the database. Proxies POST /users.',
    schema: {
      organizationId: z.string().uuid(),
      name: z.string().min(1).max(200),
      email: z.string().email(),
      password: z.string().min(8),
      role,
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/users',
  },
  {
    name: 'iam.users.update',
    title: 'Update a user',
    description:
      'Update a user (mutable fields: name / email / role). Proxies PATCH /users/:id.',
    schema: {
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      email: z.string().email().optional(),
      role: role.optional(),
      idempotencyKey,
    },
    restMethod: 'PATCH',
    restPathTemplate: '/users/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: (input) => {
      const i = input as Record<string, unknown>;
      const { id: _id, idempotencyKey: _ik, ...body } = i;
      return body;
    },
  },
  {
    name: 'iam.users.changePassword',
    title: 'Change a user password',
    description:
      'Change a user password (plaintext input → bcrypt hash). Proxies POST /users/:id/change-password.',
    schema: {
      id: z.string().uuid(),
      newPassword: z.string().min(8),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/users/:id/change-password',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: (input) => ({
      newPassword: (input as { newPassword: string }).newPassword,
    }),
  },
  {
    name: 'iam.users.addLocation',
    title: "Replace a user's location assignment set",
    description:
      "Replace the user's location-assignment set (atomic delete-then-insert). Cross-tenant location IDs raise 400. Note: although named `addLocation`, this endpoint replaces the FULL set — pass every assigned `locationId` in `locationIds`. Proxies POST /users/:id/locations.",
    schema: {
      id: z.string().uuid(),
      locationIds: z.array(z.string().uuid()),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/users/:id/locations',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: (input) => ({
      locationIds: (input as { locationIds: string[] }).locationIds,
    }),
  },
  {
    name: 'iam.users.removeLocation',
    title: 'Remove a single location assignment from a user',
    description:
      'Remove a single location assignment. Proxies DELETE /users/:id/locations/:locationId.',
    schema: {
      id: z.string().uuid(),
      locationId: z.string().uuid(),
      idempotencyKey,
    },
    restMethod: 'DELETE',
    restPathTemplate: '/users/:id/locations/:locationId',
    restPathParams: (input) => {
      const i = input as { id: string; locationId: string };
      return { id: i.id, locationId: i.locationId };
    },
    restBodyExtractor: () => undefined,
  },
];
