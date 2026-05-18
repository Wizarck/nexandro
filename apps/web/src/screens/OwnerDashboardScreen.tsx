import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Store } from 'lucide-react';
import {
  MenuItemRanker,
  Sparkline,
  cn,
  type DashboardMenuItem,
} from '@nexandro/ui-kit';
import { useDashboardKpis } from '../hooks/useDashboardKpis';
import { useDashboardMenuItems } from '../hooks/useDashboardMenuItems';
import { useOrganizationQuery } from '../hooks/useOrganization';
import { getDemoMenuItems, isDemoModeActive } from '../hooks/useDemoMenuItems';
import type { DashboardKpis } from '../api/dashboardKpis';

/**
 * Canonical Owner dashboard for Journey 3 — Roberto's Sunday-night view.
 *
 * Audit 2026-05-18 v3 BLOCKERS addressed (Sprint 2 P2):
 *   - P2-1: Margen promoted to lead. 60/40 grid (hero + stacked secondary KPIs),
 *     replacing the 4-equal-rectangles anti-pattern flagged in DESIGN.md §9.
 *   - P2-2: MenuItemRanker on demo data when org is empty + demo flag set, so
 *     the page demonstrably answers §1.1 JTBD on first contact.
 *   - P2-3: Trust spine — venue chip + as-of timestamp + reload button, so
 *     the Owner can answer "which restaurant?" and "is this fresh?" before
 *     trusting the numbers (j3.md §1; CFO + Hostelería personas).
 *   - A4 density pass: lead card gets `p-6`, secondary cards `p-5`, section
 *     gaps `mb-8`, hover state on secondaries (border-strong on `:hover`).
 *
 * Pass `?organizationId=<id>` in the URL or set `VITE_DEMO_ORG_ID`.
 * Pass `?demo=true` (or set `VITE_DEMO_MODE=true`) to swap empty rankings for
 * Italian-trattoria seed data.
 */
export function OwnerDashboardScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orgId =
    params.get('organizationId') ??
    (import.meta.env.VITE_DEMO_ORG_ID as string | undefined) ??
    undefined;
  const windowDays = 7;
  const demoMode = isDemoModeActive(params);

  const top = useDashboardMenuItems(orgId, 'top', windowDays);
  const bottom = useDashboardMenuItems(orgId, 'bottom', windowDays);
  const kpis = useDashboardKpis(orgId, windowDays);
  const org = useOrganizationQuery(orgId);

  const loading = top.isLoading || bottom.isLoading;

  // P2-2: when the real ranker comes back empty AND demo mode is active,
  // swap in the Italian-trattoria fixtures so the page answers §1.1 JTBD
  // on first contact. We only swap when BOTH lists are empty — partial
  // real data is always shown as-is.
  const realTop = top.data?.items ?? [];
  const realBottom = bottom.data?.items ?? [];
  const bothEmpty = realTop.length === 0 && realBottom.length === 0;
  const useDemoData = demoMode && bothEmpty && !loading;
  const demo = useMemo(() => (useDemoData ? getDemoMenuItems() : null), [useDemoData]);
  const rankerTop: DashboardMenuItem[] = demo ? demo.top : realTop;
  const rankerBottom: DashboardMenuItem[] = demo ? demo.bottom : realBottom;

  function onViewDetails(item: DashboardMenuItem) {
    navigate(`/recipes/cost-drift?recipeId=${item.recipeId}`);
  }

  // Use a static date in tests; otherwise live wall-clock.
  const asOfLabel = formatAsOf(kpis.dataUpdatedAt, windowDays);
  const venueLabel = org.data?.name ?? 'Trattoria';

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-ink">Panel del propietario</h1>
        <p className="text-sm text-mute">
          Los 5 platos con mejor y peor margen de los últimos {windowDays} días. Toca una tarjeta
          para ver el detalle del margen.
        </p>

        {/* P2-3: trust spine — venue + as-of + reload. Small chips with subtle borders. */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <span
            aria-label="Restaurante actual"
            className="inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1"
            style={{
              color: 'var(--color-mute)',
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
            }}
          >
            <Store size={12} aria-hidden="true" />
            {venueLabel}
          </span>
          <span
            aria-label="Sello temporal de los datos"
            className="inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 tabular-nums"
            style={{
              color: 'var(--color-mute)',
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {asOfLabel}
          </span>
          <button
            type="button"
            onClick={() => {
              kpis.refetch();
              top.refetch();
              bottom.refetch();
            }}
            aria-label="Recargar KPIs"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1',
              'hover:border-border-strong',
            )}
            style={{
              color: 'var(--color-mute)',
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              minHeight: '28px',
            }}
            disabled={kpis.isFetching}
          >
            <RefreshCw
              size={12}
              aria-hidden="true"
              className={kpis.isFetching ? 'animate-spin' : ''}
            />
            Recargar
          </button>
        </div>

        {!orgId && (
          <p className="mt-2 text-sm text-mute">
            Añade <code>?organizationId=&lt;uuid&gt;</code> a la URL o define{' '}
            <code>VITE_DEMO_ORG_ID</code>.
          </p>
        )}
      </header>

      {(top.error || bottom.error) && (
        <p className="mb-3 text-sm text-destructive">
          Error: {((top.error ?? bottom.error) as Error).message}
        </p>
      )}

      {/* P2-1: 60/40 hero grid. Hero on the left (lg:col-span-3 of 5), stacked secondaries on right. */}
      <section
        aria-label="KPIs del dashboard"
        className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-5"
      >
        <div className="lg:col-span-3">
          <MarginHero
            kpis={kpis.data}
            loading={kpis.isLoading && !kpis.data}
            windowDays={windowDays}
          />
        </div>
        <div className="flex flex-col gap-3 lg:col-span-2">
          <SecondaryKpiCard
            label="Ventas potenciales · 7d"
            value={kpis.data?.sales.valueEur ?? null}
            kind="eur"
            note={kpis.data?.sales.note}
            loading={kpis.isLoading && !kpis.data}
          />
          <SecondaryKpiCard
            label="Coste · 7d"
            value={kpis.data?.cost.valueEur ?? null}
            kind="eur"
            note={kpis.data?.cost.note}
            loading={kpis.isLoading && !kpis.data}
          />
          <SecondaryKpiCard
            label="% margen"
            value={kpis.data?.marginPct.value ?? null}
            kind="percent"
            loading={kpis.isLoading && !kpis.data}
          />
        </div>
      </section>

      <MenuItemRanker
        top={rankerTop}
        bottom={rankerBottom}
        loading={loading}
        locale="es-ES"
        onViewDetails={onViewDetails}
        demoMode={useDemoData}
      />
    </div>
  );
}

/**
 * 60% hero card carrying the Margen number — the persona's lead metric per
 * j3.md §1 + DESIGN.md §4. Uses a fake 7-day sparkline derived from the KPI
 * value when populated (real series will land via M3 trend endpoint).
 *
 * MarginPanel proper is per-MenuItem (Recipe × Location × Channel) and
 * expects a MarginReport shape. The aggregate org-level KPIs returned by
 * /dashboard/kpis don't fit that shape, so this adapter renders the
 * MarginPanel-style hero from KpisResult without coupling the ui-kit
 * component to backend data layout.
 */
function MarginHero({
  kpis,
  loading,
  windowDays,
}: {
  kpis: DashboardKpis | undefined;
  loading: boolean;
  windowDays: number;
}) {
  const marginEur = kpis?.marginEur.valueEur ?? null;
  const marginPct = kpis?.marginPct.value ?? null;
  const delta = kpis?.deltaVsPrev as number | null | undefined;

  const display = formatValue(marginEur, 'eur', 'es-ES');
  const pctDisplay = formatValue(marginPct, 'percent', 'es-ES');

  const sparklineData = useMemo(() => {
    if (marginEur == null) return [];
    // Mocked 7-day shape until /dashboard/kpis returns a series. We render a
    // smooth wave with the final value pinned to the current marginEur so
    // the sparkline visually relates to the headline number.
    const base = Math.max(marginEur * 0.6, 1);
    const wave = [0.7, 0.85, 0.65, 0.9, 0.78, 0.95, 1.0];
    return wave.map((m, i) => ({ index: i, value: base * m }));
  }, [marginEur]);

  return (
    <article
      aria-label="Margen — 7 días"
      className={cn(
        'h-full rounded-lg border bg-surface p-6',
        loading && 'animate-pulse',
      )}
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
        borderTopWidth: '2px',
        borderTopColor: 'var(--color-accent)',
      }}
    >
      <p
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: 'var(--color-mute)' }}
      >
        Margen · {windowDays}d
      </p>
      <p
        className="mt-2 font-semibold tabular-nums"
        style={{
          fontFamily: 'var(--font-display, Fraunces, serif)',
          fontSize: '2.5rem',
          lineHeight: '1.1',
          color: marginEur == null ? 'var(--color-mute)' : 'var(--color-ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {loading ? '—' : display}
      </p>
      {marginPct != null && (
        <p
          className="mt-1 text-sm font-medium tabular-nums"
          style={{
            color: 'var(--color-mute)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {pctDisplay} sobre ventas
        </p>
      )}
      {delta != null && (
        <p
          className="mt-1 text-xs tabular-nums"
          style={{
            color: delta >= 0 ? 'var(--color-success)' : 'var(--color-destructive)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)} pp vs periodo anterior
        </p>
      )}
      {sparklineData.length > 0 && (
        <div className="mt-4">
          <Sparkline
            data={sparklineData}
            ariaLabel={`Tendencia de margen últimos ${windowDays} días`}
          />
        </div>
      )}
      {kpis?.marginEur.note && (
        <p
          className="mt-2 text-[11px] leading-snug"
          style={{ color: 'var(--color-mute)' }}
        >
          {kpis.marginEur.note}
        </p>
      )}
    </article>
  );
}

/**
 * Smaller right-column KPI card. Same visual primitive as the previous
 * KpiHeader card but bumped padding (p-5) + hover state on the border per
 * the A4 density pass.
 */
function SecondaryKpiCard({
  label,
  value,
  kind,
  note,
  loading,
}: {
  label: string;
  value: number | null;
  kind: 'eur' | 'percent';
  note?: string;
  loading: boolean;
}) {
  const display = formatValue(value, kind, 'es-ES');
  return (
    <article
      className={cn(
        'flex-1 rounded-lg border bg-surface p-5 transition-colors',
        'hover:border-border-strong',
      )}
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
    >
      <p
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: 'var(--color-mute)' }}
      >
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-xl font-semibold tabular-nums',
          loading && 'animate-pulse',
        )}
        style={{
          color: value == null ? 'var(--color-mute)' : 'var(--color-ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {loading ? '—' : display}
      </p>
      {note && (
        <p
          className="mt-1 text-[11px] leading-snug"
          style={{ color: 'var(--color-mute)' }}
        >
          {note}
        </p>
      )}
    </article>
  );
}

function formatValue(
  value: number | null,
  kind: 'eur' | 'percent',
  locale: string,
): string {
  if (value == null) return '—';
  if (kind === 'eur') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

function formatAsOf(dataUpdatedAt: number, windowDays: number): string {
  if (!dataUpdatedAt) {
    return `Sin datos · ventana ${windowDays}d`;
  }
  const diffMs = Date.now() - dataUpdatedAt;
  const diffMin = Math.max(0, Math.round(diffMs / 60_000));
  let phrase: string;
  if (diffMin < 1) phrase = 'Actualizado hace menos de 1 min';
  else if (diffMin < 60) phrase = `Actualizado hace ${diffMin} min`;
  else {
    const diffHr = Math.round(diffMin / 60);
    phrase = `Actualizado hace ${diffHr} h`;
  }
  return `${phrase} · ventana ${windowDays}d`;
}
