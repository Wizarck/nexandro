import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OwnerExternalCatalogSection } from './OwnerExternalCatalogSection';

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

function renderSurface() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OwnerExternalCatalogSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OwnerExternalCatalogSection', () => {
  it('renders both cards (Estado del espejo + Sincronizar ahora)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        lastSyncAt: '2026-05-17T10:00:00Z',
        rowCount: 12345,
        stale: false,
      }),
    );
    renderSurface();
    await waitFor(() => screen.getByText('Estado del espejo'));
    // "Sincronizar ahora" appears twice (card title + submit button); use the
    // role lookup to disambiguate without overspecifying.
    expect(
      screen.getByRole('button', { name: /Sincronizar ahora/ }),
    ).toBeInTheDocument();
  });

  it('renders the health stats with row count and "Al día" when fresh', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        lastSyncAt: '2026-05-17T10:00:00Z',
        rowCount: 12345,
        stale: false,
      }),
    );
    renderSurface();
    await waitFor(() => screen.getByText('Al día'));
    expect(screen.getByText(/12.?345/)).toBeInTheDocument();
  });

  it('flags the mirror as stale when health.stale is true', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        lastSyncAt: null,
        rowCount: 0,
        stale: true,
      }),
    );
    renderSurface();
    await waitFor(() => screen.getByText(/Desactualizado/));
    expect(screen.getByText('Nunca')).toBeInTheDocument();
  });

  it('hits the OWNER-scoped sync endpoint when the button is clicked', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          lastSyncAt: '2026-05-17T10:00:00Z',
          rowCount: 100,
          stale: false,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            data: {
              jobId: 'off-sync-1',
              status: 'completed',
              results: [
                { region: 'es', status: 'completed', rowsInserted: 5, rowsUpdated: 0, rowsScanned: 100 },
              ],
            },
            missingFields: [],
            nextRequired: null,
          },
          202,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          lastSyncAt: '2026-05-18T10:00:00Z',
          rowCount: 105,
          stale: false,
        }),
      );

    renderSurface();
    await waitFor(() => screen.getByRole('button', { name: /Sincronizar ahora/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar ahora/ }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect(String(postCall?.[0])).toContain('/api/external-catalog/sync');
    });

    await waitFor(() => screen.getByText(/off-sync-1/));
    expect(screen.getByText('es')).toBeInTheDocument();
  });

  it('surfaces a health load error as role=alert', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    renderSurface();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('surfaces a sync error as role=alert', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          lastSyncAt: '2026-05-17T10:00:00Z',
          rowCount: 100,
          stale: false,
        }),
      )
      .mockResolvedValueOnce(new Response('boom', { status: 503 }));

    renderSurface();
    await waitFor(() => screen.getByRole('button', { name: /Sincronizar ahora/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar ahora/ }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
