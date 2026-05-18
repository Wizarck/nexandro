import { useCallback, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { EmptyStateCard, RoleGuard } from '@nexandro/ui-kit';
import { useCurrentRole } from '../lib/currentUser';
import { RetroactiveQueueRow } from './j13/RetroactiveQueueRow';
import type {
  RetroactiveQueueDemoRow,
} from './j13/RetroactiveQueueRow.types';

/**
 * j13 — Cambios retroactivos (retroactive reconciliation queue).
 *
 * Per `docs/ux/j13.md` §4 (Master-approved 2026-05-18 with all 5 §8 open
 * questions resolved). This is the Sprint 2 P3 skeleton: layout, severity
 * coding, 2 primary CTAs per row, demo-data toggle, tab navigation, empty
 * state with the v3-audit "honest placeholder" expectation.
 *
 * NOT in this PR (parked for follow-up slices):
 *   - Backend wiring to `m3_review_queue` (existing API at the old
 *     endpoint remains until its read-model is extended for the new
 *     event types).
 *   - Diff side-panel `<CorrectionsHistoryDiffModal>` adapter (j13 §9
 *     ~20 LOC).
 *   - Wiring `<RetroactiveBadge />` into Dashboard / Recetas /
 *     Etiquetas / HACCP surfaces (Master decision #2: nav removal after
 *     badges land).
 *   - `Escalar a Owner` tertiary (v3 audit Top-5 flag #4 — needs a new
 *     audit event type registration).
 *   - Cluster-confirm for shared `correction_id` (v3 audit Top-5 flag
 *     #3 — requires spec §7 amendment).
 *
 * The previous Lot/GR review-queue surface (PR #161) is replaced by this
 * j13 skeleton so we have one canonical pathway. The reusable demo rows
 * keep ops + sales conversations alive while the API integration lands.
 */
type ReviewTab = 'pendiente' | 'resuelto' | 'todo';

const DEMO_ROWS: RetroactiveQueueDemoRow[] = [
  {
    id: 'demo-1',
    category: 'coste',
    headline: 'Aceite oliva 5L · coste +0.04 €/g',
    downstream: 'Pizza Margarita',
    signedBy: 'iker',
    signedAt: '2026-05-12T10:00:00.000Z',
    detectedRelative: 'hace 2 h',
    triggerLabel: 'extracción albarán PA-2026-887',
    impactPct: 2.1,
    newValueLabel: '0.34 €/g (era 0.30 €/g)',
  },
  {
    id: 'demo-2',
    category: 'allergen',
    headline: 'Alérgenos override eliminado en Salsa pomodoro',
    downstream: 'Carbonara · Margarita · Diavola',
    signedBy: 'roberto',
    signedAt: '2026-04-30T18:00:00.000Z',
    detectedRelative: 'hace 6 h',
    triggerLabel: 'edición ficha receta',
    impactPct: 0,
    allergenRelevant: true,
    newValueLabel: 'matriz heredada (sin override)',
  },
  {
    id: 'demo-3',
    category: 'coste',
    headline: 'Mozzarella fior di latte · coste +12 % por nueva entrada',
    downstream: 'Pizza Margarita · Caprichosa',
    signedBy: 'roberto',
    signedAt: '2026-05-04T09:00:00.000Z',
    detectedRelative: 'hace 1 d',
    triggerLabel: 'recepción PA-2026-901 con nuevo proveedor',
    impactPct: 12,
    newValueLabel: '0.92 €/g (era 0.82 €/g)',
  },
];

const TAB_LABELS: ReadonlyArray<{ id: ReviewTab; label: string }> = [
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'resuelto', label: 'Resuelto' },
  { id: 'todo', label: 'Todo' },
];

export function ReviewQueueScreen() {
  const role = useCurrentRole();

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-6 py-6">
      <header className="space-y-1">
        <h1
          className="text-2xl font-semibold text-ink"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          Cambios retroactivos
        </h1>
        <p className="text-sm text-mute">
          Cambios upstream que afectan firmas existentes.
        </p>
      </header>
      <RoleGuard
        role={['OWNER', 'MANAGER']}
        currentRole={role}
        fallback={<AccessDenied />}
      >
        <Inner />
      </RoleGuard>
    </div>
  );
}

function Inner() {
  // Demo-data toggle: backend wiring is parked, so we start in the
  // "no demo" state to surface the v3-audit "honest placeholder" empty
  // state. The EmptyStateCard's secondary CTA flips the toggle.
  const [demoOn, setDemoOn] = useState(false);
  const [tab, setTab] = useState<ReviewTab>('pendiente');

  const allRows = demoOn ? DEMO_ROWS : [];

  // Resuelto / Todo lanes have no demo data yet; the API integration
  // (separate slice) will populate them. We render the EmptyStateCard
  // in those tabs so the UX feels intentional, not broken.
  const visibleRows: RetroactiveQueueDemoRow[] =
    tab === 'pendiente' ? allRows : [];

  const counts = useMemo(
    () => ({
      pendiente: allRows.length,
      resuelto: 0,
      todo: allRows.length,
    }),
    [allRows.length],
  );

  // No-op handlers pending backend wiring; the eventual mutation will
  // POST to `/m3/review-queue/<id>/re-sign` with { reason, newValue }.
  // The skeleton intentionally swallows actions so the demo flow runs
  // without side effects and without console noise in tests.
  const handleReSign = useCallback(
    (_row: RetroactiveQueueDemoRow, _reason?: string) => {},
    [],
  );
  const handleMaintain = useCallback((_row: RetroactiveQueueDemoRow) => {}, []);
  const handleOpenDiff = useCallback((_row: RetroactiveQueueDemoRow) => {}, []);

  const toggleDemo = useCallback(() => setDemoOn((v) => !v), []);

  return (
    <>
      <div
        role="tablist"
        aria-label="Filtros de cambios retroactivos"
        className="flex flex-wrap items-center gap-3 border-b border-border-strong pb-2"
      >
        {TAB_LABELS.map((t) => {
          const isActive = tab === t.id;
          const count = counts[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.id)}
              data-tab-id={t.id}
              className="rounded-md px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
              style={{
                color: isActive
                  ? 'var(--color-ink)'
                  : 'var(--color-mute)',
                borderBottom: isActive
                  ? '2px solid var(--color-accent)'
                  : '2px solid transparent',
              }}
            >
              {t.label}
              {t.id !== 'todo' && (
                <span
                  data-testid={`tab-count-${t.id}`}
                  className="ml-1.5 tabular-nums"
                  style={{
                    color: isActive
                      ? 'var(--color-ink)'
                      : 'var(--color-mute)',
                  }}
                >
                  ({count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {visibleRows.length === 0 ? (
        <div data-testid="retroactive-empty-wrapper">
          <EmptyStateCard
            Icon={CheckCircle2}
            title="Sin cambios retroactivos pendientes"
            body="Todas las firmas están al día con sus datos fuente."
          />
          {/*
            EmptyStateCard's secondary CTA is href-based; we need toggle
            semantics, so we render the demo toggle as a sibling button
            below the card instead of forking the primitive.
          */}
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={toggleDemo}
              data-testid="retroactive-demo-toggle"
              aria-pressed={demoOn}
              className="text-sm underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
              style={{ color: 'var(--color-accent-press)' }}
            >
              {demoOn ? 'Ocultar datos de ejemplo' : 'Ver con datos de ejemplo'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <ul
            aria-label="Cambios retroactivos pendientes"
            className="flex flex-col gap-3"
          >
            {visibleRows.map((row) => (
              <RetroactiveQueueRow
                key={row.id}
                row={row}
                onReSign={handleReSign}
                onMaintain={handleMaintain}
                onOpenDiff={handleOpenDiff}
              />
            ))}
          </ul>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={toggleDemo}
              data-testid="retroactive-demo-toggle"
              aria-pressed={demoOn}
              className="text-xs underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
              style={{ color: 'var(--color-accent-press)' }}
            >
              Ocultar datos de ejemplo
            </button>
          </div>
        </>
      )}
    </>
  );
}

function AccessDenied() {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6 text-mute">
      <p className="font-medium">
        Solo el Owner y el Manager pueden consultar los cambios retroactivos.
      </p>
      <p className="mt-1 text-xs">
        Si crees que esto es un error, contacta con el administrador.
      </p>
    </div>
  );
}
