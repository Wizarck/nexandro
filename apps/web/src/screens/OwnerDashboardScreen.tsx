import { useNavigate, useSearchParams } from 'react-router-dom';
import { MenuItemRanker, type DashboardMenuItem } from '@nexandro/ui-kit';
import { useDashboardMenuItems } from '../hooks/useDashboardMenuItems';

/**
 * Canonical Owner dashboard for Journey 3 — Roberto's Sunday-night view.
 * Mobile-first: stacked top + needs-attention sections; cards expand inline
 * to reveal the full margin panel + drill-down. Replaces the J3 PoC stub
 * shipped by m2-ui-foundation (#12).
 *
 * Pass `?organizationId=<id>` in the URL or set `VITE_DEMO_ORG_ID`.
 */
export function OwnerDashboardScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orgId =
    params.get('organizationId') ??
    (import.meta.env.VITE_DEMO_ORG_ID as string | undefined) ??
    undefined;

  const top = useDashboardMenuItems(orgId, 'top', 7);
  const bottom = useDashboardMenuItems(orgId, 'bottom', 7);

  const loading = top.isLoading || bottom.isLoading;

  function onViewDetails(item: DashboardMenuItem) {
    navigate(`/poc/cost-investigation-j2?recipeId=${item.recipeId}`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Panel del propietario</h1>
        <p className="text-sm text-mute">
          Los 5 platos con mejor y peor margen de los últimos 7 días. Toca una tarjeta para ver el
          detalle del margen.
        </p>
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

      <MenuItemRanker
        top={top.data?.items ?? []}
        bottom={bottom.data?.items ?? []}
        loading={loading}
        locale="es-ES"
        onViewDetails={onViewDetails}
      />
    </div>
  );
}
