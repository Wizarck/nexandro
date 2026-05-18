import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProcurementScreen } from '../ProcurementScreen';

/**
 * Tests for the Sprint 4 Wave 3 Block 2-B GrTab additions:
 *   - W3-3 bulk-confirm CTA (matching count + modal + wiring-pending banner)
 *   - W3-9 filter chips (location + estado + solo pendientes)
 *
 * The W3-8 audit-chip in the detail drawer footer is covered in
 * GrDetailDrawer.test.tsx so the drawer-mounting boilerplate stays in one
 * file. The shared mock setup mirrors GrDetailDrawer.test.tsx and
 * ProcurementScreen.test.tsx so the harness behaves identically across
 * the procurement test suites.
 */

vi.mock('../../../lib/currentUser', () => ({
  useCurrentRole: vi.fn(),
  useCurrentOrgId: vi.fn(),
}));

import { useCurrentOrgId, useCurrentRole } from '../../../lib/currentUser';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
  vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
  global.fetch = fetchMock as unknown as typeof fetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderScreen(initialUrl = '/procurement?tab=gr') {
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

function makeListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gr-1',
    poId: 'po-1',
    supplierId: 'sup-1',
    receivedAt: '2026-05-18T14:08:00.000Z',
    receivedAtLocationId: 'loc-1',
    state: 'draft',
    requiresReview: false,
    supplierInvoiceRef: 'INV-001',
    sourcePhotoIngestionId: null,
    createdAt: '2026-05-18T14:08:00.000Z',
    ...overrides,
  };
}

describe('GrTab — W3-3 bulk-confirm CTA', () => {
  it('shows the matching count CTA above the table when ≥1 row qualifies', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          makeListItem({ id: 'gr-1' }),
          makeListItem({ id: 'gr-2', supplierInvoiceRef: 'INV-002' }),
          makeListItem({
            id: 'gr-3',
            requiresReview: true,
            supplierInvoiceRef: 'INV-003',
          }),
        ],
        total: 3,
      }),
    );

    renderScreen();

    const cta = await screen.findByTestId('gr-bulk-confirm-cta');
    // 2 of 3 qualify — gr-3 has requiresReview === true so it's excluded.
    expect(cta).toHaveTextContent('Confirmar todo lo que coincida (2)');
  });

  it('hides the CTA when no row matches the predicate', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          makeListItem({ id: 'gr-a', state: 'confirmed' }),
          makeListItem({ id: 'gr-b', requiresReview: true }),
        ],
        total: 2,
      }),
    );

    renderScreen();

    // Wait for the table to render so we know the CTA's absence is real.
    await screen.findAllByTestId('gr-row');
    expect(screen.queryByTestId('gr-bulk-confirm-cta')).toBeNull();
    expect(screen.queryByTestId('gr-bulk-confirm-bar')).toBeNull();
  });

  it('clicking the CTA opens the confirmation modal with the matches list', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [makeListItem({ id: 'gr-1' }), makeListItem({ id: 'gr-2' })],
        total: 2,
      }),
    );

    renderScreen();

    fireEvent.click(await screen.findByTestId('gr-bulk-confirm-cta'));

    const modal = await screen.findByTestId('gr-bulk-confirm-modal');
    expect(modal).toBeInTheDocument();
    const items = within(
      await screen.findByTestId('gr-bulk-confirm-list'),
    ).getAllByRole('listitem');
    expect(items).toHaveLength(2);
  });

  it('surfaces the "pendiente de wiring" banner when the backend 404s', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ items: [makeListItem()], total: 1 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: 'Cannot POST' }, 404),
      );

    renderScreen();

    fireEvent.click(await screen.findByTestId('gr-bulk-confirm-cta'));
    fireEvent.click(await screen.findByTestId('gr-bulk-confirm-submit'));

    expect(
      await screen.findByTestId('gr-bulk-confirm-not-wired'),
    ).toBeInTheDocument();
  });
});

describe('GrTab — W3-9 filter chips', () => {
  it('first paint defaults to pendingOnly=true so the dock lands on its working set', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [], total: 0 }),
    );

    renderScreen();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain('pendingOnly=true');
    expect(screen.getByTestId('gr-filter-pending-only')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('clicking an estado chip swaps the filter + re-fetches the list', async () => {
    // 1st fetch: default pendingOnly.
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));
    // 2nd fetch: estado=confirmada.
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));

    renderScreen();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('gr-filter-state-confirmada'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1][0])).toContain('state=confirmada');
    // Selecting an explicit state must clear pendingOnly to keep the
    // URL semantics coherent (one wins at a time).
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('pendingOnly');
  });

  it('Limpiar filtros resets every chip back to "all"', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));

    renderScreen();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('gr-filter-clear'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const lastUrl = String(fetchMock.mock.calls[1][0]);
    expect(lastUrl).not.toContain('pendingOnly');
    expect(lastUrl).not.toContain('state=');
    expect(lastUrl).not.toContain('locationIds=');
  });
});
