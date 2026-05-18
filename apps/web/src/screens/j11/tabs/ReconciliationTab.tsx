import { useMemo, useState } from 'react';
import { useReconciliation } from '../../../hooks/useProcurement';
import { useCurrentRole } from '../../../lib/currentUser';
import type {
  ReconciliationDiscrepancyType,
  ReconciliationListItem,
  ReconciliationState,
} from '../../../api/procurement';
import { EmptyState, ErrorBox, Loading } from './shared';
import { ReconciliationDrawer } from './ReconciliationDrawer';

/**
 * j11 Procurement — Reconciliación tab.
 *
 * Backend aggregate landed in PR #226 (entity + migration) + PR #227
 * (repository + detector + service + real controller). Sprint 4 W3-6
 * adds the resolution drawer (this commit): each row is clickable and
 * opens a side-panel sheet with the side-by-side PO-vs-GR diff and the
 * three resolution actions (Aceptar diferencia · Solicitar nota de
 * crédito · Devolver). Owner approval gate enforces Manager
 * disabled-state on material discrepancies (j11 §6).
 *
 * Sprint 4 W3-9 adds the filter-chip group above the table (state ·
 * discrepancyType · supplier — all multi-select). Default lands on
 * `state=abierta` because that is the operator's working surface
 * (open reconciliations awaiting action); the user can clear the chip
 * to see resolved history.
 *
 * REMAINING FOLLOWUPS (Sprint 4 Wave 3+):
 *  - `request-owner-approval` endpoint + email-based escalation flow
 *  - GR draft creation on `Devolver` (currently state change only)
 *  - Supplier name autocomplete in the supplier filter chip group
 *    (today we render raw supplier_id chips — drawer already shows
 *    the supplierId and the suppliers list query is not yet wired
 *    into this tab).
 */
const STATE_CHIPS: ReadonlyArray<{ key: ReconciliationState; label: string }> = [
  { key: 'abierta', label: 'Abierta' },
  { key: 'aceptada', label: 'Aceptada' },
  { key: 'nota-credito', label: 'Nota de crédito' },
  { key: 'devuelta', label: 'Devuelta' },
];

const DISCREPANCY_CHIPS: ReadonlyArray<{
  key: ReconciliationDiscrepancyType;
  label: string;
}> = [
  { key: 'cantidad', label: 'Cantidad' },
  { key: 'precio', label: 'Precio' },
  { key: 'producto', label: 'Producto' },
  { key: 'lote-no-conforme', label: 'Lote no conforme' },
];

export function ReconciliationTab({ orgId }: { orgId: string }) {
  // Operator-priority default per W3-9: open reconciliations only.
  // User can toggle the chip to broaden the view; we never auto-select
  // resolved states on landing.
  const [stateFilter, setStateFilter] = useState<ReconciliationState[]>([
    'abierta',
  ]);
  const [discrepancyFilter, setDiscrepancyFilter] = useState<
    ReconciliationDiscrepancyType[]
  >([]);
  const [supplierFilter, setSupplierFilter] = useState<string[]>([]);

  const query = useReconciliation(orgId, {
    states: stateFilter,
    discrepancyTypes: discrepancyFilter,
    supplierIds: supplierFilter,
  });
  const role = useCurrentRole();
  const rows = useMemo(() => query.data?.items ?? [], [query.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  // Supplier chip options derive from the loaded rows — until the
  // suppliers query lands in this tab we surface only the supplier ids
  // that actually appear in the current page of reconciliations. Empty
  // state still renders the state + discrepancy chips so the operator
  // can broaden the filter without leaving the tab.
  const supplierOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows) {
      if (!seen.has(r.supplierId)) {
        seen.add(r.supplierId);
        out.push(r.supplierId);
      }
    }
    return out;
  }, [rows]);

  const filters = (
    <ReconciliationFilters
      stateFilter={stateFilter}
      discrepancyFilter={discrepancyFilter}
      supplierFilter={supplierFilter}
      supplierOptions={supplierOptions}
      onToggleState={(s) =>
        setStateFilter((cur) => toggleArrayValue(cur, s))
      }
      onToggleDiscrepancy={(d) =>
        setDiscrepancyFilter((cur) => toggleArrayValue(cur, d))
      }
      onToggleSupplier={(id) =>
        setSupplierFilter((cur) => toggleArrayValue(cur, id))
      }
      onClearAll={() => {
        setStateFilter(['abierta']);
        setDiscrepancyFilter([]);
        setSupplierFilter([]);
      }}
    />
  );

  if (query.isPending) {
    return (
      <div className="space-y-3">
        {filters}
        <Loading label="Cargando reconciliaciones…" />
      </div>
    );
  }
  if (query.error) {
    return (
      <div className="space-y-3">
        {filters}
        <ErrorBox message={query.error.message} />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        {filters}
        <EmptyState
          title="Aún no hay reconciliaciones abiertas"
          body="Cuando una recepción no cuadre con su OC (cantidad, precio, producto o lote no conforme) abriremos una reconciliación aquí. Tap en cualquier fila abre el drawer con la comparación PO-vs-GR y las acciones de resolución."
        />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {filters}
      <ReconciliationTable
        rows={rows}
        onRowClick={(row) => setSelectedId(row.id)}
      />
      {selected !== null && (
        <ReconciliationDrawer
          row={selected}
          role={role}
          orgId={orgId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

/**
 * Pure helper — flips a value in/out of a value-set without mutating
 * the input array. Inlined here to keep the tab self-contained (single
 * test surface).
 */
function toggleArrayValue<T>(arr: readonly T[], value: T): T[] {
  return arr.includes(value)
    ? arr.filter((v) => v !== value)
    : [...arr, value];
}

function ReconciliationFilters({
  stateFilter,
  discrepancyFilter,
  supplierFilter,
  supplierOptions,
  onToggleState,
  onToggleDiscrepancy,
  onToggleSupplier,
  onClearAll,
}: {
  stateFilter: ReconciliationState[];
  discrepancyFilter: ReconciliationDiscrepancyType[];
  supplierFilter: string[];
  supplierOptions: string[];
  onToggleState: (s: ReconciliationState) => void;
  onToggleDiscrepancy: (d: ReconciliationDiscrepancyType) => void;
  onToggleSupplier: (id: string) => void;
  onClearAll: () => void;
}) {
  const hasNonDefault =
    discrepancyFilter.length > 0 ||
    supplierFilter.length > 0 ||
    !(stateFilter.length === 1 && stateFilter[0] === 'abierta');
  return (
    <div
      data-testid="reconciliation-filters"
      className="rounded-md border border-border-strong bg-surface px-3 py-2"
    >
      <ChipGroup
        label="Estado"
        testId="reconciliation-filter-state"
        chips={STATE_CHIPS}
        selected={stateFilter}
        onToggle={onToggleState}
      />
      <ChipGroup
        label="Discrepancia"
        testId="reconciliation-filter-discrepancy"
        chips={DISCREPANCY_CHIPS}
        selected={discrepancyFilter}
        onToggle={onToggleDiscrepancy}
      />
      {supplierOptions.length > 0 && (
        <ChipGroup
          label="Proveedor"
          testId="reconciliation-filter-supplier"
          chips={supplierOptions.map((id) => ({
            key: id,
            label: shortenSupplier(id),
          }))}
          selected={supplierFilter}
          onToggle={onToggleSupplier}
        />
      )}
      {hasNonDefault && (
        <div className="mt-1">
          <button
            type="button"
            data-testid="reconciliation-filter-clear"
            onClick={onClearAll}
            className="text-xs text-mute underline hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            Restablecer filtros
          </button>
        </div>
      )}
    </div>
  );
}

function ChipGroup<T extends string>({
  label,
  testId,
  chips,
  selected,
  onToggle,
}: {
  label: string;
  testId: string;
  chips: ReadonlyArray<{ key: T; label: string }>;
  selected: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 py-1"
      role="group"
      aria-label={label}
      data-testid={testId}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-mute">
        {label}
      </span>
      {chips.map((c) => {
        const active = selected.includes(c.key);
        const style: React.CSSProperties = active
          ? {
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-accent-fg)',
              borderColor: 'var(--color-accent)',
            }
          : {
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-ink)',
            };
        return (
          <button
            key={c.key}
            type="button"
            role="checkbox"
            aria-checked={active}
            data-testid={`${testId}-chip-${c.key}`}
            data-active={active ? 'true' : 'false'}
            onClick={() => onToggle(c.key)}
            className="rounded-full border px-3 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            style={style}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Display helper — shows only the first 8 chars of the supplier UUID
 * in the chip label so the row stays scannable. The full id remains
 * accessible via `data-testid` and the drawer header.
 */
function shortenSupplier(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}

const DISCREPANCY_LABELS: Record<
  ReconciliationListItem['discrepancyType'],
  string
> = {
  cantidad: 'Cantidad',
  precio: 'Precio',
  producto: 'Producto',
  'lote-no-conforme': 'Lote no conforme',
};

const STATE_LABELS: Record<ReconciliationListItem['state'], string> = {
  abierta: 'Abierta',
  aceptada: 'Aceptada',
  'nota-credito': 'Nota de crédito',
  devuelta: 'Devuelta',
};

function ReconciliationTable({
  rows,
  onRowClick,
}: {
  rows: ReconciliationListItem[];
  onRowClick: (row: ReconciliationListItem) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border-strong">
      <table className="min-w-full divide-y divide-border-strong text-sm">
        <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-mute">
          <tr>
            <th className="px-3 py-2">PO#</th>
            <th className="px-3 py-2">Discrepancia</th>
            <th className="px-3 py-2">Diff</th>
            <th className="px-3 py-2">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-strong">
          {rows.map((row) => (
            <tr
              key={row.id}
              data-testid="reconciliation-row"
              data-row-id={row.id}
              tabIndex={0}
              role="button"
              aria-label={`Abrir reconciliación ${row.poNumber ?? 'sin OC'}`}
              onClick={() => onRowClick(row)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(row);
                }
              }}
              className="cursor-pointer text-ink hover:bg-surface focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-(--color-focus)"
            >
              <td className="px-3 py-2 font-medium">
                {row.poNumber ?? '—'}
              </td>
              <td className="px-3 py-2">
                {DISCREPANCY_LABELS[row.discrepancyType]}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-mute">
                {formatDiffSummary(row)}
              </td>
              <td className="px-3 py-2">{STATE_LABELS[row.state]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One-line preview of the diff column for the list view. Drawer holds
 * the full side-by-side. Keep terse so the table stays scannable.
 */
function formatDiffSummary(row: ReconciliationListItem): string {
  const d = row.diff;
  const fmt = (v: unknown) =>
    v === null || v === undefined ? '—' : String(v);
  switch (row.discrepancyType) {
    case 'cantidad':
      return `${fmt(d['expectedQty'])} → ${fmt(d['actualQty'])} ${fmt(d['unit'])}`.trim();
    case 'precio':
      return `${fmt(d['expectedUnitPrice'])} → ${fmt(d['actualUnitPrice'])} ${fmt(d['currency'])}`.trim();
    case 'producto':
      return `SKU ≠`;
    case 'lote-no-conforme':
      return `Lote ${fmt(d['lotId'])}`;
  }
}
