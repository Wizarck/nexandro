import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OwnerAgentCredentialsSection } from './OwnerAgentCredentialsSection';

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
        <OwnerAgentCredentialsSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OwnerAgentCredentialsSection', () => {
  it('renders empty-state copy when no agents are registered', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    renderSurface();

    await waitFor(() => screen.getByText(/Aún no hay agentes registrados/));
    // Both the agents empty-state and the LLM placeholder show a "sin configurar" badge.
    expect(screen.getAllByText(/sin configurar/i).length).toBeGreaterThanOrEqual(2);
  });

  it('renders the LLM provider placeholder card', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    renderSurface();
    await waitFor(() => screen.getByText(/Claves de proveedor LLM/));
    // Multiple "próximamente" labels in scope (sub-nav future items + LLM card).
    expect(screen.getAllByText(/próximamente/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/BYO key/)).toBeInTheDocument();
  });

  it('surfaces a load error as a role=alert', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    renderSurface();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert').textContent).toMatch(/No se pudo cargar/);
  });

  it('lists each registered agent with role + status', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: 'a1',
          agentName: 'hermes',
          role: 'STAFF',
          createdAt: '2026-05-01T10:00:00Z',
          revokedAt: null,
        },
        {
          id: 'a2',
          agentName: 'claude-desktop',
          role: 'OWNER',
          createdAt: '2026-04-01T10:00:00Z',
          revokedAt: '2026-04-15T10:00:00Z',
        },
      ]),
    );
    renderSurface();
    await waitFor(() => screen.getByText('hermes'));
    expect(screen.getByText('claude-desktop')).toBeInTheDocument();
    expect(screen.getByText(/activo/i)).toBeInTheDocument();
    expect(screen.getByText(/revocado/i)).toBeInTheDocument();
  });

  it('opens the registration form and POSTs to /agent-credentials', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'new1',
            agentName: 'hermes',
            role: 'STAFF',
            createdAt: '2026-05-18T10:00:00Z',
            revokedAt: null,
          },
          missingFields: [],
          nextRequired: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse([]));

    renderSurface();
    await waitFor(() => screen.getByRole('button', { name: /Registrar agente/ }));
    fireEvent.click(screen.getByRole('button', { name: /Registrar agente/ }));

    fireEvent.change(screen.getByLabelText(/Nombre del agente/), {
      target: { value: 'hermes' },
    });
    fireEvent.change(screen.getByLabelText(/Clave pública/), {
      target: { value: 'MCowBQYDK2VwAyEAabc' },
    });

    // Two submit buttons (the form's button replaces the toggle once open);
    // grab the submit button (role=submit) by closest form via getAllByRole.
    const submitButtons = screen.getAllByRole('button', { name: /Registrar agente/ });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect(String(postCall?.[0])).toContain('/api/agent-credentials');
      const body = JSON.parse(((postCall![1] as RequestInit).body ?? '{}') as string);
      expect(body.agentName).toBe('hermes');
      expect(body.role).toBe('STAFF');
    });
  });
});
