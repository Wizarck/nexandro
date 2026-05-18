import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, LineChart, Thermometer, Tag, ArrowRight, type LucideIcon } from 'lucide-react';

/**
 * Wizard final card — "Listo" interstitial with quick-action CTAs.
 * Replaces the personas-jtbd.md §3 "celebration animation 🎉" with a
 * restrained value-card per DESIGN.md §1.1.
 *
 * Audit v2 A-3: emoji 🍷 dropped per project_nexandro_multisector_repositioning
 * (wine glass leaked HORECA-only positioning into a multi-sector product).
 * Sparkles is sector-neutral celebration.
 */
export function OnboardingComplete() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6 text-center" aria-label="Configuración completada">
      <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-(--color-accent-soft)">
        <Sparkles aria-hidden="true" size={28} className="text-(--color-accent)" />
      </div>
      <h2 className="font-display text-3xl text-ink">Listo. nexandro ya está configurado.</h2>
      <p className="mx-auto max-w-md text-sm text-mute">
        Esto es lo más útil que puedes hacer ahora mismo:
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <QuickAction
          to="/owner-dashboard"
          Icon={LineChart}
          title="Ver el dashboard"
          desc="Margen y platos top/bottom de los últimos 7 días."
        />
        <QuickAction
          to="/haccp/record"
          Icon={Thermometer}
          title="Registrar una lectura HACCP"
          desc="Tu equipo puede empezar a controlar CCPs hoy mismo."
        />
        <QuickAction
          to="/owner-settings/etiquetas"
          Icon={Tag}
          title="Configurar etiquetas"
          desc="Logotipo, impresora y plantilla para etiquetas EU 1169."
        />
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => navigate('/owner-dashboard')}
          className="inline-flex items-center gap-2 rounded-md border border-(--color-primary) bg-(--color-primary) px-6 py-2.5 text-sm font-semibold text-(--color-on-primary) shadow-sm transition hover:shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-(--color-focus) focus:ring-offset-2"
        >
          Ir al dashboard
          <ArrowRight aria-hidden="true" size={16} />
        </button>
      </div>
    </div>
  );
}

function QuickAction({
  to,
  Icon,
  title,
  desc,
}: {
  to: string;
  Icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="block rounded-lg border border-border-subtle bg-surface p-4 text-left transition hover:border-(--color-primary) hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
    >
      <Icon aria-hidden="true" size={22} className="text-(--color-accent)" />
      <h3 className="mt-2 text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-xs text-mute">{desc}</p>
    </Link>
  );
}
