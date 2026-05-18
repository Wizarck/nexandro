import { useState, type FormEvent } from 'react';
import { Truck, Trash2, Edit3 } from 'lucide-react';
import { useCurrentOrgId } from '../../lib/currentUser';
import {
  useCreateSupplierMutation,
  useDeleteSupplierMutation,
  useSuppliersQuery,
  useUpdateSupplierMutation,
} from '../../hooks/useSuppliers';
import type { SupplierResponse } from '../../api/suppliers';

/**
 * Proveedores · Sprint 4 W1-A — backs `/suppliers/*` (suppliers module).
 *
 * Tabla de proveedores activos + formulario inline create/edit. La desactivación
 * es soft-delete (`isActive=false`). Backend reality: el dominio Supplier no
 * tiene aún CIF/NIF (followup); aquí se muestra contacto (nombre + email/tel)
 * como columna identificadora secundaria.
 */
export function OwnerSuppliersSection() {
  const orgId = useCurrentOrgId();
  if (!orgId) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Inicia sesión para gestionar tus proveedores.
      </p>
    );
  }
  return <Content orgId={orgId} />;
}

function Content({ orgId }: { orgId: string }) {
  const query = useSuppliersQuery(orgId);
  const [editing, setEditing] = useState<SupplierResponse | 'new' | null>(null);

  return (
    <section className="space-y-6" aria-label="Proveedores">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">Proveedores</h2>
          <p className="mt-1 text-sm text-mute">
            Quién te vende cada ingrediente. Los proveedores aparecen en escandallos,
            albaranes y en el dossier de retirada cuando hay un incidente.
          </p>
        </div>
        {editing == null && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            Nuevo proveedor
          </button>
        )}
      </header>

      {editing != null && (
        <SupplierForm
          orgId={orgId}
          existing={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {query.isLoading && <p className="text-sm text-mute">Cargando proveedores…</p>}
      {query.error && (
        <p role="alert" className="text-sm text-(--color-danger-fg)">
          No se pudo cargar la lista: {query.error.message}
        </p>
      )}
      {query.data && (
        <SuppliersTable
          rows={query.data}
          onEdit={(row) => setEditing(row)}
          orgId={orgId}
        />
      )}
    </section>
  );
}

function SuppliersTable({
  rows,
  onEdit,
  orgId,
}: {
  rows: SupplierResponse[];
  onEdit: (row: SupplierResponse) => void;
  orgId: string;
}) {
  const del = useDeleteSupplierMutation(orgId);

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Aún no hay proveedores registrados. Usa «Nuevo proveedor» para crear el primero.
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
                <Truck aria-hidden="true" size={12} className="mr-1 inline" />
                Nombre
              </th>
              <th className="px-4 py-3 font-medium">País</th>
              <th className="px-4 py-3 font-medium">Contacto</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-mute">{row.country}</td>
                <td className="px-4 py-3 text-mute">{formatContact(row)}</td>
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
        Desactivar es reversible — el proveedor deja de aparecer aquí pero los
        albaranes históricos y trazabilidad se conservan.
      </p>
    </article>
  );
}

function formatContact(row: SupplierResponse): string {
  const parts: string[] = [];
  if (row.contactName) parts.push(row.contactName);
  if (row.email) parts.push(row.email);
  else if (row.phone) parts.push(row.phone);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function SupplierForm({
  orgId,
  existing,
  onDone,
}: {
  orgId: string;
  existing: SupplierResponse | null;
  onDone: () => void;
}) {
  const create = useCreateSupplierMutation(orgId);
  const update = useUpdateSupplierMutation(orgId);

  const [name, setName] = useState(existing?.name ?? '');
  const [country, setCountry] = useState(existing?.country ?? 'ES');
  const [contactName, setContactName] = useState(existing?.contactName ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');

  const isEdit = !!existing;
  const isPending = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const countryValid = /^[A-Z]{2}$/.test(country.trim());
  const canSubmit = name.trim().length > 0 && countryValid && !isPending;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    const patch = {
      name: name.trim(),
      country: country.trim().toUpperCase(),
      contactName: contactName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
    };
    if (isEdit && existing) {
      update.mutate({ id: existing.id, patch }, { onSuccess: onDone });
    } else {
      create.mutate(patch, { onSuccess: onDone });
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      aria-label={isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}
      className="space-y-3 rounded-lg border border-border-subtle bg-(--color-bg) p-5"
    >
      <h3 className="text-base font-semibold text-ink">
        {isEdit ? `Editar proveedor: ${existing!.name}` : 'Nuevo proveedor'}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="sup-name" className="mb-1 block text-sm font-medium text-mute">
            Nombre
          </label>
          <input
            id="sup-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
        </div>
        <div>
          <label htmlFor="sup-country" className="mb-1 block text-sm font-medium text-mute">
            País (ISO 2 letras)
          </label>
          <input
            id="sup-country"
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            maxLength={2}
            placeholder="ES"
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-ink uppercase focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
        </div>
      </div>
      <div>
        <label htmlFor="sup-contact" className="mb-1 block text-sm font-medium text-mute">
          Persona de contacto (opcional)
        </label>
        <input
          id="sup-contact"
          type="text"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          maxLength={200}
          placeholder="Ej: Luis Hernández (jefe comercial)"
          className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="sup-email" className="mb-1 block text-sm font-medium text-mute">
            Email (opcional)
          </label>
          <input
            id="sup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
        </div>
        <div>
          <label htmlFor="sup-phone" className="mb-1 block text-sm font-medium text-mute">
            Teléfono (opcional)
          </label>
          <input
            id="sup-phone"
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={32}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
        </div>
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
              : 'Crear proveedor'}
        </button>
      </div>
    </form>
  );
}
