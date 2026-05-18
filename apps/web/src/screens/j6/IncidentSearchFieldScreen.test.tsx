import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IncidentSearchFieldScreen } from './IncidentSearchFieldScreen';

vi.mock('../../lib/currentUser', () => ({
  useCurrentRole: vi.fn(),
  useCurrentOrgId: vi.fn(),
}));

import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ hits: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
});

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/recall/investigate']}>
        <IncidentSearchFieldScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('IncidentSearchFieldScreen — sticky CTA bar (Sprint 2 P1-1)', () => {
  it('renders the sticky CTA bar with both primary + secondary buttons for an Owner', () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderScreen();

    const bar = screen.getByTestId('recall-sticky-action-bar');
    expect(bar).toBeInTheDocument();

    // Primary paprika CTA — j6.md §38 defining affordance.
    const primary = screen.getByRole('button', {
      name: /Detener servicio \+ Generar dossier/,
    });
    expect(primary).toBeInTheDocument();
    expect(primary.getAttribute('name')).toBe('dispatch-dossier');

    // Secondary ghost — escape hatch promoted from inline body link.
    const secondary = screen.getByRole('button', {
      name: /Reportar sin lote conocido/,
    });
    expect(secondary).toBeInTheDocument();
    expect(secondary.getAttribute('name')).toBe('report-unknown-lot');
  });

  it('primary CTA surfaces the M4-pending alert on click', () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderScreen();

    fireEvent.click(
      screen.getByRole('button', {
        name: /Detener servicio \+ Generar dossier/,
      }),
    );
    expect(alertSpy).toHaveBeenCalledWith(
      'Implementación pendiente — abriría el flujo de dispatch del dossier',
    );

    alertSpy.mockRestore();
  });

  it('does NOT render the sticky bar for a STAFF user (RBAC)', () => {
    vi.mocked(useCurrentRole).mockReturnValue('STAFF');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    renderScreen();
    expect(screen.queryByTestId('recall-sticky-action-bar')).toBeNull();
  });

  it('does NOT render the sticky bar when no org is active', () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue(undefined);
    renderScreen();
    expect(screen.queryByTestId('recall-sticky-action-bar')).toBeNull();
  });
});
