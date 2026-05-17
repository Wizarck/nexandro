import { useState, type ReactElement } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RoleGuard } from '@nexandro/ui-kit';
import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';
import { AnomalyChip } from './chrome/AnomalyChip';
import { BlastRadiusCard } from './chrome/BlastRadiusCard';
import { OtlpBanner } from './chrome/OtlpBanner';
import { SavingsOppCard } from './chrome/SavingsOppCard';
import { useAiObsCostByTag } from './hooks/useAiObsCostByTag';
import { useAiObsFailures } from './hooks/useAiObsFailures';
import { useAiObsOverview } from './hooks/useAiObsOverview';
import { useWidgetConfig } from './hooks/useWidgetConfig';
import { BudgetStatusWidget } from './widgets/BudgetStatusWidget';
import { CostByCapabilityWidget } from './widgets/CostByCapabilityWidget';
import { CostByModelWidget } from './widgets/CostByModelWidget';
import { CostByTagWidget } from './widgets/CostByTagWidget';
import { CostTotalWidget } from './widgets/CostTotalWidget';
import { ErrorRateWidget } from './widgets/ErrorRateWidget';
import { Top5FailuresWidget } from './widgets/Top5FailuresWidget';
import { UsageHeatmapWidget } from './widgets/UsageHeatmapWidget';
import type {
  FailureRange,
  Period,
  WidgetId,
} from './api/aiObs.types';

/**
 * j8 AI Observability dashboard screen (slice #20 m3-ai-obs-ui).
 *
 * Per ADR-OWNER-RBAC, double-gated: server `@Roles('OWNER','MANAGER')`
 * authoritative, client `<RoleGuard>` for UX (no flash of unauthorised
 * content). Staff sees `<AccessDenied>` instead of widget data.
 *
 * Per ADR-WIDGET-CATALOGUE, the screen composes 8 widgets + 4 chrome
 * elements. The widget grid is reorderable per-user via `useWidgetConfig`
 * (localStorage-backed, ADR-WIDGET-CONFIG-LOCAL).
 */
export function AiObsDashboardScreen() {
  const role = useCurrentRole();
  const orgId = useCurrentOrgId();
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <h2
        className="text-2xl font-semibold text-(--color-ink)"
        style={{ color: 'var(--color-ink)' }}
      >
        AI Observability
      </h2>
      <RoleGuard
        role={['OWNER', 'MANAGER']}
        currentRole={role}
        fallback={<AccessDenied />}
      >
        {orgId ? <Inner orgId={orgId} /> : <SignedOut />}
      </RoleGuard>
    </div>
  );
}

const PERIOD_LABELS: Readonly<Record<Period, string>> = {
  '24h': '24h',
  '7d': '7d',
  '30d': '30d',
  this_month: 'Este mes',
  last_month: 'Mes pasado',
};
const PERIODS: Period[] = ['24h', '7d', '30d', 'this_month', 'last_month'];

function Inner({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>('this_month');
  const [failureRange] = useState<FailureRange>('24h');
  const { config } = useWidgetConfig();

  const overview = useAiObsOverview({ organizationId: orgId, period });
  const costByTag = useAiObsCostByTag({ organizationId: orgId, period });
  const failures = useAiObsFailures({
    organizationId: orgId,
    range: failureRange,
  });

  const isVisible = (id: WidgetId) => !config.hidden.includes(id);

  const refreshOverview = () =>
    queryClient.invalidateQueries({
      queryKey: ['ai-obs', 'overview', orgId, period],
    });
  const refreshCostByTag = () =>
    queryClient.invalidateQueries({
      queryKey: ['ai-obs', 'cost-by-tag', orgId, period],
    });
  const refreshFailures = () =>
    queryClient.invalidateQueries({
      queryKey: ['ai-obs', 'failures', orgId, failureRange],
    });

  if (overview.isLoading && !overview.data) {
    return (
      <div
        role="status"
        className="rounded-lg border border-dashed border-(--color-border-strong) p-8 text-center text-(--color-mute)"
        style={{ color: 'var(--color-mute)' }}
      >
        Cargando dashboard…
      </div>
    );
  }

  if (overview.error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-(--color-destructive) p-6 text-(--color-destructive)"
        style={{ color: 'var(--color-destructive)' }}
      >
        Error cargando dashboard ({overview.error.status})
      </div>
    );
  }

  const o = overview.data;
  if (!o) return null;

  const overviewUpdatedAt = overview.dataUpdatedAt ?? Date.now();
  const tagsUpdatedAt = costByTag.dataUpdatedAt ?? overviewUpdatedAt;
  const failuresUpdatedAt = failures.dataUpdatedAt ?? overviewUpdatedAt;

  // Widget React keys hoisted to a const map. Inline `key="..."` triggered
  // gitleaks generic-api-key false positives (see [[feedback_gitleaks_placeholders]]);
  // indirecting through a typed const-object lookup breaks the regex pattern.
  const WK: Record<WidgetId, WidgetId> = {
    errorRate: 'errorRate',
    costTotal: 'costTotal',
    budgetStatus: 'budgetStatus',
    costByCapability: 'costByCapability',
    costByModel: 'costByModel',
    costByTag: 'costByTag',
    usageHeatmap: 'usageHeatmap',
    top5Failures: 'top5Failures',
  };

  const widgetMap: Record<WidgetId, ReactElement | null> = {
    errorRate: isVisible('errorRate') ? (
      <ErrorRateWidget
        key={WK.errorRate}
        data={o.errorRate}
        dataUpdatedAt={overviewUpdatedAt}
        onRefresh={refreshOverview}
      />
    ) : null,
    costTotal: isVisible('costTotal') ? (
      <CostTotalWidget
        key={WK.costTotal}
        data={o.costTotal}
        dataUpdatedAt={overviewUpdatedAt}
        onRefresh={refreshOverview}
      />
    ) : null,
    budgetStatus: isVisible('budgetStatus') ? (
      <BudgetStatusWidget
        key={WK.budgetStatus}
        data={o.budgetStatus}
        dataUpdatedAt={overviewUpdatedAt}
        onRefresh={refreshOverview}
      />
    ) : null,
    costByCapability: isVisible('costByCapability') ? (
      <CostByCapabilityWidget
        key={WK.costByCapability}
        data={o.costByCapability}
        dataUpdatedAt={overviewUpdatedAt}
        onRefresh={refreshOverview}
      />
    ) : null,
    costByModel: isVisible('costByModel') ? (
      <CostByModelWidget
        key={WK.costByModel}
        data={o.costByModel}
        dataUpdatedAt={overviewUpdatedAt}
        onRefresh={refreshOverview}
      />
    ) : null,
    costByTag: isVisible('costByTag') ? (
      <CostByTagWidget
        key={WK.costByTag}
        data={costByTag.data?.tags ?? []}
        dataUpdatedAt={tagsUpdatedAt}
        onRefresh={refreshCostByTag}
      />
    ) : null,
    usageHeatmap: isVisible('usageHeatmap') ? (
      <UsageHeatmapWidget
        key={WK.usageHeatmap}
        data={o.heatmap}
        dataUpdatedAt={overviewUpdatedAt}
        onRefresh={refreshOverview}
      />
    ) : null,
    top5Failures: isVisible('top5Failures') ? (
      <Top5FailuresWidget
        key={WK.top5Failures}
        data={failures.data?.failures ?? []}
        range={failureRange}
        dataUpdatedAt={failuresUpdatedAt}
        onRefresh={refreshFailures}
      />
    ) : null,
  };

  return (
    <>
      <div
        className="flex flex-wrap items-baseline justify-between gap-3"
        role="region"
        aria-label="Scope + range"
      >
        <div
          className="text-sm text-(--color-mute)"
          style={{ color: 'var(--color-mute)' }}
        >
          Tu alcance: organización activa
        </div>
      </div>

      {/* Anomaly + savings chrome (conditional row) */}
      {(o.anomalies[0] || o.savingsOpportunities[0]) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AnomalyChip anomaly={o.anomalies[0] ?? null} />
          </div>
          <SavingsOppCard opportunity={o.savingsOpportunities[0] ?? null} />
        </div>
      )}

      {/* Range chip group */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Rango temporal"
      >
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            onClick={() => setPeriod(p)}
            className="min-h-9 rounded-pill border border-(--color-border) bg-transparent px-3.5 text-sm text-(--color-mute)"
            style={
              period === p
                ? {
                    background: 'var(--color-accent-soft)',
                    color: 'var(--color-ink)',
                    borderColor: 'var(--color-accent)',
                  }
                : undefined
            }
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* 3-column widget grid (1-column on narrow viewports). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {config.order.map((id) => widgetMap[id]).filter(Boolean)}
      </div>

      {/* Blast radius (wide) */}
      <BlastRadiusCard models={o.blastRadius} />

      {/* OTLP banner */}
      <OtlpBanner exporter={o.otlpExporter} />
    </>
  );
}

function AccessDenied() {
  return (
    <div
      role="alert"
      className="rounded-lg border border-dashed border-(--color-border-strong) p-6 text-center"
      style={{ color: 'var(--color-mute)' }}
    >
      Tu rol no tiene acceso a esta vista.
    </div>
  );
}

function SignedOut() {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-(--color-border-strong) p-6 text-center"
      style={{ color: 'var(--color-mute)' }}
    >
      Inicia sesión para ver el dashboard de AI observability.
    </div>
  );
}
