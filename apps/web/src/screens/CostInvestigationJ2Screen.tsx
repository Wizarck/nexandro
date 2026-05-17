import { useSearchParams } from 'react-router-dom';
import { CostDeltaTable } from '@nexandro/ui-kit';
import { useRecipeCostDelta } from '../hooks/useRecipeCostDelta';

/**
 * J2 stub — Lourdes investigates a cost spike. Wires CostDeltaTable against
 * `GET /recipes/:id/cost-delta?from=<isoDate>`. Pass
 * `?recipeId=<id>&from=<isoDate>` in the URL.
 */
export function CostInvestigationJ2Screen() {
  const [params] = useSearchParams();
  const recipeId = params.get('recipeId') ?? undefined;
  const fromIso = params.get('from') ?? defaultFromDate();

  const { data, isLoading, error } = useRecipeCostDelta(recipeId, fromIso);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div className="rounded-md border border-border bg-warn-bg px-4 py-2 text-sm text-ink" role="note">
        <strong>Proof of concept</strong> — m2-ui-backfill-wave1 J2 stub.
      </div>

      <header>
        <h1 className="text-2xl font-semibold text-ink">What changed? (J2)</h1>
        <p className="text-sm text-mute">
          Per-component cost deltas for recipe <code>{recipeId ?? '—'}</code> since{' '}
          <code>{fromIso}</code>.
        </p>
        {!recipeId && (
          <p className="mt-2 text-sm text-mute">
            Pass <code>?recipeId=&lt;uuid&gt;</code> + <code>?from=&lt;ISO date&gt;</code> in the URL.
          </p>
        )}
      </header>

      {error && (
        <p className="text-sm text-destructive">
          Error: {(error as Error).message}
        </p>
      )}

      <CostDeltaTable
        rows={data?.rows ?? []}
        loading={isLoading}
        locale="es-ES"
        caption={
          data ? `Cost changes between ${data.fromDate} and ${data.toDate}` : undefined
        }
      />
    </div>
  );
}

function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return d.toISOString().slice(0, 10);
}
