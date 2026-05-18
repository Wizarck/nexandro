import { Database, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  useExternalCatalogHealthQuery,
  useTriggerExternalCatalogSyncMutation,
} from '../../hooks/useExternalCatalog';
import type {
  ExternalCatalogHealth,
  SyncRunResult,
} from '../../api/externalCatalog';

/**
 * Catálogo externo · Sprint 4 W1-B — backs the OFF (OpenFoodFacts) mirror.
 *
 * Backed by `apps/api/src/external-catalog/interface/external-catalog.controller.ts`.
 * El backend actual sólo expone health-check + trigger de sync; NO hay
 * endpoint de browse/search (la búsqueda se consume desde el picker de
 * ingredientes, no desde esta tab). Esta surface es por tanto:
 *
 *   - Estado del mirror local (última sincronización, filas, stale > 14 d).
 *   - Botón Owner-only para forzar un sync manual (POST devuelve 202).
 *
 * Followups en el PR body: scheduling visual del cron, paginated browse de
 * filas, search inline, y selección de regiones a sincronizar.
 */
export function OwnerExternalCatalogSection() {
  return (
    <section className="space-y-6" aria-label="Catálogo externo">
      <header>
        <h2 className="font-display text-2xl text-ink">Catálogo externo</h2>
        <p className="mt-1 text-sm text-mute">
          Espejo local de OpenFoodFacts (OFF) que alimenta el buscador de ingredientes con
          códigos de barras, alérgenos y datos nutricionales. Se sincroniza automáticamente;
          aquí puedes ver el estado y forzar una sincronización manual si fuese necesario.
        </p>
      </header>

      <HealthCard />
      <ManualSyncCard />
    </section>
  );
}

// ============================================================================
// Health card
// ============================================================================

function HealthCard() {
  const query = useExternalCatalogHealthQuery();

  return (
    <article className="rounded-lg border border-border-subtle p-5">
      <h3 className="text-base font-semibold text-ink">
        <Database aria-hidden="true" size={14} className="mr-1 inline" />
        Estado del espejo
      </h3>
      <p className="mt-1 text-xs text-mute">
        Última sincronización, número de filas y aviso si han pasado más de 14 días sin
        actualizar (en cuyo caso los resultados del buscador pueden estar desactualizados).
      </p>

      {query.isLoading && (
        <p className="mt-4 text-sm text-mute">Consultando estado…</p>
      )}
      {query.error && (
        <p role="alert" className="mt-4 text-sm text-(--color-danger-fg)">
          No se pudo consultar el estado: {query.error.message}
        </p>
      )}
      {query.data && <HealthBlock health={query.data} />}
    </article>
  );
}

function HealthBlock({ health }: { health: ExternalCatalogHealth }) {
  const lastSync = health.lastSyncAt ? formatDateTime(health.lastSyncAt) : 'Nunca';
  return (
    <dl className="mt-4 grid gap-3 sm:grid-cols-3">
      <Stat label="Última sincronización" value={lastSync} />
      <Stat label="Filas" value={formatNumber(health.rowCount)} mono />
      <div className="rounded-md border border-border-subtle p-3">
        <dt className="text-xs uppercase tracking-wide text-mute">Frescura</dt>
        <dd className="mt-1 text-sm">
          {health.stale ? (
            <span className="inline-flex items-center gap-1 font-semibold text-(--color-danger-fg)">
              <AlertTriangle aria-hidden="true" size={12} />
              Desactualizado (&gt; 14 días)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-semibold text-ink">
              <CheckCircle2 aria-hidden="true" size={12} />
              Al día
            </span>
          )}
        </dd>
      </div>
    </dl>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border-subtle p-3">
      <dt className="text-xs uppercase tracking-wide text-mute">{label}</dt>
      <dd className={`mt-1 text-sm text-ink ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

// ============================================================================
// Manual sync card
// ============================================================================

function ManualSyncCard() {
  const sync = useTriggerExternalCatalogSyncMutation();

  return (
    <article className="rounded-lg border border-border-subtle p-5">
      <h3 className="text-base font-semibold text-ink">
        <RefreshCw aria-hidden="true" size={14} className="mr-1 inline" />
        Sincronizar ahora
      </h3>
      <p className="mt-1 text-xs text-mute">
        Lanza una sincronización incremental por regiones (ES, PT, IT, FR, DE, NL). El proceso
        puede tardar varios minutos; el botón queda deshabilitado mientras está en curso. Sólo
        el propietario de la organización puede ejecutarlo.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
        >
          <RefreshCw
            aria-hidden="true"
            size={14}
            className={sync.isPending ? 'animate-spin' : ''}
          />
          {sync.isPending ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
        {sync.isSuccess && !sync.isPending && (
          <span className="text-xs text-mute">
            Sincronización completada · job <span className="font-mono">{sync.data.jobId}</span>
          </span>
        )}
      </div>

      {sync.error && (
        <p role="alert" className="mt-3 text-sm text-(--color-danger-fg)">
          No se pudo sincronizar: {sync.error.message}
        </p>
      )}

      {sync.isSuccess && sync.data.results.length > 0 && (
        <SyncResultsTable results={sync.data.results} />
      )}
    </article>
  );
}

function SyncResultsTable({ results }: { results: SyncRunResult[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-md border border-border-subtle">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-border-subtle text-left uppercase tracking-wide text-mute">
            <th className="px-3 py-2 font-medium">Región</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium">Insertadas</th>
            <th className="px-3 py-2 font-medium">Actualizadas</th>
            <th className="px-3 py-2 font-medium">Escaneadas</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.region} className="border-b border-border-subtle last:border-0">
              <td className="px-3 py-2 font-mono uppercase text-ink">{r.region}</td>
              <td className="px-3 py-2 text-mute">{r.status}</td>
              <td className="px-3 py-2 font-mono text-mute">{r.rowsInserted ?? '—'}</td>
              <td className="px-3 py-2 font-mono text-mute">{r.rowsUpdated ?? '—'}</td>
              <td className="px-3 py-2 font-mono text-mute">{r.rowsScanned ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Formatters
// ============================================================================

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatNumber(n: number): string {
  try {
    return n.toLocaleString('es-ES');
  } catch {
    return String(n);
  }
}
