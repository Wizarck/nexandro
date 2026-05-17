import { useEffect, useMemo, useState } from 'react';
import {
  BundleArchiveTable,
  BundleDownloadRow,
  ExportProgressStrip,
  LocaleChipGroup,
  RecipientPicker,
  ScopeCheckboxList,
  TransparencyBanner,
  type AppccLocale,
  type AppccScope,
  type BundleArchiveRow,
  type BundleDownloadSummary,
  type ExportProgressStatus,
  type ProgressStep,
  type RecipientOption,
} from '@nexandro/ui-kit';
import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';
import {
  useBundleArchive,
  useBundleStatus,
  useGenerateBundle,
} from '../../hooks/useAppcc';
import {
  bundleDownloadUrl,
  type ExportBundleSummary,
  type Locale,
  type Scope,
} from '../../api/appcc';

/**
 * j9 APPCC export trigger screen (slice #15 m3-appcc-i18n-ui, Wave 2.7).
 *
 * Composes the 7 ui-kit components into the quarterly compliance flow
 * described in `docs/ux/j9.md`. State machine: idle → generating (SSE
 * stream) → ready | failed. Defaults serve the quarterly recurring case
 * per ADR-J9-DEFAULTS-SERVE-RECURRING-CASE (last-90-day + es-ES +
 * haccp+lot).
 *
 * Surface restricted to Owner + Manager (per j9 §RBAC). Staff hitting
 * the route get a soft fallback.
 */
export function AppccExportScreen() {
  const role = useCurrentRole();
  const orgId = useCurrentOrgId();
  if (role == null) return <SignedOut />;
  if (orgId == null) return <NoOrg />;
  if (role !== 'OWNER' && role !== 'MANAGER') return <ForbiddenForStaff />;
  return <Inner orgId={orgId} actorUserId={role} />;
}

const DEFAULT_SCOPE: Scope = {
  haccp: true,
  lot: true,
  procurement: false,
  photo: false,
  ai_obs: false,
};

const PROGRESS_STEPS: ReadonlyArray<ProgressStep> = [
  { key: 'index_audit_log', label: 'Indexando audit_log' },
  { key: 'compose_chapter_0', label: 'Componiendo capítulo 0' },
  { key: 'render_derivatives', label: 'Renderizando vistas derivativas' },
  { key: 'seal_hash', label: 'Sellando hash de bundle' },
  { key: 'done', label: 'Listo' },
];

const DEMO_CONTACTS: ReadonlyArray<RecipientOption> = [
  { id: 'r-inspector', label: 'Inspector APPCC', email: 'inspector@sanidad.local' },
  { id: 'r-insurer', label: 'Aseguradora', email: 'siniestros@aseguradora.local' },
];

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

type RangeChipKey = '30d' | '90d' | 'year' | 'last-quarter';

function rangeFromChip(chip: RangeChipKey): { from: string; to: string } {
  const today = isoToday();
  switch (chip) {
    case '30d':
      return { from: isoDaysAgo(30), to: today };
    case '90d':
      return { from: isoDaysAgo(90), to: today };
    case 'year': {
      const year = new Date().getFullYear();
      return { from: `${year}-01-01`, to: today };
    }
    case 'last-quarter': {
      const now = new Date();
      const month = now.getMonth();
      // last closed quarter
      let qStart = 0;
      let qEnd = 0;
      let year = now.getFullYear();
      if (month < 3) {
        qStart = 9; // Oct previous year
        qEnd = 11; // Dec previous year
        year -= 1;
      } else if (month < 6) {
        qStart = 0;
        qEnd = 2;
      } else if (month < 9) {
        qStart = 3;
        qEnd = 5;
      } else {
        qStart = 6;
        qEnd = 8;
      }
      const from = new Date(year, qStart, 1).toISOString().slice(0, 10);
      const to = new Date(year, qEnd + 1, 0).toISOString().slice(0, 10);
      return { from, to };
    }
  }
}

function toArchiveRow(summary: ExportBundleSummary): BundleArchiveRow {
  return {
    bundleId: summary.bundleId,
    generatedAt: summary.generatedAt,
    rangeLabel: `${summary.from} - ${summary.to}`,
    locale: summary.locale,
    scopeLabel: formatScopeLabel(summary.scope),
    generatedByActor: summary.generatedByActor,
    sha256Short: summary.sha256 ? shortHash(summary.sha256) : '—',
    archived: summary.archived,
  };
}

function formatScopeLabel(scope: AppccScope): string {
  const parts: string[] = [];
  if (scope.haccp) parts.push('HACCP');
  if (scope.lot) parts.push('Lot');
  if (scope.procurement) parts.push('Procurement');
  if (scope.photo) parts.push('Photo');
  if (scope.ai_obs) parts.push('AI Obs');
  return parts.join(' + ') || 'Vacío';
}

function shortHash(hash: string): string {
  if (hash.length <= 9) return hash;
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

function Inner({
  orgId,
  actorUserId: _actorUserId,
}: {
  orgId: string;
  actorUserId: string;
}) {
  const [chip, setChip] = useState<RangeChipKey>('90d');
  const initial = rangeFromChip('90d');
  const [from, setFrom] = useState<string>(initial.from);
  const [to, setTo] = useState<string>(initial.to);
  const [locale, setLocale] = useState<AppccLocale>('es-ES');
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);
  const [expanded, setExpanded] = useState(false);
  const [recipients, setRecipients] = useState<ReadonlyArray<string>>([]);
  const [bundleId, setBundleId] = useState<string | null>(null);
  const [overrideStatus, setOverrideStatus] =
    useState<ExportProgressStatus | null>(null);

  const submit = useGenerateBundle();
  const status = useBundleStatus(orgId, bundleId);
  const archive = useBundleArchive(orgId, 10);
  const archiveRows = useMemo<ReadonlyArray<BundleArchiveRow>>(
    () => (archive.data?.bundles ?? []).map(toArchiveRow),
    [archive.data],
  );

  const selectChip = (next: RangeChipKey) => {
    setChip(next);
    const r = rangeFromChip(next);
    setFrom(r.from);
    setTo(r.to);
  };

  const handleSubmit = async () => {
    if (submit.isPending) return;
    setOverrideStatus(null);
    try {
      const result = await submit.mutateAsync({
        organizationId: orgId,
        from,
        to,
        locale: locale as Locale,
        scope,
        recipients,
      });
      setBundleId(result.bundleId);
    } catch {
      setOverrideStatus('failed');
    }
  };

  const handleRetry = () => {
    setOverrideStatus(null);
    setBundleId(null);
    void handleSubmit();
  };

  const progressStatus: ExportProgressStatus = overrideStatus ?? (() => {
    if (status.data?.status === 'ready') return 'done';
    if (status.data?.status === 'failed') return 'failed';
    return 'in-progress';
  })();

  const currentStepIndex =
    status.data?.currentStepIndex ??
    (bundleId == null ? 0 : Math.min(0, PROGRESS_STEPS.length - 1));

  const bundleSummary = useMemo<BundleDownloadSummary | null>(() => {
    if (!status.data || status.data.status !== 'ready') return null;
    if (status.data.sha256 == null || status.data.auditLogId == null) {
      return null;
    }
    return {
      bundleId: status.data.bundleId,
      sha256: shortHash(status.data.sha256),
      auditLogId: status.data.auditLogId,
      generatedAt: new Date().toISOString(),
      locale,
      pdfSizeBytes: status.data.sizeBytes ?? 0,
      pdfPageCount: status.data.pageCount ?? 0,
      csvSizeBytes: Math.round((status.data.sizeBytes ?? 0) * 0.18),
    };
  }, [status.data, locale]);

  // SSE wiring: when a bundleId is set, open the live stream and let
  // it nudge the query cache through the polling fallback. The pure
  // EventSource path is the canonical mechanism per ADR-J9-PROGRESS-
  // STRIP-SSE-DRIVEN; the polling fallback (via `useBundleStatus`'s
  // refetchInterval) covers test + offline scenarios.
  useEffect(() => {
    if (bundleId == null) return;
    if (typeof window === 'undefined' || typeof window.EventSource !== 'function') {
      return;
    }
    const src = new window.EventSource(
      `/api/m3/compliance/exports/${bundleId}/stream?organizationId=${encodeURIComponent(orgId)}`,
    );
    src.addEventListener('error', () => {
      // Server-side stream errors arrive here; we leave the polling
      // fallback to surface the final state.
      src.close();
    });
    return () => {
      src.close();
    };
  }, [bundleId, orgId]);

  return (
    <div
      className="mx-auto px-6 py-6"
      style={{ maxWidth: '960px' }}
    >
      <div
        className="text-xs uppercase tracking-[0.04em]"
        style={{ color: 'var(--color-mute)' }}
      >
        Exportación APPCC · expediente para autoridad sanitaria
      </div>
      <h1
        className="mt-2 text-3xl font-semibold leading-tight"
        style={{ color: 'var(--color-ink)' }}
      >
        Generar bundle de auditoría
      </h1>

      <TransparencyBanner />

      <section
        className="mt-6 rounded-lg border p-6"
        style={{
          backgroundColor: 'var(--color-bg)',
          borderColor: 'var(--color-border)',
        }}
        aria-label="Configuración del bundle"
      >
        {/* Date range */}
        <div className="mb-6">
          <div
            className="mb-2 text-sm font-medium"
            style={{ color: 'var(--color-mute)' }}
          >
            Rango de fechas
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <label
              htmlFor="appcc-from"
              className="text-sm"
              style={{ color: 'var(--color-mute)' }}
            >
              Desde
            </label>
            <input
              type="date"
              id="appcc-from"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setChip('90d');
              }}
              aria-label="Fecha desde"
              className="rounded-md border px-2 text-sm"
              style={{
                height: '40px',
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-ink)',
              }}
            />
            <label
              htmlFor="appcc-to"
              className="text-sm"
              style={{ color: 'var(--color-mute)' }}
            >
              Hasta
            </label>
            <input
              type="date"
              id="appcc-to"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setChip('90d');
              }}
              aria-label="Fecha hasta"
              className="rounded-md border px-2 text-sm"
              style={{
                height: '40px',
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-ink)',
              }}
            />
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Rangos rápidos"
          >
            <RangeChip
              label="Últimos 30d"
              selected={chip === '30d'}
              onClick={() => selectChip('30d')}
            />
            <RangeChip
              label="Últimos 90d"
              selected={chip === '90d'}
              onClick={() => selectChip('90d')}
            />
            <RangeChip
              label="Año natural en curso"
              selected={chip === 'year'}
              onClick={() => selectChip('year')}
            />
            <RangeChip
              label="Trimestre cerrado"
              selected={chip === 'last-quarter'}
              onClick={() => selectChip('last-quarter')}
            />
          </div>
        </div>

        {/* Locale */}
        <div className="mb-6">
          <div
            className="mb-2 text-sm font-medium"
            style={{ color: 'var(--color-mute)' }}
          >
            Idioma del expediente
          </div>
          <LocaleChipGroup value={locale} onChange={setLocale} />
        </div>

        {/* Scope */}
        <div className="mb-6">
          <div
            className="mb-2 text-sm font-medium"
            style={{ color: 'var(--color-mute)' }}
          >
            Alcance
          </div>
          <ScopeCheckboxList value={scope} onChange={setScope} />
        </div>

        {/* Recipients */}
        <RecipientPicker
          expanded={expanded}
          onToggleExpanded={setExpanded}
          contacts={DEMO_CONTACTS}
          selectedAddresses={recipients}
          onChangeSelected={setRecipients}
        />

        {/* Action row */}
        <div
          className="mt-6 flex items-center justify-between gap-3 border-t pt-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="text-sm" style={{ color: 'var(--color-mute)' }}>
            Defaults: últimos 90 días · es-ES · HACCP + Lot
          </div>
          <button
            type="button"
            name="generar"
            onClick={handleSubmit}
            disabled={submit.isPending || bundleId != null}
            className="rounded-md px-6 text-sm font-semibold"
            style={{
              height: '48px',
              backgroundColor:
                submit.isPending || bundleId != null
                  ? 'var(--color-surface-2)'
                  : 'var(--color-accent)',
              color:
                submit.isPending || bundleId != null
                  ? 'var(--color-mute)'
                  : 'var(--color-accent-fg)',
              border: 'none',
              cursor:
                submit.isPending || bundleId != null ? 'not-allowed' : 'pointer',
            }}
          >
            {submit.isPending ? 'Generando…' : 'Generar bundle'}
          </button>
        </div>

        {/* Progress + download */}
        {bundleId != null && bundleSummary == null && (
          <ExportProgressStrip
            steps={PROGRESS_STEPS}
            currentStepIndex={Math.max(0, currentStepIndex)}
            status={progressStatus}
            sizeBytes={status.data?.sizeBytes ?? undefined}
            pageCount={status.data?.pageCount ?? undefined}
            onRetry={handleRetry}
          />
        )}

        {bundleSummary && (
          <BundleDownloadRow
            bundle={bundleSummary}
            dispatchedRecipients={
              status.data?.dispatchedRecipients ?? 0
            }
            onDownloadPdf={() =>
              window.open(
                bundleDownloadUrl(orgId, bundleSummary.bundleId, 'pdf'),
                '_blank',
                'noopener',
              )
            }
            onDownloadCsv={() =>
              window.open(
                bundleDownloadUrl(orgId, bundleSummary.bundleId, 'csv'),
                '_blank',
                'noopener',
              )
            }
          />
        )}
      </section>

      <BundleArchiveTable
        rows={archiveRows}
        onDownload={(id) =>
          window.open(
            bundleDownloadUrl(orgId, id, 'pdf'),
            '_blank',
            'noopener',
          )
        }
      />
    </div>
  );
}

function RangeChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="rounded-full border px-3.5 py-1 text-sm"
      style={{
        minHeight: '36px',
        backgroundColor: selected
          ? 'var(--color-accent-soft)'
          : 'transparent',
        borderColor: selected
          ? 'var(--color-accent)'
          : 'var(--color-border)',
        color: selected ? 'var(--color-ink)' : 'var(--color-mute)',
      }}
    >
      {label}
    </button>
  );
}

function SignedOut() {
  return (
    <div
      role="status"
      className="mx-auto mt-6 max-w-2xl rounded-lg border border-dashed p-6 text-center"
      style={{
        color: 'var(--color-mute)',
        borderColor: 'var(--color-border-strong)',
      }}
    >
      Inicia sesión para acceder a la exportación APPCC.
    </div>
  );
}

function NoOrg() {
  return (
    <div
      role="status"
      className="mx-auto mt-6 max-w-2xl rounded-lg border border-dashed p-6 text-center"
      style={{
        color: 'var(--color-mute)',
        borderColor: 'var(--color-border-strong)',
      }}
    >
      No hay organización activa.
    </div>
  );
}

function ForbiddenForStaff() {
  return (
    <div
      role="status"
      className="mx-auto mt-6 max-w-2xl rounded-lg border border-dashed p-6 text-center"
      style={{
        color: 'var(--color-mute)',
        borderColor: 'var(--color-border-strong)',
      }}
    >
      Solo Owners o Managers pueden generar exportaciones APPCC.
    </div>
  );
}
