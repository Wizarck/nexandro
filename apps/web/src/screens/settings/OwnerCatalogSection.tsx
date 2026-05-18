import { useState, type FormEvent } from 'react';
import { Tags, Trash2, Ruler } from 'lucide-react';
import { useCurrentOrgId } from '../../lib/currentUser';
import {
  useCategoriesQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useUomsQuery,
} from '../../hooks/useCatalog';
import type { CategoryResponse, UoMDefinition, UoMFamily } from '../../api/catalog';

const FAMILY_LABELS: Record<UoMFamily, string> = {
  WEIGHT: 'Peso',
  VOLUME: 'Volumen',
  UNIT: 'Unidades',
};

/**
 * Catálogo · Sprint 3 Block B — combina dos vistas:
 *
 *   - Categorías de ingredientes (CRUD, salvo «por defecto» que vienen
 *     sembradas y se pueden borrar si no tienen hijos ni ingredientes).
 *   - Unidades de medida: registro canónico (read-only) declarado en
 *     `apps/api/src/ingredients/domain/uom/units.ts`. Cambiar requiere una
 *     migración + ADR; aquí sólo se listan para que el Owner sepa qué
 *     unidades existen.
 */
export function OwnerCatalogSection() {
  const orgId = useCurrentOrgId();
  if (!orgId) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Inicia sesión para gestionar tu catálogo.
      </p>
    );
  }
  return (
    <section className="space-y-8" aria-label="Catálogo">
      <header>
        <h2 className="font-display text-2xl text-ink">Catálogo</h2>
        <p className="mt-1 text-sm text-mute">
          Las categorías que organizan tus ingredientes + las unidades de medida soportadas.
        </p>
      </header>

      <CategoriesCard orgId={orgId} />
      <UomsCard />
    </section>
  );
}

// ============================================================================
// Categorías
// ============================================================================

function CategoriesCard({ orgId }: { orgId: string }) {
  const query = useCategoriesQuery(orgId);
  const create = useCreateCategoryMutation(orgId);
  const del = useDeleteCategoryMutation(orgId);
  const [newName, setNewName] = useState('');

  const canCreate = newName.trim().length > 0 && !create.isPending;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canCreate) return;
    const trimmed = newName.trim();
    create.mutate(
      {
        name: trimmed,
        nameEs: trimmed,
        nameEn: trimmed,
        parentId: null,
        sortOrder: 0,
      },
      {
        onSuccess: () => setNewName(''),
      },
    );
  };

  return (
    <article className="rounded-lg border border-border-subtle p-5">
      <h3 className="text-base font-semibold text-ink">
        <Tags aria-hidden="true" size={14} className="mr-1 inline" />
        Categorías
      </h3>
      <p className="mt-1 text-xs text-mute">
        Cómo agrupas tus ingredientes (carnes, lácteos, conservas…). Las marcadas «por defecto»
        vienen pre-sembradas; puedes borrarlas si no tienen ingredientes ni sub-categorías
        vinculados.
      </p>

      <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-end gap-2" aria-label="Nueva categoría">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="cat-new-name" className="mb-1 block text-sm font-medium text-mute">
            Nombre de la categoría
          </label>
          <input
            id="cat-new-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={100}
            placeholder="Ej: Pescado fresco"
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
        </div>
        <button
          type="submit"
          disabled={!canCreate}
          className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
        >
          {create.isPending ? 'Creando…' : 'Añadir categoría'}
        </button>
      </form>
      {create.error && (
        <p role="alert" className="mt-2 text-sm text-(--color-danger-fg)">
          No se pudo crear: {create.error.message}
        </p>
      )}

      {query.isLoading && <p className="mt-4 text-sm text-mute">Cargando categorías…</p>}
      {query.error && (
        <p role="alert" className="mt-4 text-sm text-(--color-danger-fg)">
          No se pudo cargar la lista: {query.error.message}
        </p>
      )}
      {query.data && query.data.length === 0 && (
        <p className="mt-4 text-sm text-mute">Aún no hay categorías.</p>
      )}
      {query.data && query.data.length > 0 && (
        <CategoryList rows={query.data} onDelete={(id) => del.mutate(id)} pending={del.isPending} />
      )}
      {del.error && (
        <p role="alert" className="mt-2 text-sm text-(--color-danger-fg)">
          No se pudo eliminar: {del.error.message}
        </p>
      )}
    </article>
  );
}

function CategoryList({
  rows,
  onDelete,
  pending,
}: {
  rows: CategoryResponse[];
  onDelete: (id: string) => void;
  pending: boolean;
}) {
  return (
    <ul className="mt-4 divide-y divide-border-subtle border-t border-border-subtle">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-ink">
              {row.parentId ? <span className="text-mute">↳ </span> : null}
              {row.nameEs || row.name}
            </p>
            {row.isDefault && (
              <span className="text-[10px] uppercase tracking-wide text-mute">por defecto</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDelete(row.id)}
            disabled={pending}
            aria-label={`Eliminar ${row.nameEs || row.name}`}
            className="inline-flex items-center gap-1 text-xs text-(--color-danger-fg) hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
          >
            <Trash2 aria-hidden="true" size={12} />
            Eliminar
          </button>
        </li>
      ))}
    </ul>
  );
}

// ============================================================================
// Unidades de medida (read-only)
// ============================================================================

function UomsCard() {
  const query = useUomsQuery();
  return (
    <article className="rounded-lg border border-border-subtle p-5">
      <h3 className="text-base font-semibold text-ink">
        <Ruler aria-hidden="true" size={14} className="mr-1 inline" />
        Unidades de medida
      </h3>
      <p className="mt-1 text-xs text-mute">
        Registro canónico — no editable desde la UI. Modificar el conjunto requiere migración y
        ADR (ver <code className="font-mono text-[11px]">apps/api/src/ingredients/domain/uom/units.ts</code>).
      </p>
      {query.isLoading && <p className="mt-4 text-sm text-mute">Cargando unidades…</p>}
      {query.error && (
        <p role="alert" className="mt-4 text-sm text-(--color-danger-fg)">
          No se pudo cargar la lista: {query.error.message}
        </p>
      )}
      {query.data && <UomsGrid rows={query.data} />}
    </article>
  );
}

function UomsGrid({ rows }: { rows: UoMDefinition[] }) {
  const grouped = groupByFamily(rows);
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-3">
      {(['WEIGHT', 'VOLUME', 'UNIT'] as UoMFamily[]).map((family) => (
        <div key={family} className="rounded-md border border-border-subtle p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">
            {FAMILY_LABELS[family]}
          </h4>
          <ul className="space-y-1 text-sm">
            {(grouped[family] ?? []).map((u) => (
              <li key={u.code} className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-ink">{u.code}</span>
                <span className="truncate text-xs text-mute" title={u.label}>
                  {u.label}
                </span>
              </li>
            ))}
            {(grouped[family] ?? []).length === 0 && (
              <li className="text-xs text-mute">—</li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

function groupByFamily(rows: UoMDefinition[]): Partial<Record<UoMFamily, UoMDefinition[]>> {
  const out: Partial<Record<UoMFamily, UoMDefinition[]>> = {};
  for (const r of rows) {
    (out[r.family] ??= []).push(r);
  }
  return out;
}
