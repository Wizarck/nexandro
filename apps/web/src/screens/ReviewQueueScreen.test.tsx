import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewQueueScreen } from './ReviewQueueScreen';

vi.mock('../lib/currentUser', () => ({
  useCurrentRole: vi.fn(),
  useCurrentOrgId: vi.fn(),
}));

import { useCurrentOrgId, useCurrentRole } from '../lib/currentUser';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ReviewQueueScreen />
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const lotRow = {
  aggregateType: 'lot' as const,
  aggregateId: '11111111-1111-4111-8111-111111111111',
  organizationId: 'org-1',
  sourcePhotoIngestionId: '22222222-2222-4222-8222-222222222222',
  details: {
    aggregateType: 'lot' as const,
    receivedAt: '2026-05-10T08:00:00.000Z',
    locationId: 'loc-1',
    supplierId: 'sup-1',
    unit: 'kg',
  },
  flaggedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
};

const grRow = {
  aggregateType: 'goods_receipt' as const,
  aggregateId: '33333333-3333-4333-8333-333333333333',
  organizationId: 'org-1',
  sourcePhotoIngestionId: null,
  details: {
    aggregateType: 'goods_receipt' as const,
    receivedAt: '2026-05-12T09:00:00.000Z',
    supplierId: 'sup-2',
    supplierInvoiceRef: 'ALB-2026-001',
    receivedAtLocationId: 'loc-2',
  },
  flaggedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
};

describe('ReviewQueueScreen', () => {
  it('Owner sees rows fetched from GET /m3/review-queue', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ rows: [lotRow, grRow], truncated: false }),
    );

    renderWithClient();

    await waitFor(() =>
      expect(screen.getByText('2 en cola · 1 lotes · 1 recepciones')).toBeInTheDocument(),
    );
    expect(screen.getByText('Lote')).toBeInTheDocument();
    expect(screen.getByText('Recepción')).toBeInTheDocument();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/m3/review-queue?');
    expect(url).toContain('organizationId=org-1');
    expect(url).toContain('limit=50');
  });

  it('Staff sees access-denied fallback and zero fetches fire', () => {
    vi.mocked(useCurrentRole).mockReturnValue('STAFF');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderWithClient();

    expect(
      screen.getByText('Solo el Owner y el Manager pueden consultar la cola de revisión.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('empty result shows "Bandeja al día" state', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [], truncated: false }));

    renderWithClient();
    await waitFor(() =>
      expect(screen.getByText('Bandeja al día.')).toBeInTheDocument(),
    );
  });

  it('truncated: true surfaces the truncation banner', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ rows: [lotRow], truncated: true }),
    );

    renderWithClient();
    await waitFor(() =>
      expect(
        screen.getByText(/Mostrando las 50 más recientes/),
      ).toBeInTheDocument(),
    );
  });

  it('clicking the Lotes chip refetches with aggregateType=lot', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ rows: [lotRow, grRow], truncated: false }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [lotRow], truncated: false }));

    renderWithClient();
    await waitFor(() => expect(screen.getByText('Lote')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Lotes' }));

    await waitFor(() => {
      const lotCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('aggregateType=lot'),
      );
      expect(lotCalls.length).toBeGreaterThan(0);
    });
  });

  it('clicking a row opens the detail pane with the aggregate-id', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [lotRow], truncated: false }));

    renderWithClient();
    await waitFor(() => expect(screen.getByText('Lote')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Lote').closest('button')!);

    const detail = await screen.findByTestId('review-queue-detail');
    expect(within(detail).getByText(lotRow.aggregateId)).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Marcar como revisado' })).toBeInTheDocument();
  });

  it('Marcar como revisado posts to the clear endpoint and surfaces a success toast', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [lotRow], truncated: false }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        aggregateType: 'lot',
        aggregateId: lotRow.aggregateId,
        cleared: true,
        alreadyClear: false,
      }),
    );
    // The mutation invalidates the list query → 3rd call refetches.
    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [], truncated: false }));

    renderWithClient();
    await waitFor(() => expect(screen.getByText('Lote')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Lote').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como revisado' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes(`/m3/review-queue/lot/${lotRow.aggregateId}/clear`) &&
        (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      expect(
        JSON.parse(((postCall![1] as RequestInit).body as string) ?? '{}'),
      ).toEqual({ organizationId: 'org-1' });
    });

    const toast = await screen.findByTestId('review-queue-toast');
    expect(toast).toHaveTextContent(/marcado como revisado/i);
  });

  it('alreadyClear: true surfaces the "ya estaba revisado" toast variant and skips invalidation', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [lotRow], truncated: false }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        aggregateType: 'lot',
        aggregateId: lotRow.aggregateId,
        cleared: true,
        alreadyClear: true,
      }),
    );

    renderWithClient();
    await waitFor(() => expect(screen.getByText('Lote')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Lote').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como revisado' }));

    const toast = await screen.findByTestId('review-queue-toast');
    expect(toast).toHaveTextContent('Ya estaba revisado.');
    // Exactly two fetches: initial list + clear. No re-fetch since alreadyClear.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
