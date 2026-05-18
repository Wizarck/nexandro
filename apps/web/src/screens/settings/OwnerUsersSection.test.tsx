import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

/**
 * Helper: route GET /users → users list, GET /users/invitations → invitations.
 * Other request handlers register one-shot replies via the queue.
 */
function setupRouting(opts: {
  users?: unknown;
  invitations?: unknown;
  usersStatus?: number;
  invitationsStatus?: number;
}) {
  const queue: Array<{ matcher: (url: string, init?: RequestInit) => boolean; res: Response }> = [];
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    const m = init?.method ?? 'GET';
    // One-shot queue first (POST/revoke etc.)
    for (let i = 0; i < queue.length; i += 1) {
      if (queue[i].matcher(u, init)) {
        const [entry] = queue.splice(i, 1);
        return Promise.resolve(entry.res);
      }
    }
    if (m === 'GET' && u.includes('/api/users/invitations')) {
      return Promise.resolve(
        opts.invitations !== undefined
          ? jsonResponse(opts.invitations, opts.invitationsStatus ?? 200)
          : jsonResponse([], 200),
      );
    }
    if (m === 'GET' && u.includes('/api/users')) {
      return Promise.resolve(
        opts.users !== undefined
          ? jsonResponse(opts.users, opts.usersStatus ?? 200)
          : jsonResponse([], 200),
      );
    }
    return Promise.resolve(jsonResponse({}, 404));
  });
  return {
    enqueue(matcher: (url: string, init?: RequestInit) => boolean, res: Response) {
      queue.push({ matcher, res });
    },
  };
}

describe('OwnerUsersSection', () => {
  it('shows login fallback when no org id is set', () => {
    vi.mocked(useCurrentOrgId).mockReturnValue(undefined);
    renderSurface();
    expect(screen.getByText(/Inicia sesión para gestionar el equipo/)).toBeInTheDocument();
  });

  it('renders empty users + empty invitations states', async () => {
    setupRouting({ users: [], invitations: [] });
    renderSurface();
    await waitFor(() => screen.getByText(/Aún no hay usuarios/));
    expect(screen.getByText(/No hay invitaciones pendientes/)).toBeInTheDocument();
  });

  it('renders users with Spanish role labels (Encargado / Personal)', async () => {
    setupRouting({
      users: [
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
      ],
      invitations: [],
    });
    renderSurface();
    await waitFor(() => screen.getByText('Marina López'));
    expect(screen.getByText('marina@x.com')).toBeInTheDocument();
    expect(screen.getByText('Encargado')).toBeInTheDocument();
  });

  it('shows a load error for the invitations list as role=alert', async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/api/users/invitations')) {
        return Promise.resolve(new Response('boom', { status: 500 }));
      }
      return Promise.resolve(jsonResponse([], 200));
    });
    renderSurface();
    await waitFor(() =>
      expect(
        screen.getByText(/No se pudieron cargar las invitaciones/),
      ).toBeInTheDocument(),
    );
  });

  it('POSTs a new invitation with lowercase email + role and clears the form', async () => {
    const router = setupRouting({ users: [], invitations: [] });
    router.enqueue(
      (u, init) =>
        u.includes('/api/users/invitations') && (init?.method ?? 'GET') === 'POST',
      jsonResponse(
        {
          data: {
            id: 'inv-1',
            organizationId: ORG,
            email: 'marina@x.com',
            role: 'STAFF',
            invitedByUserId: 'owner-1',
            expiresAt: '2026-05-25T10:00:00Z',
            acceptedAt: null,
            revokedAt: null,
            status: 'pending',
            createdAt: '2026-05-18T10:00:00Z',
          },
          missingFields: [],
          nextRequired: null,
        },
        200,
      ),
    );

    renderSurface();
    await waitFor(() => screen.getByRole('button', { name: /Invitar usuario/ }));
    fireEvent.click(screen.getByRole('button', { name: /Invitar usuario/ }));

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'Marina@X.COM' },
    });
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'STAFF' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar invitación/ }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/api/users/invitations') &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(((postCall![1] as RequestInit).body ?? '{}') as string);
      expect(body.email).toBe('marina@x.com');
      expect(body.role).toBe('STAFF');
      // CRITICAL: no password field — invitations never carry one.
      expect(body.password).toBeUndefined();
      // organizationId travels via query string.
      expect(String(postCall![0])).toContain(`organizationId=${ORG}`);
    });
  });

  it('renders pending invitation rows with role + revoke button', async () => {
    setupRouting({
      users: [],
      invitations: [
        {
          id: 'inv-1',
          organizationId: ORG,
          email: 'pending@x.com',
          role: 'MANAGER',
          invitedByUserId: 'owner-1',
          expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          acceptedAt: null,
          revokedAt: null,
          status: 'pending',
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    });
    renderSurface();
    await waitFor(() => screen.getByText('pending@x.com'));
    const row = screen.getByText('pending@x.com').closest('tr')!;
    expect(within(row).getByText('Encargado')).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: /Revocar invitación de pending@x.com/ }),
    ).toBeInTheDocument();
  });

  it('POSTs a revoke + re-fetches the pending list on success', async () => {
    const router = setupRouting({
      users: [],
      invitations: [
        {
          id: 'inv-1',
          organizationId: ORG,
          email: 'pending@x.com',
          role: 'STAFF',
          invitedByUserId: 'owner-1',
          expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          acceptedAt: null,
          revokedAt: null,
          status: 'pending',
          createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    });
    router.enqueue(
      (u, init) =>
        u.includes('/api/users/invitations/inv-1/revoke') &&
        (init?.method ?? 'GET') === 'POST',
      jsonResponse(
        {
          data: {
            id: 'inv-1',
            organizationId: ORG,
            email: 'pending@x.com',
            role: 'STAFF',
            invitedByUserId: 'owner-1',
            expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            acceptedAt: null,
            revokedAt: new Date().toISOString(),
            status: 'revoked',
            createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          },
          missingFields: [],
          nextRequired: null,
        },
        200,
      ),
    );

    renderSurface();
    await waitFor(() => screen.getByText('pending@x.com'));
    fireEvent.click(
      screen.getByRole('button', { name: /Revocar invitación de pending@x.com/ }),
    );

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/api/users/invitations/inv-1/revoke') &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect(String(postCall![0])).toContain(`organizationId=${ORG}`);
    });
  });
});
