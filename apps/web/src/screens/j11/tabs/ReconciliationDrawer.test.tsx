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
    poNumber: 'PO-2026-0007',
    grId: 'gr-1',
    supplierId: 'sup-1',
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

function renderRecon(rows: ReconciliationListItem[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  fetchMock.mockResolvedValueOnce(
    jsonResponse({ items: rows, total: rows.length }),
  );
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/procurement?tab=recon']}>
        <ProcurementScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReconciliationDrawer (Sprint 4 W3-6)', () => {
  it('tap on a row opens the drawer with PO# + state badge', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderRecon([buildRow()]);

    const row = await screen.findByTestId('reconciliation-row');
    fireEvent.click(row);

    expect(
      await screen.findByTestId('reconciliation-drawer'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('PO-2026-0007').length).toBeGreaterThan(0);
    expect(screen.getByTestId('reconciliation-state-badge')).toHaveTextContent(
      'Abierta',
    );
    expect(screen.getByTestId('reconciliation-diff-card')).toBeInTheDocument();
  });

  it('Owner sees the 3 resolution action buttons enabled', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderRecon([buildRow()]);

    fireEvent.click(await screen.findByTestId('reconciliation-row'));

    const aceptar = await screen.findByTestId(
      'reconciliation-action-aceptada',
    );
    const credito = screen.getByTestId('reconciliation-action-nota-credito');
    const devolver = screen.getByTestId('reconciliation-action-devuelta');

    expect(aceptar).toHaveTextContent('Aceptar diferencia');
    expect(credito).toHaveTextContent('Solicitar nota de crédito');
    expect(devolver).toHaveTextContent('Devolver');
    expect(aceptar).not.toBeDisabled();
    expect(credito).not.toBeDisabled();
    expect(devolver).not.toBeDisabled();
  });

  it('clicking Aceptar opens the confirm modal with notes textarea', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderRecon([buildRow()]);

    fireEvent.click(await screen.findByTestId('reconciliation-row'));
    fireEvent.click(
      await screen.findByTestId('reconciliation-action-aceptada'),
    );

    expect(
      await screen.findByTestId('reconciliation-confirm-modal'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('reconciliation-notes-input'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('reconciliation-confirm-submit'),
    ).toHaveTextContent('Confirmar resolución');
  });

  it('Confirmar POSTs /resolve with correct state + notes and refreshes the list', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    // 1) initial list with one open row
    // 2) POST /resolve  → returns the resolved row
    // 3) refetch after invalidate → row now 'aceptada'
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [buildRow()], total: 1 }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(buildRow({ state: 'aceptada' })),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [buildRow({ state: 'aceptada' })],
        total: 1,
      }),
    );

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/procurement?tab=recon']}>
          <ProcurementScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByTestId('reconciliation-row'));
    fireEvent.click(
      await screen.findByTestId('reconciliation-action-nota-credito'),
    );
    fireEvent.change(screen.getByTestId('reconciliation-notes-input'), {
      target: { value: 'Cobrar al proveedor por la merma' },
    });
    fireEvent.click(screen.getByTestId('reconciliation-confirm-submit'));

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/m3/procurement/reconciliation/recon-1/resolve') &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCalls.length).toBe(1);
    });

    const [, init] = fetchMock.mock.calls.find(
      ([url, i]) =>
        String(url).includes('/resolve') &&
        (i as RequestInit | undefined)?.method === 'POST',
    )!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({
      organizationId: 'org-1',
      state: 'nota-credito',
      notes: 'Cobrar al proveedor por la merma',
    });

    // List refetch fires after the mutation invalidates the query.
    await waitFor(() => {
      const listCalls = fetchMock.mock.calls.filter(
        ([url]) =>
          String(url).includes('/m3/procurement/reconciliation?') &&
          !String(url).includes('/resolve'),
      );
      expect(listCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('Manager sees the action buttons disabled on a material discrepancy (producto)', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderRecon([
      buildRow({
        discrepancyType: 'producto',
        diff: {
          grLineId: 'grl-1',
          poLineId: 'pol-1',
          expectedProductId: 'ing-A',
          actualProductId: 'ing-B',
        },
      }),
    ]);

    fireEvent.click(await screen.findByTestId('reconciliation-row'));

    const aceptar = await screen.findByTestId(
      'reconciliation-action-aceptada',
    );
    expect(aceptar).toBeDisabled();
    expect(aceptar).toHaveAttribute('title', 'Requiere aprobación del Owner');
    expect(
      screen.getByTestId('reconciliation-owner-gate-note'),
    ).toBeInTheDocument();
  });

  it('Manager on a NON-material discrepancy (small deltaPct) can resolve', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderRecon([
      buildRow({
        discrepancyType: 'cantidad',
        diff: {
          grLineId: 'grl-1',
          poLineId: 'pol-1',
          expectedQty: 10,
          actualQty: 9.8,
          unit: 'kg',
          deltaPct: 2,
        },
      }),
    ]);

    fireEvent.click(await screen.findByTestId('reconciliation-row'));

    const aceptar = await screen.findByTestId(
      'reconciliation-action-aceptada',
    );
    expect(aceptar).not.toBeDisabled();
    expect(
      screen.queryByTestId('reconciliation-owner-gate-note'),
    ).toBeNull();
  });

  it('W3-8: audit chip is rendered in the footer with a synthetic AL- label', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderRecon([
      buildRow({ id: 'abcdef12-3456-4789-8abc-def012345678' }),
    ]);

    fireEvent.click(await screen.findByTestId('reconciliation-row'));

    const chip = await screen.findByTestId('reconciliation-audit-chip');
    expect(chip).toBeInTheDocument();
    // Label format = AL-YYYY-NNNNNN where NNNNNN is first 6 hex chars
    // of the recon UUID, uppercased.
    expect(chip.textContent).toContain('AL-');
    expect(chip.textContent).toContain('ABCDEF');
    expect(chip).toHaveTextContent('audit_log');

    const link = screen.getByTestId('reconciliation-audit-chip-link');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute(
      'href',
      '/audit-log?aggregate_id=abcdef12-3456-4789-8abc-def012345678',
    );
    expect(link).toHaveTextContent('ver chain →');
  });

  it('W3-8: audit chip survives the resolved state (still visible after action)', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderRecon([
      buildRow({
        state: 'aceptada',
        resolvedAt: '2026-05-18T11:00:00.000Z',
        resolvedByUserId: 'user-1',
        resolutionNotes: 'ok',
      }),
    ]);

    fireEvent.click(await screen.findByTestId('reconciliation-row'));

    expect(
      await screen.findByTestId('reconciliation-audit-chip'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('reconciliation-audit-chip-link'),
    ).toHaveAttribute('href', '/audit-log?aggregate_id=recon-1');
  });

  it('drawer with a resolved row shows the resolved note + disabled actions', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderRecon([
      buildRow({
        state: 'aceptada',
        resolvedAt: '2026-05-18T11:00:00.000Z',
        resolvedByUserId: 'user-1',
        resolutionNotes: 'ok',
      }),
    ]);

    fireEvent.click(await screen.findByTestId('reconciliation-row'));

    expect(
      await screen.findByTestId('reconciliation-resolved-note'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('reconciliation-action-aceptada'),
    ).toBeDisabled();
    expect(screen.getByTestId('reconciliation-state-badge')).toHaveTextContent(
      'Aceptada',
    );
  });
});
