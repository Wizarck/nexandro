import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InvitationAcceptScreen } from './InvitationAcceptScreen';

const fetchMock = vi.fn();
const navigateSpy = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

beforeEach(() => {
  fetchMock.mockReset();
  navigateSpy.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const TOKEN = 'a'.repeat(64);
const LOOKUP_OK = {
  email: 'invitee@example.com',
  role: 'MANAGER' as const,
  orgName: 'Restaurante Marina',
  invitedByName: 'Arturo',
  expiresAt: '2026-05-25T10:00:00Z',
};

function renderAt(token: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/onboarding/invitation/${token}`]}>
        <Routes>
          <Route
            path="/onboarding/invitation/:token"
            element={<InvitationAcceptScreen />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InvitationAcceptScreen', () => {
  it('shows the welcome card with org + role + email when lookup succeeds', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(LOOKUP_OK));
    renderAt(TOKEN);
    await waitFor(() =>
      expect(screen.getByText(/Bienvenido a Restaurante Marina/)).toBeInTheDocument(),
    );
    expect(screen.getByText('invitee@example.com')).toBeInTheDocument();
    expect(screen.getByText('Encargado')).toBeInTheDocument();
    expect(screen.getByText(/Arturo te ha invitado/)).toBeInTheDocument();
  });

  it('renders the invalid-link error state when lookup returns 404', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    renderAt(TOKEN);
    await waitFor(() =>
      expect(
        screen.getByText(
          /Enlace expirado, revocado o ya usado\. Contacta con tu administrador\./,
        ),
      ).toBeInTheDocument(),
    );
  });

  it('disables submit until password length + confirm match', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(LOOKUP_OK));
    renderAt(TOKEN);
    await waitFor(() => screen.getByLabelText(/Contraseña/));

    const submit = screen.getByRole('button', { name: /Aceptar invitación/ });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Contraseña \(mínimo 8 caracteres\)/), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByLabelText(/Repite la contraseña/), {
      target: { value: 'short' },
    });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Contraseña \(mínimo 8 caracteres\)/), {
      target: { value: 'longenough1' },
    });
    fireEvent.change(screen.getByLabelText(/Repite la contraseña/), {
      target: { value: 'mismatch' },
    });
    expect(submit).toBeDisabled();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Repite la contraseña/), {
      target: { value: 'longenough1' },
    });
    expect(submit).not.toBeDisabled();
  });

  it('POSTs accept with token + password and navigates to /owner-dashboard on success', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(LOOKUP_OK))
      .mockResolvedValueOnce(
        jsonResponse({
          user: {
            id: 'u1',
            organizationId: 'org-1',
            name: 'invitee',
            email: 'invitee@example.com',
            role: 'MANAGER',
          },
          session: { kind: 'placeholder', message: 'pending R8' },
        }),
      );
    renderAt(TOKEN);
    await waitFor(() => screen.getByLabelText(/Contraseña \(mínimo 8 caracteres\)/));

    fireEvent.change(screen.getByLabelText(/Contraseña \(mínimo 8 caracteres\)/), {
      target: { value: 'longenough1' },
    });
    fireEvent.change(screen.getByLabelText(/Repite la contraseña/), {
      target: { value: 'longenough1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Aceptar invitación/ }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/api/users/invitations/accept') &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
      const body = JSON.parse(((post![1] as RequestInit).body ?? '{}') as string);
      expect(body.token).toBe(TOKEN);
      expect(body.password).toBe('longenough1');
    });
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/owner-dashboard'));
  });

  it('renders the conflict copy when accept returns 409', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(LOOKUP_OK))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'INVITATION_EXPIRED' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      );
    renderAt(TOKEN);
    await waitFor(() => screen.getByLabelText(/Contraseña \(mínimo 8 caracteres\)/));

    fireEvent.change(screen.getByLabelText(/Contraseña \(mínimo 8 caracteres\)/), {
      target: { value: 'longenough1' },
    });
    fireEvent.change(screen.getByLabelText(/Repite la contraseña/), {
      target: { value: 'longenough1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Aceptar invitación/ }));

    await waitFor(() => {
      expect(
        screen.getByText(
          /Enlace expirado, revocado o ya usado\. Contacta con tu administrador\./,
        ),
      ).toBeInTheDocument();
    });
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
