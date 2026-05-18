import { useState, type FormEvent } from 'react';
import { MapPin, Trash2, Edit3 } from 'lucide-react';
import { useCurrentOrgId } from '../../lib/currentUser';
import {
  useCreateLocationMutation,
  useDeleteLocationMutation,
  useLocationsQuery,
  useUpdateLocationMutation,
} from '../../hooks/useLocations';
import {
  LOCATION_TYPES,
  type LocationResponse,
  type LocationType,
} from '../../api/locations';

const TYPE_LABELS: Record<LocationType, string> = {
  RESTAURANT: 'Restaurante',
  BAR: 'Bar',
  DARK_KITCHEN: 'Dark kitchen',
  CATERING: 'Catering',
  CENTRAL_PRODUCTION: 'Obrador / producción central',
};

/**
 * Sedes · Sprint 3 Block B — backs `/locations/*`.
 *
 * Tabla de sedes activas + formulario inline create/edit. La desactivación
 * es soft-delete (`isActive=false`); para auditoría, las referencias
 * históricas siguen visibles en `/audit-log`.
 */
export function OwnerLocationsSection() {
  const orgId = useCurrentOrgId();
  if (!orgId) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Inicia sesión para gestionar tus sedes.
      </p>
    );
  }
  return <Content orgId={orgId} />;
}

function Content({ orgId }: { orgId: string }) {
  const query = useLocationsQuery(orgId);
  const [editing, setEditing] = useState<LocationResponse | 'new' | null>(null);

  return (
    <section className="space-y-6" aria-label="Sedes">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">Sedes</h2>
          <p className="mt-1 text-sm text-mute">
            Cada cocina, bar o dark-kitchen donde operas. Las sedes aparecen en HACCP, fotos de
            recepción y el registro de auditoría.
          </p>
        </div>
        {editing == null && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            Nueva sede
          </button>
        )}
      </header>

      {editing != null && (
        <LocationForm
          orgId={orgId}
          existing={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {query.isLoading && <p className="text-sm text-mute">Cargando sedes…</p>}
      {query.error && (
        <p role="alert" className="text-sm text-(--color-danger-fg)">
          No se pudo cargar la lista: {query.error.message}
        </p>
      )}
      {query.data && (
        <LocationsTable
          rows={query.data}
          onEdit={(row) => setEditing(row)}
          orgId={orgId}
        />
      )}
    </section>
  );
}

function LocationsTable({
  rows,
  onEdit,
  orgId,
}: {
  rows: LocationResponse[];
  onEdit: (row: LocationResponse) => void;
  orgId: string;
}) {
  const del = useDeleteLocationMutation(orgId);

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Aún no hay sedes registradas. Usa «Nueva sede» para crear la primera.
      </p>
    );
  }

  return (
    <article className="rounded-lg border border-border-subtle">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-mute">
              <th className="px-4 py-3 font-medium">
                <MapPin aria-hidden="true" size={12} className="mr-1 inline" />
                Nombre
              </th>
              <th className="px-4 py-3 font-medium">Dirección</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                <td className="px-4 py-3 text-mute">{row.address || '—'}</td>
                <td className="px-4 py-3 text-mute">{TYPE_LABELS[row.type]}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    aria-label={`Editar ${row.name}`}
                    className="mr-3 inline-flex items-center gap-1 text-xs text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
                  >
                    <Edit3 aria-hidden="true" size={12} />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => del.mutate(row.id)}
                    disabled={del.isPending}
                    aria-label={`Desactivar ${row.name}`}
                    className="inline-flex items-center gap-1 text-xs text-(--color-danger-fg) hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
                  >
                    <Trash2 aria-hidden="true" size={12} />
                    Desactivar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border-subtle px-4 py-2 text-xs text-mute">
        Desactivar es reversible — la sede deja de aparecer aquí pero el histórico (HACCP, fotos)
        se conserva.
      </p>
    </article>
  );
}

function LocationForm({
  orgId,
  existing,
  onDone,
}: {
  orgId: string;
  existing: LocationResponse | null;
  onDone: () => void;
}) {
  const create = useCreateLocationMutation(orgId);
  const update = useUpdateLocationMutation(orgId);

  const [name, setName] = useState(existing?.name ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [type, setType] = useState<LocationType>(existing?.type ?? 'RESTAURANT');

  const isEdit = !!existing;
  const isPending = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const canSubmit = name.trim().length > 0 && !isPending;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (isEdit && existing) {
      update.mutate(
        {
          id: existing.id,
          patch: { name: name.trim(), address: address.trim(), type },
        },
        { onSuccess: onDone },
      );
    } else {
      create.mutate(
        { name: name.trim(), address: address.trim(), type },
        { onSuccess: onDone },
      );
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      aria-label={isEdit ? 'Editar sede' : 'Nueva sede'}
      className="space-y-3 rounded-lg border border-border-subtle bg-(--color-bg) p-5"
    >
      <h3 className="text-base font-semibold text-ink">
        {isEdit ? `Editar sede: ${existing!.name}` : 'Nueva sede'}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="loc-name" className="mb-1 block text-sm font-medium text-mute">
            Nombre
          </label>
          <input
            id="loc-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
        </div>
        <div>
          <label htmlFor="loc-type" className="mb-1 block text-sm font-medium text-mute">
            Tipo
          </label>
          <select
            id="loc-type"
            value={type}
            onChange={(e) => setType(e.target.value as LocationType)}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            {LOCATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="loc-address" className="mb-1 block text-sm font-medium text-mute">
          Dirección (opcional)
        </label>
        <input
          id="loc-address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={500}
          placeholder="Calle, número, ciudad, código postal"
          className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-(--color-danger-fg)">
          No se pudo guardar: {error.message}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-transparent px-3 py-1.5 text-sm font-medium text-mute transition hover:bg-(--color-bg) focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
        >
          {isPending
            ? 'Guardando…'
            : isEdit
              ? 'Guardar cambios'
              : 'Crear sede'}
        </button>
      </div>
    </form>
  );
}
