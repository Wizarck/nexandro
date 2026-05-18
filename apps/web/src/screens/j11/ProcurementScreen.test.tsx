import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProcurementScreen } from './ProcurementScreen';

vi.mock('../../lib/currentUser', () => ({
  useCurrentRole: vi.fn(),
  useCurrentOrgId: vi.fn(),
}));

import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  // Sprint 4 W3-batch2-A — PoTab now also fetches suppliers + locations
  // for the filter chips + create modal. Default both to an empty array
  // so tests that don't care about those surfaces don't need to opt-in.
  // Tests that DO care can still queue `mockResolvedValueOnce` first.
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/suppliers') || url.includes('/locations')) {
      return Promise.resolve(jsonResponse([]));
    }
    return Promise.resolve(jsonResponse({ items: [], total: 0 }));
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderWithClient(initialUrl = '/procurement') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <ProcurementScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProcurementScreen (Sprint 3 Block C — j11 shell)', () => {
  it('Staff sees access-denied fallback and zero fetches fire', () => {
    vi.mocked(useCurrentRole).mockReturnValue('STAFF');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderWithClient();

    expect(
      screen.getByText(
        'Solo el Owner y el Manager pueden ver la pantalla de Compras.',
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Owner with no ?tab defaults to PO tab + renders empty state', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderWithClient('/procurement');

    await waitFor(() =>
      expect(
        screen.getByText('Aún no hay órdenes de compra activas'),
      ).toBeInTheDocument(),
    );
    // Filter chips fetch suppliers + locations; PoTab still hits /m3/procurement/po
    const poCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/m3/procurement/po'),
    );
    expect(poCalls.length).toBeGreaterThan(0);
  });

  it('clicking Recepciones tab switches to GR fetch + empty state', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderWithClient('/procurement');

    await waitFor(() =>
      expect(
        screen.getByText('Aún no hay órdenes de compra activas'),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Recepciones' }));

    // Sprint 4 W3-9: GrTab now defaults to `pendingOnly` so the empty
    // state copy is scoped to "no pendientes" rather than the generic
    // shell-era message.
    await waitFor(() =>
      expect(
        screen.getByText('No hay recepciones pendientes'),
      ).toBeInTheDocument(),
    );
    const grCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/m3/procurement/gr'),
    );
    expect(grCalls.length).toBeGreaterThan(0);
    // The default filter must hit the API with the `pendingOnly` flag
    // so the dock workflow lands on its working set on first paint.
    expect(String(grCalls[0][0])).toContain('pendingOnly=true');
  });

  it('deep-link ?tab=recon lands on reconciliation tab + empty state', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderWithClient('/procurement?tab=recon');

    await waitFor(() =>
      expect(
        screen.getByText('Aún no hay reconciliaciones abiertas'),
      ).toBeInTheDocument(),
    );
    const reconCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/m3/procurement/reconciliation'),
    );
    expect(reconCalls.length).toBeGreaterThan(0);
  });

  it('renders rows when PO endpoint returns data', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    // Route by URL so the PO list fetch returns 1 row while suppliers/locations
    // stay at the empty default from beforeEach.
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/m3/procurement/po')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: '00000000-0000-4000-8000-000000000001',
                poNumber: 'PO-2026-0001',
                supplierId: 'sup-1',
                state: 'sent',
                currency: 'EUR',
                total: 123.45,
                expectedDeliveryDate: '2026-06-01',
                createdAt: '2026-05-18T10:00:00.000Z',
              },
            ],
            total: 1,
          }),
        );
      }
      if (url.includes('/suppliers') || url.includes('/locations')) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse({ items: [], total: 0 }));
    });

    renderWithClient('/procurement?tab=po');

    await waitFor(() =>
      expect(screen.getByText('PO-2026-0001')).toBeInTheDocument(),
    );
    expect(screen.getByText('123.45 EUR')).toBeInTheDocument();
    expect(screen.queryByText('Aún no hay órdenes de compra activas')).toBeNull();
  });

  it('Owner sees Nueva OC CTA; Manager does not (W3-11 RBAC)', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderWithClient('/procurement?tab=po');

    await waitFor(() =>
      expect(
        screen.getByText('Aún no hay órdenes de compra activas'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId('po-new-cta')).toBeInTheDocument();
  });

  it('Manager does NOT see Nueva OC CTA (W3-11 RBAC)', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderWithClient('/procurement?tab=po');

    await waitFor(() =>
      expect(
        screen.getByText('Aún no hay órdenes de compra activas'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('po-new-cta')).toBeNull();
  });

  it('renders filter chip bar above PO table (W3-9)', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderWithClient('/procurement?tab=po');

    await waitFor(() =>
      expect(screen.getByTestId('po-filter-bar')).toBeInTheDocument(),
    );
  });

  it('shows signed-out fallback when role is null', () => {
    vi.mocked(useCurrentRole).mockReturnValue(null);
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderWithClient();

    expect(
      screen.getByText(
        'Solo el Owner y el Manager pueden ver la pantalla de Compras.',
      ),
    ).toBeInTheDocument();
  });
});
