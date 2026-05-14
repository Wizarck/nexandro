import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiObsDashboardScreen } from './AiObsDashboardScreen';

vi.mock('../../lib/currentUser', () => ({
  useCurrentRole: vi.fn(),
  useCurrentOrgId: vi.fn(),
}));

import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  // Clear localStorage between tests so widget config doesn't leak.
  window.localStorage.clear();
});

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AiObsDashboardScreen />
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const emptyOverview = {
  status: 'empty' as const,
  period: 'this_month' as const,
  errorRate: { value: 0, series: [], peak: null },
  costTotal: { value: 0, monthlyBudgetEur: null, pctConsumed: null },
  budgetStatus: {
    tier: null,
    pctConsumed: null,
    daysUntilEmpty: null,
    avg7dDaily: 0,
  },
  costByCapability: [],
  costByModel: [],
  heatmap: {
    cells: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
    max: 0,
  },
  anomalies: [],
  savingsOpportunities: [],
  blastRadius: [],
  otlpExporter: { endpoint: 'langfuse.opentrattos.local', status: 'active' as const },
};

const populatedOverview = {
  ...emptyOverview,
  status: 'ok' as const,
  errorRate: { value: 0.004, series: [{ index: 0, value: 0.004 }], peak: null },
  costTotal: { value: 84.21, monthlyBudgetEur: 120, pctConsumed: 0.7 },
  budgetStatus: {
    tier: 'warn' as const,
    pctConsumed: 0.7,
    daysUntilEmpty: 13,
    avg7dDaily: 2.73,
  },
  costByCapability: [
    { label: 'inventory.ingest-invoice-photo', totalEur: 40, sharePct: 0.5 },
  ],
  costByModel: [
    { label: 'gpt-oss-vision-72b', totalEur: 50, sharePct: 0.6 },
  ],
  blastRadius: [
    {
      model: 'gpt-oss-vision-72b',
      criticality: 'critical' as const,
      trafficPct: 0.6,
      dependents: ['inventory.ingest-invoice-photo'],
      fallback: 'gpt-4o-mini (+47 % coste)',
      deprecation: null,
    },
  ],
};

describe('AiObsDashboardScreen', () => {
  it('Owner sees populated dashboard from GET /m3/ai-obs/*', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('11111111-1111-4111-8111-111111111111');
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('/m3/ai-obs/overview')) {
        return jsonResponse(populatedOverview);
      }
      if (u.includes('/m3/ai-obs/cost-by-tag')) {
        return jsonResponse({
          status: 'empty',
          period: 'this_month',
          tags: [],
        });
      }
      if (u.includes('/m3/ai-obs/failures')) {
        return jsonResponse({
          status: 'empty',
          range: '24h',
          failures: [],
        });
      }
      return jsonResponse({});
    });

    renderWithClient();
    await waitFor(() => expect(screen.getAllByText(/Coste por capacidad/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/gpt-oss-vision-72b/).length).toBeGreaterThan(0);
    // Budget tier copy renders.
    expect(screen.getByText(/Warn/)).toBeInTheDocument();
  });

  it('Manager also sees the dashboard (any-of role guard)', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
    vi.mocked(useCurrentOrgId).mockReturnValue('11111111-1111-4111-8111-111111111111');
    fetchMock.mockResolvedValue(jsonResponse(emptyOverview));

    renderWithClient();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/m3/ai-obs/overview'),
        expect.anything(),
      ),
    );
  });

  it('Staff sees AccessDenied; no fetch fires', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('STAFF');
    vi.mocked(useCurrentOrgId).mockReturnValue('11111111-1111-4111-8111-111111111111');
    renderWithClient();
    await waitFor(() =>
      expect(screen.getByText(/Tu rol no tiene acceso/)).toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Unsigned (no role) sees AccessDenied; no fetch fires', async () => {
    vi.mocked(useCurrentRole).mockReturnValue(null);
    vi.mocked(useCurrentOrgId).mockReturnValue('11111111-1111-4111-8111-111111111111');
    renderWithClient();
    await waitFor(() =>
      expect(screen.getByText(/Tu rol no tiene acceso/)).toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Owner without orgId sees SignedOut; no fetch fires', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue(undefined);
    renderWithClient();
    await waitFor(() =>
      expect(screen.getByText(/Inicia sesión/)).toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders empty-state widgets when status="empty"', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('11111111-1111-4111-8111-111111111111');
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('overview')) return jsonResponse(emptyOverview);
      if (u.includes('cost-by-tag'))
        return jsonResponse({ status: 'empty', period: 'this_month', tags: [] });
      return jsonResponse({ status: 'empty', range: '24h', failures: [] });
    });
    renderWithClient();
    await waitFor(() =>
      expect(screen.getByText(/Sin presupuesto configurado/)).toBeInTheDocument(),
    );
    // Capability + model widgets render their empty states.
    expect(screen.getByText('Sin actividad por capacidad')).toBeInTheDocument();
    expect(screen.getByText('Sin actividad por modelo')).toBeInTheDocument();
  });
});
