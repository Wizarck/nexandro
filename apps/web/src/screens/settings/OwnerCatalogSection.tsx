import {
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Tags, Trash2, Ruler, Upload, Download, FileText, X } from 'lucide-react';
import { useCurrentOrgId } from '../../lib/currentUser';
import {
  useCategoriesQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useUomsQuery,
} from '../../hooks/useCatalog';
import {
  useCommitCategoriesImportMutation,
  usePreviewCategoriesImportMutation,
} from '../../hooks/useCategoriesImport';
import type { CategoryResponse, UoMDefinition, UoMFamily } from '../../api/catalog';
import type {
  CategoriesImportMode,
  CategoriesPreviewResult,
} from '../../api/categoriesImport';
import { CSV_MAX_BYTES } from '../../api/categoriesImport';

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
  const [importOpen, setImportOpen] = useState(false);

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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-ink">
            <Tags aria-hidden="true" size={14} className="mr-1 inline" />
            Categorías
          </h3>
          <p className="mt-1 text-xs text-mute">
            Cómo agrupas tus ingredientes (carnes, lácteos, conservas…). Las marcadas «por
            defecto» vienen pre-sembradas; puedes borrarlas si no tienen ingredientes ni
            sub-categorías vinculados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-medium text-ink shadow-sm transition hover:bg-(--color-surface-strong) focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        >
          <Upload aria-hidden="true" size={14} />
          Importar CSV
        </button>
      </div>

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

      {importOpen && (
        <CategoriesImportModal orgId={orgId} onClose={() => setImportOpen(false)} />
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
// Importar CSV (modal)
// ============================================================================

const CSV_TEMPLATE = `nombre,padre,color
Entrantes,,#FFB347
Risottos,Entrantes,
Postres,,#E91E63
`;

type ImportStage = 'pick' | 'preview' | 'done';

function CategoriesImportModal({
  orgId,
  onClose,
}: {
  orgId: string;
  onClose: () => void;
}) {
  const previewMut = usePreviewCategoriesImportMutation(orgId);
  const commitMut = useCommitCategoriesImportMutation(orgId);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<ImportStage>('pick');
  const [mode, setMode] = useState<CategoriesImportMode>('skip-duplicates');
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [commitSummary, setCommitSummary] =
    useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [preview, setPreview] = useState<CategoriesPreviewResult | null>(null);

  const acceptFile = (f: File | null | undefined) => {
    setLocalError(null);
    if (!f) return;
    if (f.size > CSV_MAX_BYTES) {
      setLocalError(`El archivo supera el máximo de 1 MB (${(f.size / 1024).toFixed(0)} KB)`);
      return;
    }
    setFile(f);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0]);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => setDragOver(false);

  const onPreview = () => {
    if (!file) return;
    setLocalError(null);
    previewMut.mutate(file, {
      onSuccess: (data) => {
        setPreview(data);
        setStage('preview');
      },
    });
  };

  const onCommit = () => {
    if (!preview) return;
    commitMut.mutate(
      { new: preview.new, duplicates: preview.duplicates, mode },
      {
        onSuccess: (data) => {
          setCommitSummary(data);
          setStage('done');
        },
      },
    );
  };

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cat-import-title"
      data-testid="categories-import-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border-subtle bg-(--color-bg) p-6 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h4 id="cat-import-title" className="text-lg font-semibold text-ink">
              Importar categorías desde CSV
            </h4>
            <p className="mt-1 text-xs text-mute">
              Sube un CSV con columnas <code className="font-mono">nombre,padre,color</code>.
              Máximo 1 MB, 5 000 filas.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-md p-1 text-mute transition hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* ── Stage 1: pick ── */}
        {stage === 'pick' && (
          <div className="mt-5 space-y-4">
            <div
              data-testid="cat-import-dropzone"
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`rounded-md border-2 border-dashed p-6 text-center text-sm transition ${
                dragOver
                  ? 'border-(--color-accent) bg-(--color-accent-soft)'
                  : 'border-border-strong text-mute'
              }`}
            >
              <FileText aria-hidden="true" size={28} className="mx-auto mb-2 opacity-70" />
              <p className="text-ink">Arrastra tu CSV aquí o haz clic para seleccionar</p>
              <p className="mt-1 text-xs text-mute">Sólo `.csv` · máximo 1 MB</p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={onFileChange}
                aria-label="Subir archivo"
                className="mt-3 block w-full text-xs text-mute file:mr-3 file:rounded-md file:border-0 file:bg-(--color-accent) file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-(--color-accent-fg) hover:file:brightness-110"
              />
              {file && (
                <p className="mt-2 text-xs text-ink" data-testid="cat-import-filename">
                  {file.name} · {(file.size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>

            <a
              href={templateHref}
              download="categorias-plantilla.csv"
              className="inline-flex items-center gap-2 text-sm text-(--color-accent-press) underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            >
              <Download size={14} aria-hidden="true" />
              Descargar plantilla CSV
            </a>

            {localError && (
              <p role="alert" className="text-sm text-(--color-danger-fg)">
                {localError}
              </p>
            )}
            {previewMut.error && (
              <p role="alert" className="text-sm text-(--color-danger-fg)">
                No se pudo procesar el CSV: {previewMut.error.message}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-2 text-sm text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onPreview}
                disabled={!file || previewMut.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
              >
                {previewMut.isPending ? 'Analizando…' : 'Previsualizar'}
              </button>
            </div>
          </div>
        )}

        {/* ── Stage 2: preview ── */}
        {stage === 'preview' && preview && (
          <div className="mt-5 space-y-4">
            <p
              className="text-sm text-ink"
              data-testid="cat-import-summary"
            >
              <span className="font-semibold text-(--color-success-fg)">{preview.new.length}</span>{' '}
              categorías nuevas ·{' '}
              <span className="font-semibold text-(--color-status-below-target-fg)">
                {preview.duplicates.length}
              </span>{' '}
              duplicadas ·{' '}
              <span className="font-semibold text-(--color-danger-fg)">
                {preview.errors.length}
              </span>{' '}
              errores
            </p>

            <PreviewSection
              title={`Nuevas (${preview.new.length})`}
              tone="success"
              empty="Ninguna fila nueva."
            >
              {preview.new.map((r, i) => (
                <li key={`new-${i}`} className="py-1 text-sm">
                  <span className="text-ink">{r.name}</span>
                  {r.parentName && <span className="text-mute"> · padre: {r.parentName}</span>}
                  {r.color && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-mute">
                      <span
                        aria-hidden="true"
                        className="inline-block h-3 w-3 rounded-sm border border-border-subtle"
                        style={{ backgroundColor: r.color }}
                      />
                      {r.color}
                    </span>
                  )}
                </li>
              ))}
            </PreviewSection>

            <PreviewSection
              title={`Duplicadas (${preview.duplicates.length})`}
              tone="warn"
              empty="Sin duplicados."
            >
              {preview.duplicates.map((r, i) => (
                <li key={`dup-${i}`} className="py-1 text-sm">
                  <span className="text-ink">{r.name}</span>
                  {r.parentName && (
                    <span className="text-mute"> · padre propuesto: {r.parentName}</span>
                  )}
                </li>
              ))}
            </PreviewSection>

            <PreviewSection
              title={`Errores (${preview.errors.length})`}
              tone="danger"
              empty="Sin errores."
            >
              {preview.errors.map((e, i) => (
                <li key={`err-${i}`} className="py-1 text-sm text-(--color-danger-fg)">
                  fila {e.row}: {e.message}
                </li>
              ))}
            </PreviewSection>

            {preview.duplicates.length > 0 && (
              <fieldset className="rounded-md border border-border-subtle p-3">
                <legend className="px-1 text-xs font-medium text-mute">
                  Cómo tratar los duplicados
                </legend>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="cat-import-mode"
                    value="skip-duplicates"
                    checked={mode === 'skip-duplicates'}
                    onChange={() => setMode('skip-duplicates')}
                  />
                  Saltar duplicadas
                </label>
                <label className="mt-1 flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="cat-import-mode"
                    value="update-duplicates"
                    checked={mode === 'update-duplicates'}
                    onChange={() => setMode('update-duplicates')}
                  />
                  Actualizar duplicadas (reparenta si la fila cambia el padre)
                </label>
              </fieldset>
            )}

            {commitMut.error && (
              <p role="alert" className="text-sm text-(--color-danger-fg)">
                No se pudo importar: {commitMut.error.message}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setStage('pick');
                  setPreview(null);
                }}
                className="rounded-md px-3 py-2 text-sm text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={onCommit}
                disabled={commitMut.isPending || preview.new.length + preview.duplicates.length === 0}
                className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
              >
                {commitMut.isPending
                  ? 'Importando…'
                  : `Importar ${preview.new.length} categorías`}
              </button>
            </div>
          </div>
        )}

        {/* ── Stage 3: done ── */}
        {stage === 'done' && commitSummary && (
          <div className="mt-5 space-y-4">
            <p
              role="status"
              data-testid="cat-import-toast"
              className="rounded-md border border-border-subtle bg-(--color-accent-soft) p-3 text-sm text-ink"
            >
              Importación completada: {commitSummary.created} creadas,{' '}
              {commitSummary.updated} actualizadas, {commitSummary.skipped} saltadas.
            </p>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewSection({
  title,
  tone,
  empty,
  children,
}: {
  title: string;
  tone: 'success' | 'warn' | 'danger';
  empty: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toneClass =
    tone === 'success'
      ? 'text-(--color-success-fg)'
      : tone === 'warn'
        ? 'text-(--color-status-below-target-fg)'
        : 'text-(--color-danger-fg)';
  const items = Array.isArray(children) ? children : [children];
  const count = items.filter(Boolean).length;
  return (
    <details
      className="rounded-md border border-border-subtle"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className={`cursor-pointer list-none px-3 py-2 text-sm font-medium ${toneClass}`}>
        {title}
      </summary>
      <div className="border-t border-border-subtle px-3 py-2">
        {count === 0 ? (
          <p className="text-xs text-mute">{empty}</p>
        ) : (
          <ul className="divide-y divide-border-subtle">{children}</ul>
        )}
      </div>
    </details>
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
