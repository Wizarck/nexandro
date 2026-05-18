import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OwnerDashboardScreen } from './OwnerDashboardScreen';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderWith(initialPath: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <OwnerDashboardScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const emptyKpis = {
  organizationId: ORG_ID,
  windowDays: 7,
  hasMenuItems: false,
  sales: { valueEur: null },
  cost: { valueEur: null },
  marginEur: { valueEur: null },
  marginPct: { value: null },
  deltaVsPrev: null,
};

const emptyRanking = (direction: 'top' | 'bottom') => ({
  organizationId: ORG_ID,
  windowDays: 7,
  direction,
  incomplete: false,
  items: [],
});

const trattoriaOrg = {
  id: ORG_ID,
  name: 'Trattoria Palafito',
  currencyCode: 'EUR',
  defaultLocale: 'es-ES',
  timezone: 'Europe/Madrid',
};

/**
 * Sprint 2 P2 — Dashboard JTBD unlock tests.
 * (a) demo data renders when query empty AND `?demo=true` is set.
 * (b) trust spine venue chip surfaces the org name from /organizations/:id.
 */
describe('OwnerDashboardScreen — Sprint 2 P2', () => {
  it('renders Italian-trattoria demo data when ranker query is empty and ?demo=true is set', async () => {
    // Route every URL to its matching stub.
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/dashboard/menu-items') && url.includes('direction=top')) {
        return jsonResponse(emptyRanking('top'));
      }
      if (url.includes('/dashboard/menu-items') && url.includes('direction=bottom')) {
        return jsonResponse(emptyRanking('bottom'));
      }
      if (url.includes('/dashboard/kpis')) {
        return jsonResponse(emptyKpis);
      }
      if (url.includes('/organizations/')) {
        return jsonResponse(trattoriaOrg);
      }
      return jsonResponse({}, 404);
    });

    renderWith(`/?organizationId=${ORG_ID}&demo=true`);

    // The seeded "Pizza Margarita" is a top-5 winner in our fixtures.
    await waitFor(() =>
      expect(screen.getByText('Pizza Margarita')).toBeInTheDocument(),
    );

    // Bottom-5 also seeded (Risotto ai Funghi Porcini is the steepest loser).
    expect(screen.getByText('Risotto ai Funghi Porcini')).toBeInTheDocument();

    // The "Datos de ejemplo" banner is shown so the Owner cannot mistake the
    // numbers for production POS data.
    expect(
      screen.getByText(/Datos de ejemplo · Conecta tu POS/i),
    ).toBeInTheDocument();
  });

  it('trust spine venue chip surfaces the organization name', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/dashboard/menu-items') && url.includes('direction=top')) {
        return jsonResponse(emptyRanking('top'));
      }
      if (url.includes('/dashboard/menu-items') && url.includes('direction=bottom')) {
        return jsonResponse(emptyRanking('bottom'));
      }
      if (url.includes('/dashboard/kpis')) {
        return jsonResponse(emptyKpis);
      }
      if (url.includes('/organizations/')) {
        return jsonResponse(trattoriaOrg);
      }
      return jsonResponse({}, 404);
    });

    renderWith(`/?organizationId=${ORG_ID}`);

    // Venue chip waits for the org query to resolve.
    await waitFor(() =>
      expect(screen.getByLabelText('Restaurante actual')).toHaveTextContent(
        'Trattoria Palafito',
      ),
    );

    // Trust spine also surfaces a window/as-of strip and a reload affordance.
    expect(screen.getByLabelText('Sello temporal de los datos')).toHaveTextContent(
      /ventana 7d/,
    );
    expect(screen.getByLabelText('Recargar KPIs')).toBeInTheDocument();
  });
});
