import type { UserRole } from '@nexandro/ui-kit';

/**
 * Demo-time `currentRole` source. Reads `VITE_DEMO_USER_ROLE` from the Vite
 * env (baked at build time). Returns `null` when unset or invalid (forces
 * `<RoleGuard>` to render the fallback so the app behaves as if no user is
 * signed in).
 *
 * In production this hook will read the role from the JWT subject's `role`
 * claim once the auth flow lands (M3). The component contract is stable —
 * only the source of truth changes.
 */
export function useCurrentRole(): UserRole | null {
  const raw = import.meta.env.VITE_DEMO_USER_ROLE;
  if (raw === 'OWNER' || raw === 'MANAGER' || raw === 'STAFF') {
    return raw;
  }
  return null;
}

/**
 * Demo-time `organizationId` source. Reads `VITE_DEMO_ORG_ID`. Returns
 * `undefined` when unset; consumers should guard accordingly.
 */
export function useCurrentOrgId(): string | undefined {
  const raw = import.meta.env.VITE_DEMO_ORG_ID;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}
