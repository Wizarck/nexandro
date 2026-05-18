import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OwnerUsersSection } from './OwnerUsersSection';

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
        <OwnerUsersSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OwnerUsersSection', () => {
  it('shows login fallback when no org id is set', () => {
    vi.mocked(useCurrentOrgId).mockReturnValue(undefined);
    renderSurface();
    expect(screen.getByText(/Inicia sesión para gestionar el equipo/)).toBeInTheDocument();
  });

  it('renders empty state for zero users', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    renderSurface();
    await waitFor(() => screen.getByText(/Aún no hay usuarios/));
  });

  it('renders users with role labels in Spanish', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: 'u1',
          organizationId: ORG,
          name: 'Marina López',
          email: 'marina@x.com',
          role: 'MANAGER',
          isActive: true,
          createdAt: '2026-05-01T10:00:00Z',
          updatedAt: '2026-05-01T10:00:00Z',
        },
      ]),
    );
    renderSurface();
    await waitFor(() => screen.getByText('Marina López'));
    expect(screen.getByText('marina@x.com')).toBeInTheDocument();
    expect(screen.getByText('Jefe de cocina')).toBeInTheDocument();
    expect(screen.getByText(/activo/i)).toBeInTheDocument();
  });

  it('shows a load error as role=alert', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    renderSurface();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('opens the invite form and POSTs to /users with a generated password + lowercase email', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'u1',
            organizationId: ORG,
            name: 'Marina',
            email: 'marina@x.com',
            role: 'STAFF',
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
    await waitFor(() => screen.getByRole('button', { name: /Invitar usuario/ }));
    fireEvent.click(screen.getByRole('button', { name: /Invitar usuario/ }));

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Marina' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'Marina@X.COM' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Crear usuario/ }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/api/users') &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(((postCall![1] as RequestInit).body ?? '{}') as string);
      expect(body.email).toBe('marina@x.com');
      expect(body.role).toBe('STAFF');
      expect(typeof body.password).toBe('string');
      expect(body.password.length).toBeGreaterThanOrEqual(8);
    });

    // After creation, the provisional banner appears with the password.
    await waitFor(() => {
      expect(screen.getByText(/Usuario creado para marina@x.com/)).toBeInTheDocument();
    });
  });
});
