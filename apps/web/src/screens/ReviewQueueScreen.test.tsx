import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewQueueScreen } from './ReviewQueueScreen';

vi.mock('../lib/currentUser', () => ({
  useCurrentRole: vi.fn(),
  useCurrentOrgId: vi.fn(),
}));

import { useCurrentOrgId, useCurrentRole } from '../lib/currentUser';

beforeEach(() => {
  vi.mocked(useCurrentRole).mockReturnValue('OWNER');
  vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
});

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ReviewQueueScreen />
    </QueryClientProvider>,
  );
}

describe('ReviewQueueScreen (j13)', () => {
  it('renders the j13 header (H1 + eyebrow) and the 3-tab Pendiente/Resuelto/Todo control', () => {
    renderWithClient();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Cambios retroactivos' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Cambios upstream que afectan firmas existentes.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Pendiente/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Resuelto/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Todo$/ })).toBeInTheDocument();
  });

  it('shows the empty-state card with the demo-toggle CTA when no rows are present', () => {
    renderWithClient();
    expect(
      screen.getByText('Sin cambios retroactivos pendientes'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Todas las firmas están al día con sus datos fuente.'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('retroactive-demo-toggle'),
    ).toHaveTextContent('Ver con datos de ejemplo');
  });

  it('clicking "Ver con datos de ejemplo" reveals the 3 demo rows + updates the Pendiente count', () => {
    renderWithClient();
    fireEvent.click(screen.getByTestId('retroactive-demo-toggle'));

    const rows = screen.getAllByTestId('retroactive-queue-row');
    expect(rows).toHaveLength(3);
    expect(screen.getByText(/Aceite oliva 5L/)).toBeInTheDocument();
    expect(screen.getByText(/Alérgenos override eliminado/)).toBeInTheDocument();
    expect(screen.getByText(/Mozzarella fior di latte/)).toBeInTheDocument();

    expect(screen.getByTestId('tab-count-pendiente')).toHaveTextContent('(3)');
  });

  it('switching to the Resuelto tab returns the empty state (no demo data in that lane yet)', () => {
    renderWithClient();
    fireEvent.click(screen.getByTestId('retroactive-demo-toggle'));
    expect(screen.getAllByTestId('retroactive-queue-row')).toHaveLength(3);

    fireEvent.click(screen.getByRole('tab', { name: /Resuelto/ }));

    expect(
      screen.queryAllByTestId('retroactive-queue-row'),
    ).toHaveLength(0);
    expect(
      screen.getByText('Sin cambios retroactivos pendientes'),
    ).toBeInTheDocument();
  });

  it('Staff sees access-denied fallback (RoleGuard)', () => {
    vi.mocked(useCurrentRole).mockReturnValue('STAFF');
    renderWithClient();
    expect(
      screen.getByText(
        'Solo el Owner y el Manager pueden consultar los cambios retroactivos.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('high-impact demo row opens the typed-reason modal on Re-firmar (Master decision #3 tiered confirm)', () => {
    renderWithClient();
    fireEvent.click(screen.getByTestId('retroactive-demo-toggle'));

    // Mozzarella row is impactPct=12 → above the 5 % threshold.
    const mozzarellaRow = screen
      .getAllByTestId('retroactive-queue-row')
      .find((el) => el.getAttribute('data-row-id') === 'demo-3');
    expect(mozzarellaRow).toBeDefined();
    const reSign = mozzarellaRow!.querySelector(
      '[data-action="re-sign"]',
    ) as HTMLButtonElement;
    fireEvent.click(reSign);

    expect(
      screen.getByTestId('retroactive-resign-reason-modal'),
    ).toBeInTheDocument();
  });
});
