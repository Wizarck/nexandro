import { useMemo, useState, type FormEvent } from 'react';
import { Carrot, Trash2, Edit3 } from 'lucide-react';
import { useCurrentOrgId } from '../../lib/currentUser';
import {
  useCreateIngredientMutation,
  useDeleteIngredientMutation,
  useIngredientsListQuery,
  useUpdateIngredientMutation,
} from '../../hooks/useIngredients';
import { useCategoriesQuery } from '../../hooks/useCatalog';
import {
  BASE_UNIT_TYPES,
  type BaseUnitType,
  type IngredientResponse,
} from '../../api/ingredients';
import type { CategoryResponse } from '../../api/catalog';

const UNIT_LABELS: Record<BaseUnitType, string> = {
  WEIGHT: 'Peso (g/kg)',
  VOLUME: 'Volumen (ml/L)',
  UNIT: 'Unidades',
};

/**
 * Ingredientes · Sprint 4 W1-A — backs `/ingredients/*` (ingredients module).
 *
 * Tabla de ingredientes activos + formulario inline create/edit. La
 * desactivación es soft-delete; los escandallos que referencian al ingrediente
 * siguen leyéndolo (read-side soft-delete). `baseUnitType` es inmutable
 * post-creación (cambiar peso↔volumen rompería la auditoría de coste).
 *
 * Backend reality: GET /ingredients es cursor-paginated; aquí agregamos todas
 * las páginas en una sola tabla. Para SMB con >1k ingredientes habrá que
 * paginar la UI (followup).
 */
export function OwnerIngredientsSection() {
  const orgId = useCurrentOrgId();
  if (!orgId) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Inicia sesión para gestionar tus ingredientes.
      </p>
    );
  }
  return <Content orgId={orgId} />;
}

function Content({ orgId }: { orgId: string }) {
  const query = useIngredientsListQuery(orgId);
  const categoriesQuery = useCategoriesQuery(orgId);
  const [editing, setEditing] = useState<IngredientResponse | 'new' | null>(null);

  const categoriesById = useMemo(() => {
    const map = new Map<string, CategoryResponse>();
    (categoriesQuery.data ?? []).forEach((c) => map.set(c.id, c));
    return map;
  }, [categoriesQuery.data]);

  return (
    <section className="space-y-6" aria-label="Ingredientes">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">Ingredientes</h2>
          <p className="mt-1 text-sm text-mute">
            Los ingredientes que entran en tus escandallos. La unidad base (peso /
            volumen / unidades) decide cómo se convierten cantidades en recetas y
            albaranes — es inmutable después de crear el ingrediente.
          </p>
        </div>
        {editing == null && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            Nuevo ingrediente
          </button>
        )}
      </header>

      {editing != null && (
        <IngredientForm
          orgId={orgId}
          existing={editing === 'new' ? null : editing}
          categories={categoriesQuery.data ?? []}
          onDone={() => setEditing(null)}
        />
      )}

      {query.isLoading && <p className="text-sm text-mute">Cargando ingredientes…</p>}
      {query.error && (
        <p role="alert" className="text-sm text-(--color-danger-fg)">
          No se pudo cargar la lista: {query.error.message}
        </p>
      )}
      {query.data && (
        <IngredientsTable
          rows={query.data}
          categoriesById={categoriesById}
          onEdit={(row) => setEditing(row)}
          orgId={orgId}
        />
      )}
    </section>
  );
}

function IngredientsTable({
  rows,
  categoriesById,
  onEdit,
  orgId,
}: {
  rows: IngredientResponse[];
  categoriesById: Map<string, CategoryResponse>;
  onEdit: (row: IngredientResponse) => void;
  orgId: string;
}) {
  const del = useDeleteIngredientMutation(orgId);

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Aún no hay ingredientes registrados. Usa «Nuevo ingrediente» para crear el primero.
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
                <Carrot aria-hidden="true" size={12} className="mr-1 inline" />
                Nombre
              </th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium">Unidad base</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const cat = categoriesById.get(row.categoryId);
              return (
                <tr key={row.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3 text-mute">
                    {cat ? (cat.nameEs || cat.name) : '—'}
                  </td>
                  <td className="px-4 py-3 text-mute">{UNIT_LABELS[row.baseUnitType]}</td>
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
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border-subtle px-4 py-2 text-xs text-mute">
        Desactivar es reversible — el ingrediente deja de aparecer aquí pero los
        escandallos históricos lo siguen leyendo.
      </p>
    </article>
  );
}

function IngredientForm({
  orgId,
  existing,
  categories,
  onDone,
}: {
  orgId: string;
  existing: IngredientResponse | null;
  categories: CategoryResponse[];
  onDone: () => void;
}) {
  const create = useCreateIngredientMutation(orgId);
  const update = useUpdateIngredientMutation(orgId);

  const [name, setName] = useState(existing?.name ?? '');
  const [categoryId, setCategoryId] = useState(
    existing?.categoryId ?? (categories[0]?.id ?? ''),
  );
  const [baseUnitType, setBaseUnitType] = useState<BaseUnitType>(
    existing?.baseUnitType ?? 'WEIGHT',
  );

  const isEdit = !!existing;
  const isPending = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const canSubmit =
    name.trim().length > 0 && categoryId.length > 0 && !isPending;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (isEdit && existing) {
      // baseUnitType is immutable post-creation (backend rejects it on PATCH).
      update.mutate(
        {
          id: existing.id,
          patch: { name: name.trim(), categoryId },
        },
        { onSuccess: onDone },
      );
    } else {
      create.mutate(
        { name: name.trim(), categoryId, baseUnitType },
        { onSuccess: onDone },
      );
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      aria-label={isEdit ? 'Editar ingrediente' : 'Nuevo ingrediente'}
      className="space-y-3 rounded-lg border border-border-subtle bg-(--color-bg) p-5"
    >
      <h3 className="text-base font-semibold text-ink">
        {isEdit ? `Editar ingrediente: ${existing!.name}` : 'Nuevo ingrediente'}
      </h3>
      <div>
        <label htmlFor="ing-name" className="mb-1 block text-sm font-medium text-mute">
          Nombre
        </label>
        <input
          id="ing-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ing-category" className="mb-1 block text-sm font-medium text-mute">
            Categoría
          </label>
          <select
            id="ing-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            {categories.length === 0 && <option value="">— sin categorías —</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameEs || c.name}
              </option>
            ))}
          </select>
          {categories.length === 0 && (
            <p className="mt-1 text-xs text-(--color-danger-fg)">
              Crea al menos una categoría en «Catálogo» antes de añadir
              ingredientes.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="ing-unit" className="mb-1 block text-sm font-medium text-mute">
            Unidad base
          </label>
          <select
            id="ing-unit"
            value={baseUnitType}
            onChange={(e) => setBaseUnitType(e.target.value as BaseUnitType)}
            disabled={isEdit}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
          >
            {BASE_UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {UNIT_LABELS[t]}
              </option>
            ))}
          </select>
          {isEdit && (
            <p className="mt-1 text-xs text-mute">
              La unidad base no se puede cambiar después de crear el ingrediente.
            </p>
          )}
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
              : 'Crear ingrediente'}
        </button>
      </div>
    </form>
  );
}
