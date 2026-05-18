import { NavLink, Outlet } from 'react-router-dom';
import { RoleGuard } from '@nexandro/ui-kit';
import { useCurrentRole } from '../../lib/currentUser';

/**
 * Settings shell per audit 2026-05-18 L2-1.
 *
 * Was: single screen /owner-settings rendered just the label-printing form,
 * which created an IA mismatch ("Configuración" nav → "Configuración de
 * etiquetas" page) and silently hid 90 % of the surfaces the Owner role
 * promises (per personas-jtbd.md §2 RBAC: org settings, users & roles,
 * billing, locations, integrations).
 *
 * Now: left-nav shell with 3 ship-able sections and 4 "Próximamente" rows.
 * Honest about what's in scope today + what's coming.
 *
 *   Negocio       — identity (name, locale, timezone, currency)
 *   Etiquetas     — the existing LabelFieldsForm
 *   Privacidad    — GDPR placeholders (DPO, retention, export, delete)
 *   ⊘ Sedes       — next slice (multi-venue)
 *   ⊘ Usuarios    — next slice (R8 real auth + invite flow)
 *   ⊘ Facturación — Enterprise tier, R10
 *   ⊘ Integraciones — Telemetría OTLP advanced; POS hooks
 */
export function OwnerSettingsShell() {
  const role = useCurrentRole();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Configuración</h1>
      <RoleGuard
        role="OWNER"
        currentRole={role}
        fallback={
          <div className="rounded-lg border border-dashed border-border-strong p-6 text-mute">
            Sólo el propietario puede modificar la configuración de la organización.
          </div>
        }
      >
        <div className="grid gap-6 md:grid-cols-[220px,1fr]">
          <SectionNav />
          <section className="min-w-0">
            <Outlet />
          </section>
        </div>
      </RoleGuard>
    </div>
  );
}

interface SectionLink {
  to: string;
  label: string;
  enabled: boolean;
}

const SECTIONS: ReadonlyArray<SectionLink> = [
  { to: '/owner-settings/negocio', label: 'Negocio', enabled: true },
  { to: '/owner-settings/etiquetas', label: 'Etiquetas', enabled: true },
  { to: '/owner-settings/privacidad', label: 'Privacidad y datos', enabled: true },
  { to: '/owner-settings/sedes', label: 'Sedes', enabled: false },
  { to: '/owner-settings/usuarios', label: 'Usuarios y permisos', enabled: false },
  { to: '/owner-settings/facturacion', label: 'Facturación', enabled: false },
  { to: '/owner-settings/integraciones', label: 'Integraciones', enabled: false },
];

function SectionNav() {
  return (
    <nav aria-label="Secciones de configuración" className="md:sticky md:top-4 md:self-start">
      <ul className="flex flex-col gap-1">
        {SECTIONS.map((s) => (
          <li key={s.to}>
            {s.enabled ? (
              <NavLink
                to={s.to}
                className={({ isActive }) =>
                  [
                    'block rounded-md px-3 py-2 text-sm transition',
                    'focus:outline-none focus:ring-2 focus:ring-(--color-focus)',
                    isActive
                      ? 'bg-(--color-accent-soft) font-semibold text-ink'
                      : 'text-ink hover:bg-(--color-bg)',
                  ].join(' ')
                }
              >
                {s.label}
              </NavLink>
            ) : (
              <span
                className="block cursor-not-allowed rounded-md px-3 py-2 text-sm italic"
                style={{ color: 'var(--color-mute)' }}
                title="Próximamente"
              >
                {s.label}
                <span className="ml-2 text-[10px] uppercase tracking-wide">próximamente</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
