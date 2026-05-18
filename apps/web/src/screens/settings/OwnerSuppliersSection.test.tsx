import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OwnerSuppliersSection } from './OwnerSuppliersSection';

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
        <OwnerSuppliersSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OwnerSuppliersSection', () => {
  it('shows login fallback when no org id is set', () => {
    vi.mocked(useCurrentOrgId).mockReturnValue(undefined);
    renderSurface();
    expect(
      screen.getByText(/Inicia sesión para gestionar tus proveedores/),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders empty state when there are no suppliers', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    renderSurface();
    await waitFor(() => screen.getByText(/Aún no hay proveedores registrados/));
  });

  it('renders the suppliers table with name, country and contact', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: 'S1',
          organizationId: ORG,
          name: 'Frutas García SL',
          country: 'ES',
          contactName: 'Marta García',
          email: 'marta@frutasgarcia.es',
          phone: null,
          isActive: true,
          createdAt: '2026-05-01T10:00:00Z',
          updatedAt: '2026-05-01T10:00:00Z',
        },
      ]),
    );
    renderSurface();
    await waitFor(() => screen.getByText('Frutas García SL'));
    expect(screen.getByText('ES')).toBeInTheDocument();
    expect(
      screen.getByText(/Marta García · marta@frutasgarcia\.es/),
    ).toBeInTheDocument();
  });

  it('surfaces a load error as role=alert', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    renderSurface();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('opens the create form and POSTs to /suppliers with the org id', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'S1',
            organizationId: ORG,
            name: 'Lácteos Norte',
            country: 'ES',
            contactName: null,
            email: null,
            phone: null,
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
    await waitFor(() => screen.getByRole('button', { name: /Nuevo proveedor/ }));
    fireEvent.click(screen.getByRole('button', { name: /Nuevo proveedor/ }));

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Lácteos Norte' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Crear proveedor/ }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect(String(postCall?.[0])).toContain('/api/suppliers');
      const body = JSON.parse(((postCall![1] as RequestInit).body ?? '{}') as string);
      expect(body.name).toBe('Lácteos Norte');
      expect(body.country).toBe('ES');
      expect(body.organizationId).toBe(ORG);
    });
  });

  it('Desactivar fires DELETE on the row id', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: 'S1',
            organizationId: ORG,
            name: 'Proveedor A',
            country: 'ES',
            contactName: null,
            email: null,
            phone: null,
            isActive: true,
            createdAt: '2026-05-01T10:00:00Z',
            updatedAt: '2026-05-01T10:00:00Z',
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { id: 'S1' }, missingFields: [], nextRequired: null }),
      )
      .mockResolvedValueOnce(jsonResponse([]));

    renderSurface();
    await waitFor(() => screen.getByText('Proveedor A'));
    fireEvent.click(screen.getByLabelText('Desactivar Proveedor A'));

    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(delCall).toBeDefined();
      expect(String(delCall?.[0])).toContain('/api/suppliers/S1');
    });
  });
});
