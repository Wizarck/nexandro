import { NavLink, Outlet } from 'react-router-dom';
import { RoleGuard } from '@nexandro/ui-kit';
import { useCurrentRole } from '../../lib/currentUser';

/**
 * Settings shell per audit 2026-05-18 L2-1, extended in Sprint 3 Block B
 * with the 4 Settings-críticos surfaces (audit 2026-05-18 backend gap —
 * 4 controllers had zero frontend representation) and in Sprint 4 W1-B with
 * the 2 reference-data tabs (FSMS standards + External catalog).
 *
 *   Negocio          — identity (name, locale, timezone, currency)
 *   Sedes            — `/locations/*` CRUD                        [Block B]
 *   Equipo           — `/users/*` list + provision                [Block B]
 *   Catálogo         — `/categories/*` + `/uom` read-only         [Block B]
 *   Normativa HACCP  — `/m3/haccp/fsms-standards` read-only       [W1-B]
 *   Catálogo externo — OFF mirror health + manual sync (Owner)    [W1-B]
 *   Etiquetas        — the existing LabelFieldsForm
 *   IA               — `/agent-credentials/*` MCP attribution     [Block B]
 *   Privacidad       — GDPR core (DPO, retention, export, delete)
 *   ⊘ Facturación    — Enterprise tier, R10
 *   ⊘ Integraciones  — Telemetría OTLP advanced; POS hooks
 *   ⊘ Avanzado: IA   — relocated AI-obs dashboard inspector
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
        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
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
  { to: '/owner-settings/sedes', label: 'Sedes', enabled: true },
  { to: '/owner-settings/equipo', label: 'Equipo', enabled: true },
  { to: '/owner-settings/catalogo', label: 'Catálogo', enabled: true },
  // Sprint 4 W1-B — reference data tabs (read-only browse / mirror status).
  { to: '/owner-settings/normativa-haccp', label: 'Normativa HACCP', enabled: true },
  { to: '/owner-settings/catalogo-externo', label: 'Catálogo externo', enabled: true },
  { to: '/owner-settings/etiquetas', label: 'Etiquetas', enabled: true },
  { to: '/owner-settings/ia', label: 'IA', enabled: true },
  { to: '/owner-settings/privacidad', label: 'Privacidad y datos', enabled: true },
  { to: '/owner-settings/facturacion', label: 'Facturación', enabled: false },
  { to: '/owner-settings/integraciones', label: 'Integraciones', enabled: false },
  // Audit v2 E-1: "IA: gasto" relocated from top-nav into Configuración.
  // Today still lives at /ai-obs/dashboard for direct access; future slice
  // collapses the inspector view here behind a "ver detalles" link.
  { to: '/owner-settings/avanzado-ia', label: 'Avanzado: IA', enabled: false },
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
