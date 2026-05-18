import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { AgentChatWidget, RoleGuard } from '@nexandro/ui-kit';
import { useAgentChat } from './hooks/useAgentChat';
import { useCurrentRole } from './lib/currentUser';

const AGENT_ENABLED = String(import.meta.env.VITE_NEXANDRO_AGENT_ENABLED ?? '')
  .trim()
  .toLowerCase() === 'true';

const ORG_ID = String(import.meta.env.VITE_DEMO_ORG_ID ?? '');

type UserRole = 'OWNER' | 'MANAGER' | 'STAFF';

interface NavItem {
  to: string;
  label: string;
  /** Roles allowed to see this item. Empty = all roles (incl. unauthenticated). */
  roles?: ReadonlyArray<UserRole>;
}

interface NavGroup {
  label: string;
  items: ReadonlyArray<NavItem>;
}

/**
 * Top-nav grouped into 3 mental-model buckets per the 2026-05-18 UX
 * roundtable audit (Fase 0 L0-2). The 8-item flat list was unscannable
 * (Owner persona has no model for "AI obs" or "Cola revisión") and broke
 * on mobile (overflow + wrap). Groups:
 *
 *   Negocio       — Owner Sunday-night surfaces (Dashboard, Auditoría)
 *   Operaciones   — Manager/Staff daily work (HACCP, Recall, Foto, Cola)
 *   Configuración — Owner one-time + tech config (Configuración, IA)
 *
 * Mobile: hamburger toggles a slide-in drawer.
 * Tablet+: 3 clusters with `--border-strong` separators between them.
 */
const NAV_GROUPS: ReadonlyArray<NavGroup> = [
  {
    label: 'Negocio',
    items: [
      { to: '/owner-dashboard', label: 'Dashboard' },
      { to: '/audit-log', label: 'Auditoría', roles: ['OWNER', 'MANAGER'] },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { to: '/haccp/record', label: 'HACCP' },
      { to: '/compliance/export', label: 'Expediente APPCC', roles: ['OWNER', 'MANAGER'] },
      { to: '/recall/investigate', label: 'Recall', roles: ['OWNER', 'MANAGER'] },
      { to: '/photo-ingest/review', label: 'Foto-ingestión', roles: ['OWNER', 'MANAGER'] },
      { to: '/m3/review-queue', label: 'Cola revisión', roles: ['OWNER', 'MANAGER'] },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { to: '/owner-settings', label: 'Configuración', roles: ['OWNER'] },
      { to: '/ai-obs/dashboard', label: 'IA: gasto', roles: ['OWNER', 'MANAGER'] },
    ],
  },
];

export function App() {
  const { send } = useAgentChat();
  const currentRole = useCurrentRole();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change so a tap on a link doesn't leave it open.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Close drawer on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawerOpen]);

  return (
    <div className="min-h-full">
      <header className="border-b border-border-strong bg-surface px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-ink">nexandro</h1>

          {/* Mobile hamburger — visible <md (~768px) */}
          <button
            type="button"
            aria-label="Abrir menú"
            aria-expanded={drawerOpen}
            aria-controls="nav-drawer"
            onClick={() => setDrawerOpen((v) => !v)}
            className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-md border border-border-strong bg-surface text-ink shadow-sm md:hidden focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            <span aria-hidden="true" className="text-xl leading-none">☰</span>
          </button>

          {/* Desktop/tablet — visible >=md */}
          <nav
            aria-label="Navegación principal"
            className="ml-2 hidden flex-1 items-center md:flex"
          >
            {NAV_GROUPS.map((group, gi) => (
              <div
                key={group.label}
                className={
                  gi > 0 ? 'flex items-center gap-3 border-l border-border-strong pl-3 ml-3' : 'flex items-center gap-3'
                }
              >
                {group.items.map((item) => (
                  <RoleNavLink
                    key={item.to}
                    item={item}
                    currentRole={currentRole}
                  />
                ))}
              </div>
            ))}
          </nav>
        </div>

        {/* Mobile drawer (slides from the top, dismissed by overlay/Esc) */}
        {drawerOpen && (
          <>
            <div
              role="presentation"
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-black/30 md:hidden"
            />
            <nav
              id="nav-drawer"
              aria-label="Menú principal"
              className="fixed inset-x-0 top-0 z-50 mt-[60px] max-h-[calc(100vh-60px)] overflow-y-auto border-b border-border-strong bg-surface px-4 py-4 shadow-lg md:hidden"
            >
              {NAV_GROUPS.map((group) => (
                <section key={group.label} className="mb-5 last:mb-0">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">
                    {group.label}
                  </h2>
                  <ul className="flex flex-col gap-1">
                    {group.items.map((item) => (
                      <li key={item.to}>
                        <RoleNavLink item={item} currentRole={currentRole} block />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>
          </>
        )}
      </header>

      <main>
        <Outlet />
      </main>
      <AgentChatWidget
        agentEnabled={AGENT_ENABLED}
        organizationId={ORG_ID}
        userId=""
        onSend={send}
      />
    </div>
  );
}

function RoleNavLink({
  item,
  currentRole,
  block = false,
}: {
  item: NavItem;
  currentRole: UserRole | null;
  block?: boolean;
}) {
  const className = block
    ? 'block rounded-md px-3 py-2 text-base text-ink hover:bg-(--color-bg) focus:outline-none focus:ring-2 focus:ring-(--color-focus)'
    : 'text-sm text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)';

  const link = (
    <Link to={item.to} className={className}>
      {item.label}
    </Link>
  );

  if (item.roles && item.roles.length > 0) {
    return (
      <RoleGuard role={item.roles as UserRole[]} currentRole={currentRole}>
        {link}
      </RoleGuard>
    );
  }
  return link;
}
