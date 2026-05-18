import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HaccpRecordScreen } from './HaccpRecordScreen';

vi.mock('../../lib/currentUser', () => ({
  useCurrentRole: vi.fn(),
  useCurrentOrgId: vi.fn(),
}));

import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  window.localStorage.clear();
});

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HaccpRecordScreen />
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockRecentReadingsEmpty(): Response {
  return jsonResponse({ readings: [] });
}

function mockUnresolved(unresolved: boolean): Response {
  return jsonResponse({ unresolved });
}

function mockCorrectives(): Response {
  return jsonResponse({
    actions: [
      { id: 'a-recool', label: 'Re-enfriar producto en cámara secundaria', isPredefined: true, organizationId: 'org-demo', ccpId: 'ccp-cooling-curve' },
    ],
  });
}

function routeMock(url: string): Response {
  if (url.includes('/m3/haccp/readings?')) return mockRecentReadingsEmpty();
  if (url.includes('/last-out-of-spec-unresolved')) return mockUnresolved(false);
  if (url.includes('/m3/haccp/corrective-actions?')) return mockCorrectives();
  return jsonResponse({});
}

describe('HaccpRecordScreen', () => {
  it('renders signed-out fallback when role is unset', () => {
    vi.mocked(useCurrentRole).mockReturnValue(null);
    vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
    renderWithClient();
    expect(
      screen.getByText('Inicia sesión para registrar una lectura HACCP.'),
    ).toBeInTheDocument();
  });

  it('renders the CCP picker when signed in and orgId set', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('STAFF');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      Promise.resolve(routeMock(String(input))),
    );
    renderWithClient();
    await waitFor(() =>
      expect(screen.getByText('Curva de enfriamiento · cámara de entrantes')).toBeInTheDocument(),
    );
  });

  it('picks a CCP, enters out-of-spec value, gates the CTA until corrective is selected, then submits', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('STAFF');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.includes('/m3/haccp/readings')) {
        return Promise.resolve(
          jsonResponse({
            reading: {
              id: 'rd-1',
              organizationId: 'org-demo',
              ccpId: 'ccp-cooling-curve',
              actorUserId: 'STAFF',
              value: '3.5',
              unit: '°C',
              inSpec: false,
              specMin: -2,
              specMax: 2,
              correctiveActionId: 'a-recool',
              fsmsStandardVersion: 'FSMS-2026-v2',
              recordedAt: '2026-05-14T15:32:14Z',
              auditLogId: 'AL-2026-189587',
            },
          }),
        );
      }
      return Promise.resolve(routeMock(url));
    });

    renderWithClient();

    // Pick the cooling curve CCP.
    await waitFor(() =>
      expect(screen.getByText('Curva de enfriamiento · cámara de entrantes')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('Curva de enfriamiento · cámara de entrantes'));

    // Reading input mounts. Type an out-of-spec value.
    const input = await screen.findByLabelText('Valor de la lectura');
    fireEvent.change(input, { target: { value: '3.5' } });

    // Out-of-spec readback surfaces.
    await waitFor(() => {
      const region = screen.getByRole('status');
      expect(region.getAttribute('data-status')).toBe('out-of-spec');
    });

    // Corrective action picker is mounted; CTA is disabled.
    const firmar = screen.getByRole('button', { name: /Firmar lectura/ });
    expect(firmar.hasAttribute('disabled')).toBe(true);

    // Select the corrective action.
    const select = await screen.findByLabelText('Acción correctiva (FR12)');
    fireEvent.change(select, { target: { value: 'a-recool' } });

    // CTA enables; submit.
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Firmar lectura/ }).hasAttribute('disabled'),
      ).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: /Firmar lectura/ }));

    // Confirmation strip surfaces.
    await waitFor(() =>
      expect(screen.getByText(/Lectura firmada/)).toBeInTheDocument(),
    );

    // The POST was sent.
    const postCall = fetchMock.mock.calls.find((call) => {
      const u = String(call[0]);
      const initObj = call[1] as RequestInit | undefined;
      return u.endsWith('/m3/haccp/readings') && initObj?.method === 'POST';
    });
    expect(postCall).toBeTruthy();
    const postInit = postCall![1] as RequestInit;
    const body = JSON.parse(postInit.body as string) as Record<string, unknown>;
    expect(body.organizationId).toBe('org-demo');
    expect(body.ccpId).toBe('ccp-cooling-curve');
    expect(body.value).toBe('3.5');
    expect(body.correctiveActionId).toBe('a-recool');
  });

  it('persists a draft to localStorage on input change', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('STAFF');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      Promise.resolve(routeMock(String(input))),
    );
    renderWithClient();

    await waitFor(() =>
      expect(screen.getByText('Curva de enfriamiento · cámara de entrantes')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('Curva de enfriamiento · cámara de entrantes'));

    const input = await screen.findByLabelText('Valor de la lectura');
    fireEvent.change(input, { target: { value: '1.2' } });

    await waitFor(() => {
      const raw = window.localStorage.getItem(
        'nexandro.haccp.draft.v1.org-demo.ccp-cooling-curve.STAFF',
      );
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as { value: string; v: number };
      expect(parsed.value).toBe('1.2');
      expect(parsed.v).toBe(1);
    });
  });

  it('mounts the sticky warning when the probe returns unresolved=true', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('STAFF');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/last-out-of-spec-unresolved')) {
        return Promise.resolve(mockUnresolved(true));
      }
      return Promise.resolve(routeMock(url));
    });

    renderWithClient();
    await waitFor(() =>
      expect(screen.getByText('Curva de enfriamiento · cámara de entrantes')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('Curva de enfriamiento · cámara de entrantes'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
