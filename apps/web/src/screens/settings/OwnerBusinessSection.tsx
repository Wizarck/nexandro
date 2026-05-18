import { useState, type FormEvent } from 'react';
import { useCurrentOrgId } from '../../lib/currentUser';
import { useOrganizationQuery, useOrganizationMutation } from '../../hooks/useOrganization';

/**
 * Negocio settings section — org name, locale, timezone, currency (read-only
 * per ADR-007 currency-is-immutable). Live today: name + locale + timezone
 * editable. Coming soon (separate slice): CIF/NIF/VAT, legal name vs trading
 * name, fiscal address.
 *
 * The Owner persona's mental model is "estos son los datos de mi empresa
 * que aparecen en etiquetas, facturas, comunicaciones". So this section
 * mirrors what the rest of the system reads from `organizations` (name +
 * currency + locale + timezone).
 */
export function OwnerBusinessSection() {
  const orgId = useCurrentOrgId();
  if (!orgId) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Inicia sesión para ver los datos del negocio.
      </p>
    );
  }
  return <Form orgId={orgId} />;
}

function Form({ orgId }: { orgId: string }) {
  const query = useOrganizationQuery(orgId);
  const mutation = useOrganizationMutation(orgId);

  const [name, setName] = useState<string>('');
  const [locale, setLocale] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once when the org loads.
  if (query.data && !hydrated) {
    setName(query.data.name);
    setLocale(query.data.defaultLocale);
    setTimezone(query.data.timezone);
    setHydrated(true);
  }

  if (query.isLoading) {
    return <p className="text-sm text-mute">Cargando datos del negocio…</p>;
  }
  if (query.error) {
    return (
      <p role="alert" className="text-sm text-(--color-danger-fg)">
        Error al cargar: {query.error.message}
      </p>
    );
  }
  if (!query.data) return null;
  const org = query.data;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    mutation.mutate({
      name: name.trim(),
      defaultLocale: locale.trim(),
      timezone: timezone.trim(),
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-label="Datos del negocio">
      <header>
        <h2 className="font-display text-2xl text-ink">Negocio</h2>
        <p className="mt-1 text-sm text-mute">
          Estos datos identifican tu organización en etiquetas, exportaciones APPCC y comunicaciones.
        </p>
      </header>

      <fieldset className="space-y-3 rounded-lg border border-border-subtle p-5">
        <legend className="ml-2 px-2 text-sm font-semibold text-ink">Identidad</legend>

        <div>
          <label className="mb-1 block text-sm font-medium text-mute" htmlFor="org-name">
            Nombre del negocio
          </label>
          <input
            id="org-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-mute" htmlFor="org-locale">
              Idioma por defecto
            </label>
            <select
              id="org-locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            >
              <option value="es">Español (es)</option>
              <option value="en">English (en)</option>
            </select>
            <p className="mt-1 text-xs text-mute">Se aplica a labels, exports APPCC y notificaciones.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-mute" htmlFor="org-tz">
              Zona horaria
            </label>
            <input
              id="org-tz"
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              maxLength={64}
              placeholder="Europe/Madrid"
              className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-mute">Moneda</label>
          <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-(--color-bg) px-3 py-2 text-sm text-mute">
            <span className="font-mono">{org.currencyCode}</span>
            <span className="text-xs">· no editable (ADR-007)</span>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border border-dashed border-border-subtle p-5 opacity-70">
        <legend className="ml-2 px-2 text-sm font-semibold text-ink">
          Identidad fiscal <span className="text-xs font-normal italic text-mute">próximamente</span>
        </legend>
        <p className="text-sm text-mute">
          Pronto podrás añadir CIF/NIF/VAT, razón social y domicilio fiscal —
          los datos que tu asesoría te pide para facturas y exportes oficiales.
          Te avisaremos en cuanto esté disponible.
        </p>
      </fieldset>

      {mutation.error && (
        <p role="alert" className="text-sm text-(--color-danger-fg)">
          No se pudieron guardar los cambios: {mutation.error.message}
        </p>
      )}
      {mutation.isSuccess && (
        <p role="status" className="text-sm text-(--color-success-fg)">
          ✓ Cambios guardados
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 rounded-md border border-(--color-primary) bg-(--color-primary) px-6 py-2.5 text-sm font-semibold text-(--color-on-primary) shadow-sm transition hover:shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-(--color-focus) focus:ring-offset-2"
        >
          <span aria-hidden="true">💾</span>
          {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
