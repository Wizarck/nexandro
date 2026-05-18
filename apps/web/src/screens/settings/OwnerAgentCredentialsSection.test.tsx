import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OwnerAgentCredentialsSection } from './OwnerAgentCredentialsSection';

vi.mock('../../lib/currentUser', () => ({
  useCurrentOrgId: vi.fn(),
}));
import { useCurrentOrgId } from '../../lib/currentUser';

const ORG = '11111111-1111-4111-8111-111111111111';
const AGENTS_PATH = '/api/agent-credentials';
const LLM_STATUS_PATH = `/api/organizations/${ORG}/llm-credentials`;
const LLM_TEST_PATH = `/api/organizations/${ORG}/llm-credentials/test`;

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

function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

interface LlmStatus {
  provider: 'openai' | 'anthropic' | 'mistral' | null;
  hasKey: boolean;
  lastTestedAt: string | null;
  lastTestResult: 'success' | 'failure' | null;
  lastTestError: string | null;
}

const noKeyStatus: LlmStatus = {
  provider: null,
  hasKey: false,
  lastTestedAt: null,
  lastTestResult: null,
  lastTestError: null,
};

const configuredOkStatus: LlmStatus = {
  provider: 'openai',
  hasKey: true,
  lastTestedAt: '2026-05-18T14:32:00Z',
  lastTestResult: 'success',
  lastTestError: null,
};

/**
 * The section fires two GETs on mount:
 *   1. /api/agent-credentials             — the AgentsCard list
 *   2. /api/organizations/:orgId/llm-credentials — the LlmProviderCard status
 *
 * They race; the unit tests can't rely on call order, so route by URL.
 */
function setupRouter(routes: Array<{ match: (url: string, init?: RequestInit) => boolean; response: Response }>) {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    for (const route of routes) {
      if (route.match(url, init)) {
        return Promise.resolve(route.response.clone());
      }
    }
    return Promise.resolve(new Response('unhandled: ' + url, { status: 599 }));
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
    setupRouter([
      { match: (u) => u.endsWith(AGENTS_PATH), response: jsonResponse([]) },
      { match: (u) => u.endsWith(LLM_STATUS_PATH), response: jsonResponse(noKeyStatus) },
    ]);
    renderSurface();

    await waitFor(() => screen.getByText(/Aún no hay agentes registrados/));
    // Both the agents empty-state and the LLM "sin configurar" badge.
    expect(screen.getAllByText(/sin configurar/i).length).toBeGreaterThanOrEqual(2);
  });

  it('renders the LLM provider card with BYO key copy', async () => {
    setupRouter([
      { match: (u) => u.endsWith(AGENTS_PATH), response: jsonResponse([]) },
      { match: (u) => u.endsWith(LLM_STATUS_PATH), response: jsonResponse(noKeyStatus) },
    ]);
    renderSurface();
    await waitFor(() => screen.getByText(/Claves de proveedor LLM/));
    // "BYO key" surfaces twice: once in the section header subtext, once in
    // the LLM card body. Either is fine — the assertion is "the LLM card
    // shipped with the BYO message".
    expect(screen.getAllByText(/BYO key/).length).toBeGreaterThanOrEqual(1);
  });

  it('surfaces an agents-list load error as a role=alert', async () => {
    setupRouter([
      { match: (u) => u.endsWith(AGENTS_PATH), response: new Response('boom', { status: 500 }) },
      { match: (u) => u.endsWith(LLM_STATUS_PATH), response: jsonResponse(noKeyStatus) },
    ]);
    renderSurface();
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.some((el) => /No se pudo cargar la lista/.test(el.textContent ?? ''))).toBe(
        true,
      );
    });
  });

  it('lists each registered agent with role + status', async () => {
    setupRouter([
      {
        match: (u, init) => u.endsWith(AGENTS_PATH) && (!init || init.method === undefined),
        response: jsonResponse([
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
      },
      { match: (u) => u.endsWith(LLM_STATUS_PATH), response: jsonResponse(noKeyStatus) },
    ]);
    renderSurface();
    await waitFor(() => screen.getByText('hermes'));
    expect(screen.getByText('claude-desktop')).toBeInTheDocument();
    expect(screen.getByText(/activo/i)).toBeInTheDocument();
    expect(screen.getByText(/revocado/i)).toBeInTheDocument();
  });

  it('opens the registration form and POSTs to /agent-credentials', async () => {
    setupRouter([
      {
        match: (u, init) => u.endsWith(AGENTS_PATH) && init?.method === 'POST',
        response: jsonResponse({
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
      },
      { match: (u) => u.endsWith(AGENTS_PATH), response: jsonResponse([]) },
      { match: (u) => u.endsWith(LLM_STATUS_PATH), response: jsonResponse(noKeyStatus) },
    ]);

    renderSurface();
    await waitFor(() => screen.getAllByRole('button', { name: /Registrar agente/ }));
    fireEvent.click(screen.getByRole('button', { name: /Registrar agente/ }));

    fireEvent.change(screen.getByLabelText(/Nombre del agente/), {
      target: { value: 'hermes' },
    });
    fireEvent.change(screen.getByLabelText(/Clave pública/), {
      target: { value: 'MCowBQYDK2VwAyEAabc' },
    });

    // Two submit buttons (toggle + form submit). Grab the last (submit).
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

  // ==========================================================================
  // Sprint 4 W2-1b — LLM provider key UI
  // ==========================================================================

  it('shows the form (no Reemplazar/Eliminar) when no key is configured', async () => {
    setupRouter([
      { match: (u) => u.endsWith(AGENTS_PATH), response: jsonResponse([]) },
      { match: (u) => u.endsWith(LLM_STATUS_PATH), response: jsonResponse(noKeyStatus) },
    ]);
    renderSurface();
    await waitFor(() => screen.getByLabelText(/Proveedor LLM/));
    expect(screen.getByLabelText(/Clave API/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar clave/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reemplazar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Eliminar/ })).toBeNull();
  });

  it('PUTs provider + apiKey and clears the input on success', async () => {
    setupRouter([
      { match: (u) => u.endsWith(AGENTS_PATH), response: jsonResponse([]) },
      {
        match: (u, init) => u.endsWith(LLM_STATUS_PATH) && init?.method === 'PUT',
        response: emptyResponse(204),
      },
      { match: (u) => u.endsWith(LLM_STATUS_PATH), response: jsonResponse(noKeyStatus) },
    ]);
    renderSurface();

    await waitFor(() => screen.getByLabelText(/Clave API/));
    fireEvent.change(screen.getByLabelText(/Proveedor LLM/), { target: { value: 'anthropic' } });
    const input = screen.getByLabelText(/Clave API/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-secret-123' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar clave/ }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
      );
      expect(putCall).toBeDefined();
      expect(String(putCall?.[0])).toContain('/api/organizations/');
      expect(String(putCall?.[0])).toContain('/llm-credentials');
      const body = JSON.parse(((putCall![1] as RequestInit).body ?? '{}') as string);
      expect(body.provider).toBe('anthropic');
      expect(body.apiKey).toBe('sk-secret-123');
    });
    // Cleartext key must be dropped from local state on submit.
    await waitFor(() =>
      expect((screen.getByLabelText(/Clave API/) as HTMLInputElement).value).toBe(''),
    );
  });

  it('toggles the API key input between password and text via show/hide', async () => {
    setupRouter([
      { match: (u) => u.endsWith(AGENTS_PATH), response: jsonResponse([]) },
      { match: (u) => u.endsWith(LLM_STATUS_PATH), response: jsonResponse(noKeyStatus) },
    ]);
    renderSurface();
    await waitFor(() => screen.getByLabelText(/Clave API/));
    const input = screen.getByLabelText(/Clave API/) as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: /Mostrar clave/ }));
    expect(input.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: /Ocultar clave/ }));
    expect(input.type).toBe('password');
  });

  it('renders the configured status line + Reemplazar/Eliminar when hasKey is true', async () => {
    setupRouter([
      { match: (u) => u.endsWith(AGENTS_PATH), response: jsonResponse([]) },
      { match: (u) => u.endsWith(LLM_STATUS_PATH), response: jsonResponse(configuredOkStatus) },
    ]);
    renderSurface();

    await waitFor(() => screen.getByText(/configurado/i));
    // "OpenAI" appears in both the BYO body copy and the status line.
    expect(screen.getAllByText(/OpenAI/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/último test/)).toBeInTheDocument();
    expect(screen.getByLabelText(/funciona/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reemplazar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Eliminar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Probar conexión/ })).toBeInTheDocument();
    // Form is closed by default when a key is configured.
    expect(screen.queryByLabelText(/Clave API/)).toBeNull();
  });

  it('POSTs the /test endpoint and renders the success result inline', async () => {
    setupRouter([
      { match: (u) => u.endsWith(AGENTS_PATH), response: jsonResponse([]) },
      {
        match: (u, init) => u.endsWith(LLM_TEST_PATH) && init?.method === 'POST',
        response: jsonResponse(configuredOkStatus),
      },
      { match: (u) => u.endsWith(LLM_STATUS_PATH), response: jsonResponse(configuredOkStatus) },
    ]);
    renderSurface();
    await waitFor(() => screen.getByRole('button', { name: /Probar conexión/ }));
    fireEvent.click(screen.getByRole('button', { name: /Probar conexión/ }));

    await waitFor(() => {
      expect(screen.getByText(/Conexión correcta/)).toBeInTheDocument();
    });
    const testCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith(LLM_TEST_PATH) && (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(testCall).toBeDefined();
  });

  it('DELETEs the credential when Eliminar is clicked', async () => {
    setupRouter([
      { match: (u) => u.endsWith(AGENTS_PATH), response: jsonResponse([]) },
      {
        match: (u, init) => u.endsWith(LLM_STATUS_PATH) && init?.method === 'DELETE',
        response: emptyResponse(204),
      },
      { match: (u) => u.endsWith(LLM_STATUS_PATH), response: jsonResponse(configuredOkStatus) },
    ]);
    renderSurface();
    await waitFor(() => screen.getByRole('button', { name: /Eliminar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Eliminar/ }));

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith(LLM_STATUS_PATH) &&
          (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(deleteCall).toBeDefined();
    });
  });

  it('shows the login fallback in the LLM card when no orgId is present', async () => {
    vi.mocked(useCurrentOrgId).mockReturnValue(undefined);
    setupRouter([
      { match: (u) => u.endsWith(AGENTS_PATH), response: jsonResponse([]) },
      // No LLM status request expected — the guard short-circuits.
    ]);
    renderSurface();
    await waitFor(() => screen.getByText(/Claves de proveedor LLM/));
    expect(
      screen.getByText(/Inicia sesión para configurar tu clave de proveedor LLM/),
    ).toBeInTheDocument();
  });
});
