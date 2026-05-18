import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OwnerLocationsSection } from './OwnerLocationsSection';

vi.mock('../../lib/currentUser', () => ({
  useCurrentOrgId: vi.fn(),
}));
import { useCurrentOrgId } from '../../lib/currentUser';

const ORG = '11111111-1111-4111-8111-111111111111';
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(useCurrentOrgId).mockReturnValue(ORG);
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
        <OwnerLocationsSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OwnerLocationsSection', () => {
  it('shows login fallback when no org id is set', () => {
    vi.mocked(useCurrentOrgId).mockReturnValue(undefined);
    renderSurface();
    expect(screen.getByText(/Inicia sesión para gestionar tus sedes/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders empty state when there are no locations', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    renderSurface();
    await waitFor(() => screen.getByText(/Aún no hay sedes registradas/));
  });

  it('renders the locations table with type labels in Spanish', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: 'L1',
          organizationId: ORG,
          name: 'Calle Mayor 12',
          address: 'Madrid, 28001',
          type: 'RESTAURANT',
          isActive: true,
          createdAt: '2026-05-01T10:00:00Z',
          updatedAt: '2026-05-01T10:00:00Z',
        },
      ]),
    );
    renderSurface();
    await waitFor(() => screen.getByText('Calle Mayor 12'));
    expect(screen.getByText('Madrid, 28001')).toBeInTheDocument();
    expect(screen.getByText('Restaurante')).toBeInTheDocument();
  });

  it('surfaces a load error as role=alert', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    renderSurface();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('opens the create form and POSTs to /locations with the org id', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'L1',
            organizationId: ORG,
            name: 'Sede nueva',
            address: '',
            type: 'DARK_KITCHEN',
            isActive: true,
            createdAt: '2026-05-18T10:00:00Z',
            updatedAt: '2026-05-18T10:00:00Z',
          },
          missingFields: [],
          nextRequired: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse([]));

    renderSurface();
    await waitFor(() => screen.getByRole('button', { name: /Nueva sede/ }));
    fireEvent.click(screen.getByRole('button', { name: /Nueva sede/ }));

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Sede nueva' },
    });
    fireEvent.change(screen.getByLabelText('Tipo'), {
      target: { value: 'DARK_KITCHEN' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Crear sede/ }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect(String(postCall?.[0])).toContain('/api/locations');
      const body = JSON.parse(((postCall![1] as RequestInit).body ?? '{}') as string);
      expect(body.name).toBe('Sede nueva');
      expect(body.type).toBe('DARK_KITCHEN');
      expect(body.organizationId).toBe(ORG);
    });
  });

  it('Desactivar fires DELETE on the row id', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: 'L1',
            organizationId: ORG,
            name: 'Sede A',
            address: '',
            type: 'RESTAURANT',
            isActive: true,
            createdAt: '2026-05-01T10:00:00Z',
            updatedAt: '2026-05-01T10:00:00Z',
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'L1' }, missingFields: [], nextRequired: null }))
      .mockResolvedValueOnce(jsonResponse([]));

    renderSurface();
    await waitFor(() => screen.getByText('Sede A'));
    fireEvent.click(screen.getByLabelText('Desactivar Sede A'));

    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(delCall).toBeDefined();
      expect(String(delCall?.[0])).toContain('/api/locations/L1');
    });
  });
});
