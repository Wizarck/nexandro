import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OwnerFsmsStandardsSection } from './OwnerFsmsStandardsSection';

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
        <OwnerFsmsStandardsSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OwnerFsmsStandardsSection', () => {
  it('shows login fallback when no org id is set', () => {
    vi.mocked(useCurrentOrgId).mockReturnValue(undefined);
    renderSurface();
    expect(
      screen.getByText(/Inicia sesión para revisar tu normativa HACCP/),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders empty state when the org has no FSMS standards', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ fsmsStandards: [] }));
    renderSurface();
    await waitFor(() =>
      screen.getByText(/Aún no hay normativa HACCP publicada/),
    );
  });

  it('groups standards by name and shows the active version badge', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        fsmsStandards: [
          {
            id: 'fs-2',
            organizationId: ORG,
            name: 'Cocina caliente',
            version: '2.0',
            effectiveFrom: '2026-01-01T00:00:00Z',
            effectiveUntil: null,
            ccpDefinitions: [
              {
                id: 'ccp-temp',
                label: 'Temperatura núcleo',
                inputType: 'numeric',
                unit: 'C',
                specMin: 65,
                specMax: 90,
              },
            ],
            createdAt: '2026-01-01T00:00:00Z',
          },
          {
            id: 'fs-1',
            organizationId: ORG,
            name: 'Cocina caliente',
            version: '1.0',
            effectiveFrom: '2025-01-01T00:00:00Z',
            effectiveUntil: '2026-01-01T00:00:00Z',
            ccpDefinitions: [],
            createdAt: '2025-01-01T00:00:00Z',
          },
        ],
      }),
    );

    renderSurface();
    await waitFor(() => screen.getByText('Cocina caliente'));
    // "v2.0" appears twice: once in the header summary ("vigente: v2.0") and
    // once as the active row label; "v1.0" only as the historical row label.
    expect(screen.getAllByText(/v2\.0/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/v1\.0/)).toBeInTheDocument();
    expect(screen.getByText(/2 versiones publicadas/)).toBeInTheDocument();
    expect(screen.getByText('vigente')).toBeInTheDocument();
  });

  it('expands a version row to reveal its CCP table', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        fsmsStandards: [
          {
            id: 'fs-A',
            organizationId: ORG,
            name: 'Recepción',
            version: '1.0',
            effectiveFrom: '2026-01-01T00:00:00Z',
            effectiveUntil: null,
            ccpDefinitions: [
              {
                id: 'ccp-cold-chain',
                label: 'Cadena de frío',
                inputType: 'numeric',
                unit: 'C',
                specMin: -2,
                specMax: 4,
              },
            ],
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    );

    renderSurface();
    await waitFor(() => screen.getByText('Recepción'));
    fireEvent.click(screen.getByRole('button', { expanded: false }));

    await waitFor(() => screen.getByText('ccp-cold-chain'));
    expect(screen.getByText('Cadena de frío')).toBeInTheDocument();
    expect(screen.getByText('Numérico')).toBeInTheDocument();
    expect(screen.getByText('-2 – 4')).toBeInTheDocument();
  });

  it('hits the OWNER-scoped list endpoint with the org id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ fsmsStandards: [] }));
    renderSurface();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/m3/haccp/fsms-standards');
    expect(String(url)).toContain(`organizationId=${ORG}`);
  });

  it('surfaces a load error as role=alert', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    renderSurface();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
