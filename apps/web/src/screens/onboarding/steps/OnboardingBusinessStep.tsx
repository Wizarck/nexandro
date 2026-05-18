import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentOrgId } from '../../../lib/currentUser';
import { useOrganizationMutation, useOrganizationQuery } from '../../../hooks/useOrganization';

/**
 * Step 1 — Negocio (live).
 * Mirrors personas-jtbd.md §3 Step 1 + the equivalent fields in
 * /owner-settings/negocio, but framed as "first run" with a single primary
 * CTA "Siguiente →" so the operator never has to think about navigation.
 */
export function OnboardingBusinessStep() {
  const navigate = useNavigate();
  const orgId = useCurrentOrgId();
  const query = useOrganizationQuery(orgId ?? undefined);
  const mutation = useOrganizationMutation(orgId ?? undefined);

  const [name, setName] = useState<string>('');
  const [locale, setLocale] = useState<string>('es');
  const [timezone, setTimezone] = useState<string>('Europe/Madrid');
  const [hydrated, setHydrated] = useState(false);

  if (query.data && !hydrated) {
    setName(query.data.name);
    setLocale(query.data.defaultLocale);
    setTimezone(query.data.timezone);
    setHydrated(true);
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orgId) {
      navigate('/onboarding/sede');
      return;
    }
    try {
      await mutation.mutateAsync({
        name: name.trim(),
        defaultLocale: locale.trim(),
        timezone: timezone.trim(),
      });
      navigate('/onboarding/sede');
    } catch {
      // error rendered below
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-label="Paso 1 · negocio">
      <header>
        <p
          className="text-xs uppercase tracking-[0.08em]"
          style={{ color: 'var(--color-mute)' }}
        >
          Paso 1 de 5
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-ink">Hablemos de tu negocio</h2>
        <p className="mt-1 text-sm text-mute">
          Estos datos aparecen en etiquetas, exportes APPCC y comunicaciones. Puedes cambiarlos
          después en Configuración → Negocio.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-mute" htmlFor="onb-name">
            Nombre del negocio
          </label>
          <input
            id="onb-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            placeholder="Ej: Trattoria Palafito Madrid"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-mute" htmlFor="onb-locale">
            Idioma
          </label>
          <select
            id="onb-locale"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-mute" htmlFor="onb-tz">
            Zona horaria
          </label>
          <input
            id="onb-tz"
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            maxLength={64}
            placeholder="Europe/Madrid"
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
        </div>
      </div>

      {mutation.error && (
        <p role="alert" className="text-sm text-(--color-danger-fg)">
          No se pudo guardar: {mutation.error.message}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-xs text-mute">Aprox. 30 segundos.</p>
        <button
          type="submit"
          disabled={mutation.isPending || name.trim() === ''}
          className="inline-flex items-center gap-2 rounded-md border border-(--color-primary) bg-(--color-primary) px-6 py-2.5 text-sm font-semibold text-(--color-on-primary) shadow-sm transition hover:shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-(--color-focus) focus:ring-offset-2 disabled:opacity-60"
        >
          {mutation.isPending ? 'Guardando…' : 'Siguiente →'}
        </button>
      </div>
    </form>
  );
}
