import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OwnerCatalogSection } from './OwnerCatalogSection';

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
        <OwnerCatalogSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OwnerCatalogSection', () => {
  it('shows login fallback when no org id is set', () => {
    vi.mocked(useCurrentOrgId).mockReturnValue(undefined);
    renderSurface();
    expect(screen.getByText(/Inicia sesión para gestionar tu catálogo/)).toBeInTheDocument();
  });

  it('renders both cards (Categorías + Unidades de medida) after data loads', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([])) // categories tree
      .mockResolvedValueOnce(
        jsonResponse([
          { code: 'kg', label: 'kilogram', family: 'WEIGHT', factor: 1000 },
          { code: 'L', label: 'litre', family: 'VOLUME', factor: 1000 },
          { code: 'pcs', label: 'piece', family: 'UNIT', factor: 1 },
        ]),
      );

    renderSurface();
    await waitFor(() => screen.getByText('Categorías'));
    expect(screen.getByText('Unidades de medida')).toBeInTheDocument();
    await waitFor(() => screen.getByText('kg'));
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('pcs')).toBeInTheDocument();
  });

  it('lists existing categories and lets the user delete one', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: 'c1',
            organizationId: ORG,
            parentId: null,
            name: 'pescados',
            nameEs: 'Pescados',
            nameEn: 'Fish',
            sortOrder: 0,
            isDefault: false,
            createdAt: '2026-05-01T10:00:00Z',
            updatedAt: '2026-05-01T10:00:00Z',
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'c1' }, missingFields: [], nextRequired: null }))
      .mockResolvedValueOnce(jsonResponse([]));

    renderSurface();
    await waitFor(() => screen.getByText('Pescados'));
    fireEvent.click(screen.getByLabelText('Eliminar Pescados'));

    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(delCall).toBeDefined();
      expect(String(delCall?.[0])).toContain('/api/categories/c1');
    });
  });

  it('posts a new category with the typed name in name/nameEs/nameEn', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'c1',
            organizationId: ORG,
            parentId: null,
            name: 'Bebidas',
            nameEs: 'Bebidas',
            nameEn: 'Bebidas',
            sortOrder: 0,
            isDefault: false,
            createdAt: '2026-05-18T10:00:00Z',
            updatedAt: '2026-05-18T10:00:00Z',
          },
          missingFields: [],
          nextRequired: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse([]));

    renderSurface();
    await waitFor(() => screen.getByLabelText(/Nombre de la categoría/));

    fireEvent.change(screen.getByLabelText(/Nombre de la categoría/), {
      target: { value: 'Bebidas' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Añadir categoría/ }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/api/categories') &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(((postCall![1] as RequestInit).body ?? '{}') as string);
      expect(body.name).toBe('Bebidas');
      expect(body.nameEs).toBe('Bebidas');
      expect(body.nameEn).toBe('Bebidas');
      expect(body.organizationId).toBe(ORG);
    });
  });

  it('surfaces a categories load error as role=alert', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse([]));

    renderSurface();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
