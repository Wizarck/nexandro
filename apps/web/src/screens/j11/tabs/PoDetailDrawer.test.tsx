import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PoDetailDrawer } from './PoDetailDrawer';

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

function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'po-1',
    poNumber: 'PO-2026-0042',
    supplierId: 'sup-1',
    state: 'sent',
    currency: 'EUR',
    total: 121.0,
    subtotal: 110.0,
    vatTotal: 11.0,
    expectedDeliveryDate: '2026-06-01',
    createdAt: '2026-05-18T10:00:00.000Z',
    notes: null,
    sentAt: '2026-05-18T10:00:00.000Z',
    closedAt: null,
    lines: [
      {
        id: 'line-1',
        lineNumber: 1,
        ingredientId: 'ing-1',
        quantityOrdered: 2,
        unit: 'kg',
        unitPrice: 55,
        vatRate: 0.1,
        vatInclusive: false,
        lineSubtotal: 110,
        lineVat: 11,
        lineTotal: 121,
      },
    ],
    ...overrides,
  };
}

function renderDrawer(onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    onClose,
    ...render(
      <QueryClientProvider client={client}>
        <PoDetailDrawer orgId="org-1" poId="po-1" onClose={onClose} />
      </QueryClientProvider>,
    ),
  };
}

describe('PoDetailDrawer (Sprint 4 W3-1 — j11 PO drawer)', () => {
  it('renders header + lines table + totals from the detail endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(makeDetail()));

    renderDrawer();

    await waitFor(() =>
      expect(screen.getByText('PO-2026-0042')).toBeInTheDocument(),
    );
    expect(screen.getByText('Líneas')).toBeInTheDocument();
    // "Subtotal" appears twice (column header + totals footer) — assert
    // both via getAllByText. IVA / Total are unique to the footer.
    expect(screen.getAllByText('Subtotal').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('IVA')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('110.00 EUR')).toBeInTheDocument();
    expect(screen.getByText('11.00 EUR')).toBeInTheDocument();
    expect(screen.getByText('121.00 EUR')).toBeInTheDocument();
    // Line row content.
    expect(screen.getByText('ing-1')).toBeInTheDocument();
    expect(screen.getByText('kg')).toBeInTheDocument();
    // Fetch path includes the id + orgId query string.
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/m3/procurement/po/po-1',
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain('organizationId=org-1');
  });

  it('renders an empty-lines fallback when the PO has no lines', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(makeDetail({ lines: [] })));

    renderDrawer();

    await waitFor(() =>
      expect(
        screen.getByText('Esta OC no tiene líneas registradas.'),
      ).toBeInTheDocument(),
    );
  });

  it('clicking the X button calls onClose', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(makeDetail()));
    const { onClose } = renderDrawer();

    await waitFor(() =>
      expect(screen.getByText('PO-2026-0042')).toBeInTheDocument(),
    );
    // Two "Cerrar" affordances: the overlay button + the explicit X header
    // button — both share aria-label="Cerrar". We pick the last one (the X
    // button is rendered after the overlay) by querying all and clicking
    // the trailing entry.
    const closeButtons = screen.getAllByRole('button', { name: 'Cerrar' });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pressing Escape calls onClose', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(makeDetail()));
    const { onClose } = renderDrawer();

    await waitFor(() =>
      expect(screen.getByText('PO-2026-0042')).toBeInTheDocument(),
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the overlay calls onClose', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(makeDetail()));
    const { onClose } = renderDrawer();

    await waitFor(() =>
      expect(screen.getByText('PO-2026-0042')).toBeInTheDocument(),
    );
    const overlay = screen.getAllByRole('button', { name: 'Cerrar' })[0];
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces an error box when the detail endpoint fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'boom' }, 500));

    renderDrawer();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    );
    expect(screen.getByRole('alert').textContent).toMatch(/Error al cargar/);
  });
});
