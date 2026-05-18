import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OwnerIngredientsSection } from './OwnerIngredientsSection';

vi.mock('../../lib/currentUser', () => ({
  useCurrentOrgId: vi.fn(),
}));
import { useCurrentOrgId } from '../../lib/currentUser';

const ORG = '11111111-1111-4111-8111-111111111111';
const CAT = '22222222-2222-4222-8222-222222222222';
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

/**
 * The surface fires two initial GETs in parallel:
 *   - /api/ingredients?organizationId=...  → { items, nextCursor }
 *   - /api/categories/tree?organizationId=... → CategoryResponse[]
 *
 * Mock by URL so tests don't depend on react-query call order.
 */
function mockInitial({
  ingredients,
  categories,
}: {
  ingredients: unknown[];
  categories: unknown[];
}) {
  fetchMock.mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (init?.method && init.method !== 'GET') {
      throw new Error(`Unexpected method ${init.method} in initial-mock for ${u}`);
    }
    if (u.includes('/api/ingredients')) {
      return Promise.resolve(jsonResponse({ items: ingredients, nextCursor: null }));
    }
    if (u.includes('/api/categories/tree')) {
      return Promise.resolve(jsonResponse(categories));
    }
    throw new Error(`Unexpected fetch in initial-mock: ${u}`);
  });
}

function renderSurface() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OwnerIngredientsSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const CAT_ROW = {
  id: CAT,
  organizationId: ORG,
  parentId: null,
  name: 'Frutas y verduras',
  nameEs: 'Frutas y verduras',
  nameEn: 'Fruits & veg',
  sortOrder: 0,
  isDefault: true,
  createdAt: '2026-05-01T10:00:00Z',
  updatedAt: '2026-05-01T10:00:00Z',
};

describe('OwnerIngredientsSection', () => {
  it('shows login fallback when no org id is set', () => {
    vi.mocked(useCurrentOrgId).mockReturnValue(undefined);
    renderSurface();
    expect(
      screen.getByText(/Inicia sesión para gestionar tus ingredientes/),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders empty state when there are no ingredients', async () => {
    mockInitial({ ingredients: [], categories: [CAT_ROW] });
    renderSurface();
    await waitFor(() =>
      screen.getByText(/Aún no hay ingredientes registrados/),
    );
  });

  it('renders ingredients with their category name and unit label', async () => {
    mockInitial({
      ingredients: [
        {
          id: 'I1',
          organizationId: ORG,
          categoryId: CAT,
          name: 'Tomate pera',
          internalCode: 'TOM-001',
          baseUnitType: 'WEIGHT',
          densityFactor: null,
          notes: null,
          isActive: true,
          allergens: [],
          dietFlags: [],
          brandName: null,
          createdAt: '2026-05-01T10:00:00Z',
          updatedAt: '2026-05-01T10:00:00Z',
        },
      ],
      categories: [CAT_ROW],
    });
    renderSurface();
    await waitFor(() => screen.getByText('Tomate pera'));
    expect(screen.getByText('Frutas y verduras')).toBeInTheDocument();
    expect(screen.getByText(/Peso/)).toBeInTheDocument();
  });

  it('surfaces a load error as role=alert', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('/api/ingredients')) {
        return Promise.resolve(new Response('boom', { status: 500 }));
      }
      if (u.includes('/api/categories/tree')) {
        return Promise.resolve(jsonResponse([CAT_ROW]));
      }
      throw new Error(`Unexpected fetch: ${u}`);
    });
    renderSurface();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('opens the create form and POSTs to /ingredients with categoryId + baseUnitType', async () => {
    // First phase: initial mocks (return empty list + 1 category).
    mockInitial({ ingredients: [], categories: [CAT_ROW] });

    renderSurface();
    await waitFor(() =>
      screen.getByRole('button', { name: /Nuevo ingrediente/ }),
    );

    // Second phase: install a richer handler that handles the POST + the
    // refetch that follows. We re-install via mockImplementation because the
    // initial mock would have thrown on a POST.
    fetchMock.mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && u.includes('/api/ingredients')) {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 'I1',
              organizationId: ORG,
              categoryId: CAT,
              name: 'Aceite oliva',
              internalCode: 'OLI-001',
              baseUnitType: 'VOLUME',
              densityFactor: null,
              notes: null,
              isActive: true,
              allergens: [],
              dietFlags: [],
              brandName: null,
              createdAt: '2026-05-18T10:00:00Z',
              updatedAt: '2026-05-18T10:00:00Z',
            },
            missingFields: [],
            nextRequired: null,
          }),
        );
      }
      if (u.includes('/api/ingredients')) {
        return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      }
      if (u.includes('/api/categories/tree')) {
        return Promise.resolve(jsonResponse([CAT_ROW]));
      }
      throw new Error(`Unexpected fetch: ${u}`);
    });

    fireEvent.click(screen.getByRole('button', { name: /Nuevo ingrediente/ }));

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Aceite oliva' },
    });
    fireEvent.change(screen.getByLabelText('Unidad base'), {
      target: { value: 'VOLUME' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Crear ingrediente/ }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect(String(postCall?.[0])).toContain('/api/ingredients');
      const body = JSON.parse(((postCall![1] as RequestInit).body ?? '{}') as string);
      expect(body.name).toBe('Aceite oliva');
      expect(body.categoryId).toBe(CAT);
      expect(body.baseUnitType).toBe('VOLUME');
      expect(body.organizationId).toBe(ORG);
    });
  });

  it('Desactivar fires DELETE on the row id', async () => {
    // Phase 1: initial list with one ingredient.
    mockInitial({
      ingredients: [
        {
          id: 'I1',
          organizationId: ORG,
          categoryId: CAT,
          name: 'Sal',
          internalCode: 'SAL-001',
          baseUnitType: 'WEIGHT',
          densityFactor: null,
          notes: null,
          isActive: true,
          allergens: [],
          dietFlags: [],
          brandName: null,
          createdAt: '2026-05-01T10:00:00Z',
          updatedAt: '2026-05-01T10:00:00Z',
        },
      ],
      categories: [CAT_ROW],
    });

    renderSurface();
    await waitFor(() => screen.getByText('Sal'));

    // Phase 2: handle DELETE + refetch.
    fetchMock.mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (method === 'DELETE') {
        return Promise.resolve(
          jsonResponse({ data: { id: 'I1' }, missingFields: [], nextRequired: null }),
        );
      }
      if (u.includes('/api/ingredients')) {
        return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      }
      if (u.includes('/api/categories/tree')) {
        return Promise.resolve(jsonResponse([CAT_ROW]));
      }
      throw new Error(`Unexpected fetch: ${u}`);
    });

    fireEvent.click(screen.getByLabelText('Desactivar Sal'));

    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(delCall).toBeDefined();
      expect(String(delCall?.[0])).toContain('/api/ingredients/I1');
    });
  });
});
