import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

/**
 * Onboarding wizard shell per personas-jtbd.md §3 + audit 2026-05-18 L2-3.
 *
 * 5 steps mirror the discovery spec:
 *   1. Negocio       (Org name / currency / locale / timezone) — LIVE inline
 *   2. Sede          (first venue) — LIVE via redirect to /owner-settings/sedes
 *   3. Taxonomía     (default 35-row seed) — LIVE via redirect to /owner-settings/catalogo
 *   4. Administrador (invite Owner user) — LIVE via redirect to /owner-settings/equipo
 *   5. Primer plato  (deep-link to ingredients) — LIVE via redirect to /recipes
 *
 * Sprint 4 W1-C (2026-05-18): steps 2-5 were Sprint 1 placeholders ("pronto").
 * After Sprint 3 Block B landed the backing surfaces (sedes / equipo /
 * catalogo) and Sprint 3 Block A promoted /recipes out of /poc/*, every
 * step now hands off to a real surface via `OnboardingRedirectStep`.
 *
 * Route shape: `/onboarding/{1,2,3,4,5}/...`. Direct deep-links allowed.
 * Default `/onboarding` redirects to step 1.
 *
 * "Saltar por ahora" link visible on every step so the persona never gets
 * trapped in the wizard. Progress + step-numbers are the only chrome —
 * per DESIGN.md §1.1 restraint + persona §1.1 "low tech comfort".
 *
 * Demo-mode note: when DEMO_MODE=true the seed already creates the org +
 * owner + categories, so a first-time user landing on /onboarding sees
 * step 1 pre-filled with seed values. The wizard remains accessible as
 * a refresher / settings shortcut.
 */

export interface OnboardingStep {
  num: 1 | 2 | 3 | 4 | 5;
  slug: string;
  label: string;
  description: string;
  status: 'live' | 'placeholder';
}

export const ONBOARDING_STEPS: ReadonlyArray<OnboardingStep> = [
  {
    num: 1,
    slug: 'negocio',
    label: 'Tu negocio',
    description: 'Nombre, idioma, zona horaria y moneda.',
    status: 'live',
  },
  {
    num: 2,
    slug: 'sede',
    label: 'Tu primera sede',
    description: 'La ubicación física de tu cocina.',
    status: 'live',
  },
  {
    num: 3,
    slug: 'categorias',
    label: 'Categorías de ingredientes',
    description: 'Usa la taxonomía por defecto (35 categorías) o empieza vacío.',
    status: 'live',
  },
  {
    num: 4,
    slug: 'administrador',
    label: 'Tu equipo',
    description: 'Invita a tu jefe de cocina y a tu equipo.',
    status: 'live',
  },
  {
    num: 5,
    slug: 'primer-plato',
    label: 'Primer plato',
    description: '1 ingrediente + 1 proveedor + 1 precio = coste por porción en vivo.',
    status: 'live',
  },
];

export function OnboardingWizard() {
  const location = useLocation();
  // Redirect bare /onboarding → /onboarding/negocio.
  if (location.pathname === '/onboarding' || location.pathname === '/onboarding/') {
    return <Navigate to="/onboarding/negocio" replace />;
  }
  return (
    <div className="min-h-screen bg-(--color-bg)" style={{ backgroundColor: 'var(--color-bg)' }}>
      <header className="border-b border-border-strong bg-surface px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          <h1 className="text-lg font-semibold text-ink">nexandro · primera configuración</h1>
          <SkipLink />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Stepper />
        <section className="mt-6 rounded-lg border border-border-subtle bg-surface p-5 sm:p-8">
          <Outlet />
        </section>
      </main>
    </div>
  );
}

function SkipLink() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate('/owner-dashboard')}
      className="ml-auto text-sm text-mute underline-offset-2 hover:text-ink hover:underline focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
    >
      Saltar por ahora →
    </button>
  );
}

function Stepper() {
  const location = useLocation();
  return (
    // Audit v3 P0-3: was overflowing past the 1024px shell with badges.
    // Tighter gap (gap-1) + reduced step padding (px-2.5) + scrollbar
    // visible so the operator knows the queue continues if it ever does.
    <nav aria-label="Progreso de la configuración" className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-center gap-1">
        {ONBOARDING_STEPS.map((s) => {
          const to = `/onboarding/${s.slug}`;
          const active = location.pathname === to;
          // Audit v2 E-4 (Master pick): keep 5-step layout but mark
          // placeholder steps with a "próximamente" badge so the Owner
          // sees the roadmap without being misled into clicking a stub
          // expecting a real flow.
          const isPlaceholder = s.status === 'placeholder';
          return (
            <li key={s.num} className="flex items-center">
              <NavLink
                to={to}
                aria-disabled={isPlaceholder ? 'true' : undefined}
                className={[
                  'flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition',
                  'focus:outline-none focus:ring-2 focus:ring-(--color-focus)',
                  active
                    ? 'border-(--color-primary) bg-(--color-accent-soft) font-semibold text-ink'
                    : isPlaceholder
                      ? 'border-border-subtle bg-surface text-mute opacity-70 hover:text-ink'
                      : 'border-border-subtle bg-surface text-mute hover:text-ink',
                ].join(' ')}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums"
                  style={{
                    backgroundColor: active
                      ? 'var(--color-primary)'
                      : 'var(--color-bg)',
                    color: active ? 'var(--color-on-primary, #fff)' : 'var(--color-mute)',
                    border: active ? 'none' : '1px solid var(--color-border)',
                  }}
                >
                  {s.num}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
                {isPlaceholder && (
                  // Audit v3 P0-3: was `hidden sm:inline` which dropped the
                  // badge on mobile (the persona §1.1 is mobile-primary).
                  // Now always-inline so Owner sees the roadmap signal on
                  // every viewport. The label hides on mobile (the number
                  // alone is enough), but the badge survives as a 9px pill.
                  <span
                    className="ml-1 rounded-pill bg-(--color-warn-bg) px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide"
                    style={{ color: 'var(--color-status-below-target-fg)' }}
                  >
                    pronto
                  </span>
                )}
              </NavLink>
              {s.num < 5 && (
                <span
                  aria-hidden="true"
                  className="mx-1 hidden h-px w-4 sm:block"
                  style={{ backgroundColor: 'var(--color-border)' }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
