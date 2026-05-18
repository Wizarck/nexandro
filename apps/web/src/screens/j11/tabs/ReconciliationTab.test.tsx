import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProcurementScreen } from '../ProcurementScreen';
import type { ReconciliationListItem } from '../../../api/procurement';

vi.mock('../../../lib/currentUser', () => ({
  useCurrentRole: vi.fn(),
  useCurrentOrgId: vi.fn(),
}));

import {
  useCurrentOrgId,
  useCurrentRole,
} from '../../../lib/currentUser';

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

function buildRow(
  overrides: Partial<ReconciliationListItem> = {},
): ReconciliationListItem {
  return {
    id: 'recon-1',
    poId: 'po-1',
    poNumber: 'PO-2026-0001',
    grId: 'gr-1',
    supplierId: '99999999-9999-4999-8999-999999999999',
    discrepancyType: 'cantidad',
    diff: {
      grLineId: 'grl-1',
      poLineId: 'pol-1',
      expectedQty: 10,
      actualQty: 8,
      unit: 'kg',
      deltaPct: 2,
    },
    state: 'abierta',
    resolvedAt: null,
    resolvedByUserId: null,
    resolutionNotes: null,
    createdAt: '2026-05-18T10:00:00.000Z',
    ...overrides,
  };
}

function renderReconTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/procurement?tab=recon']}>
        <ProcurementScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function lastReconUrls(): string[] {
  return fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter(
      (u) =>
        u.includes('/m3/procurement/reconciliation?') &&
        !u.includes('/resolve') &&
        !u.includes('/counts'),
    );
}

describe('ReconciliationTab — filter chips (Sprint 4 W3-9)', () => {
  it('lands with state=abierta chip active by default and only fetches the open bucket', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0 }));

    renderReconTab();

    await waitFor(() =>
      expect(screen.getByTestId('reconciliation-filters')).toBeInTheDocument(),
    );

    const abierta = screen.getByTestId('reconciliation-filter-state-chip-abierta');
    expect(abierta).toHaveAttribute('data-active', 'true');
    const aceptada = screen.getByTestId('reconciliation-filter-state-chip-aceptada');
    expect(aceptada).toHaveAttribute('data-active', 'false');

    await waitFor(() => expect(lastReconUrls().length).toBeGreaterThan(0));
    const first = lastReconUrls()[0];
    expect(first).toContain('states%5B%5D=abierta');
    expect(first).not.toContain('discrepancyTypes%5B%5D');
    expect(first).not.toContain('supplierIds%5B%5D');
  });

  it('toggling a discrepancy chip appends discrepancyTypes[]= to the next fetch', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0 }));

    renderReconTab();

    await waitFor(() =>
      expect(screen.getByTestId('reconciliation-filters')).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByTestId('reconciliation-filter-discrepancy-chip-cantidad'),
    );

    await waitFor(() => {
      const urls = lastReconUrls();
      const lastUrl = urls[urls.length - 1];
      expect(lastUrl).toContain('discrepancyTypes%5B%5D=cantidad');
    });
  });

  it('a multi-state pick adds repeated states[]= params (no overwrite)', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0 }));

    renderReconTab();

    await waitFor(() =>
      expect(screen.getByTestId('reconciliation-filters')).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByTestId('reconciliation-filter-state-chip-aceptada'),
    );

    await waitFor(() => {
      const urls = lastReconUrls();
      const lastUrl = urls[urls.length - 1];
      const occurrences = lastUrl.split('states%5B%5D=').length - 1;
      expect(occurrences).toBeGreaterThanOrEqual(2);
      expect(lastUrl).toContain('states%5B%5D=abierta');
      expect(lastUrl).toContain('states%5B%5D=aceptada');
    });
  });

  it('clicking an active chip removes it (de-selection)', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0 }));

    renderReconTab();

    const abierta = await screen.findByTestId(
      'reconciliation-filter-state-chip-abierta',
    );
    expect(abierta).toHaveAttribute('data-active', 'true');

    fireEvent.click(abierta);

    expect(abierta).toHaveAttribute('data-active', 'false');
  });

  it('renders the supplier chip group only when rows are present', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [buildRow()], total: 1 }),
    );

    renderReconTab();

    await waitFor(() => {
      expect(
        screen.getByTestId('reconciliation-filter-supplier'),
      ).toBeInTheDocument();
    });
    // chip key = full supplierId; label is shortened
    expect(
      screen.getByTestId(
        'reconciliation-filter-supplier-chip-99999999-9999-4999-8999-999999999999',
      ),
    ).toBeInTheDocument();
  });

  it('"Restablecer filtros" appears only when non-default state is active', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0 }));

    renderReconTab();

    await waitFor(() =>
      expect(screen.getByTestId('reconciliation-filters')).toBeInTheDocument(),
    );
    // Initial state is exactly ['abierta'] → reset button hidden.
    expect(screen.queryByTestId('reconciliation-filter-clear')).toBeNull();

    fireEvent.click(
      screen.getByTestId('reconciliation-filter-discrepancy-chip-precio'),
    );

    await waitFor(() =>
      expect(
        screen.getByTestId('reconciliation-filter-clear'),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId('reconciliation-filter-clear'));

    await waitFor(() =>
      expect(screen.queryByTestId('reconciliation-filter-clear')).toBeNull(),
    );
    expect(
      screen.getByTestId('reconciliation-filter-state-chip-abierta'),
    ).toHaveAttribute('data-active', 'true');
  });
});
