import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OwnerPrivacySection } from './OwnerPrivacySection';

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

function mockState(overrides: Partial<{
  deletionScheduledAt: string | null;
  retentionPolicy: { audit_log_days: number; photos_days: number; m3_review_queue_days: number };
  dpoContact: { name: string; email: string; phone?: string } | null;
}> = {}): Response {
  return jsonResponse({
    organizationId: ORG,
    deletionScheduledAt: overrides.deletionScheduledAt ?? null,
    retentionPolicy: overrides.retentionPolicy ?? {
      audit_log_days: 2555,
      photos_days: 90,
      m3_review_queue_days: 365,
    },
    dpoContact: overrides.dpoContact ?? null,
  });
}

function renderWithProviders() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OwnerPrivacySection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OwnerPrivacySection', () => {
  it('shows the access fallback when no org id is set', () => {
    vi.mocked(useCurrentOrgId).mockReturnValue(undefined);
    renderWithProviders();
    expect(
      screen.getByText(/Inicia sesión para gestionar tus datos/),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders all 5 GDPR card sections after the state loads', async () => {
    fetchMock.mockResolvedValueOnce(mockState());
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('Acceso + Portabilidad')).toBeInTheDocument();
    });
    expect(screen.getByText('Períodos de retención')).toBeInTheDocument();
    expect(screen.getByText('Datos del DPO')).toBeInTheDocument();
    expect(screen.getByText('Seguridad de la cuenta')).toBeInTheDocument();
    expect(screen.getByText('Eliminar organización')).toBeInTheDocument();
  });

  it('renders the export CTA + RGPD copy', async () => {
    fetchMock.mockResolvedValueOnce(mockState());
    renderWithProviders();
    await waitFor(() => screen.getByText('Acceso + Portabilidad'));
    expect(screen.getByRole('button', { name: /Exportar mis datos/ })).toBeInTheDocument();
    expect(screen.getByText(/RGPD art\. 15 \+ art\. 20/)).toBeInTheDocument();
  });

  it('retention save bar appears only when the form is dirty', async () => {
    fetchMock.mockResolvedValueOnce(mockState());
    renderWithProviders();
    await waitFor(() => screen.getByLabelText(/Registro de auditoría/));

    // Bar hidden at rest.
    expect(screen.queryByRole('region', { name: /Acciones pendientes/ })).toBeNull();

    fireEvent.change(screen.getByLabelText(/Fotos \(días\)/), {
      target: { value: '120' },
    });
    expect(screen.getByRole('region', { name: /Acciones pendientes/ })).toBeInTheDocument();
  });

  it('retention save fires PATCH /privacy/retention-policy', async () => {
    fetchMock.mockResolvedValueOnce(mockState());
    fetchMock.mockResolvedValueOnce(
      mockState({
        retentionPolicy: { audit_log_days: 2555, photos_days: 120, m3_review_queue_days: 365 },
      }),
    );
    renderWithProviders();
    await waitFor(() => screen.getByLabelText(/Fotos \(días\)/));

    fireEvent.change(screen.getByLabelText(/Fotos \(días\)/), {
      target: { value: '120' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([_, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      const url = String(patchCall?.[0]);
      expect(url).toContain('/api/privacy/retention-policy');
      expect(url).toContain(`organizationId=${ORG}`);
      const body = JSON.parse(((patchCall![1] as RequestInit).body ?? '{}') as string);
      expect(body.photos_days).toBe(120);
    });
  });

  it('retention rejects out-of-range values inline (no PATCH fired)', async () => {
    fetchMock.mockResolvedValueOnce(mockState());
    renderWithProviders();
    await waitFor(() => screen.getByLabelText(/Fotos \(días\)/));

    fireEvent.change(screen.getByLabelText(/Fotos \(días\)/), {
      target: { value: '9999' },
    });
    expect(await screen.findByText(/Revisa los rangos/)).toBeInTheDocument();
    // Save bar must not appear (invalid + dirty).
    expect(screen.queryByRole('region', { name: /Acciones pendientes/ })).toBeNull();
  });

  it('confirm modal requires typing the org name verbatim', async () => {
    fetchMock.mockResolvedValueOnce(mockState());
    renderWithProviders();
    await waitFor(() => screen.getByText('Eliminar organización'));

    fireEvent.click(screen.getByRole('button', { name: /Solicitar eliminación/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /Programar eliminación/ });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Escribe esta organización para confirmar/), {
      target: { value: 'wrong text' },
    });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Escribe esta organización para confirmar/), {
      target: { value: 'esta organización' },
    });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('scheduled deletion banner renders when state.deletionScheduledAt is set, with Cancel CTA', async () => {
    const scheduled = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    fetchMock.mockResolvedValueOnce(mockState({ deletionScheduledAt: scheduled }));
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByText(/Esta organización se eliminará el/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Cancelar eliminación/ })).toBeInTheDocument();
  });

  it('Cancel eliminación fires DELETE /privacy/delete-organization', async () => {
    const scheduled = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    fetchMock.mockResolvedValueOnce(mockState({ deletionScheduledAt: scheduled }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ organizationId: ORG, deletionScheduledAt: null, wasScheduled: true }),
    );
    fetchMock.mockResolvedValueOnce(mockState());
    renderWithProviders();
    await waitFor(() =>
      screen.getByRole('button', { name: /Cancelar eliminación/ }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Cancelar eliminación/ }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([_, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(call).toBeDefined();
      const url = String(call?.[0]);
      expect(url).toContain('/api/privacy/delete-organization');
      expect(url).toContain(`organizationId=${ORG}`);
    });
  });

  it('DPO contact form posts PATCH /privacy/dpo-contact with the typed values', async () => {
    fetchMock.mockResolvedValueOnce(mockState());
    fetchMock.mockResolvedValueOnce(
      mockState({
        dpoContact: { name: 'Marina López', email: 'dpo@miempresa.es' },
      }),
    );
    renderWithProviders();
    await waitFor(() => screen.getByLabelText('Nombre'));

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Marina López' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'dpo@miempresa.es' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar contacto del DPO/ }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => {
        return (
          String(url).includes('/api/privacy/dpo-contact') &&
          (init as RequestInit | undefined)?.method === 'PATCH'
        );
      });
      expect(call).toBeDefined();
      const body = JSON.parse(((call![1] as RequestInit).body ?? '{}') as string);
      expect(body.contact.name).toBe('Marina López');
      expect(body.contact.email).toBe('dpo@miempresa.es');
    });
  });

  it('2FA button shows the R8 stub message after clicking', async () => {
    fetchMock.mockResolvedValueOnce(mockState());
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        enabled: false,
        message: 'Próximamente: integraremos TOTP cuando R8 (auth real) aterrice.',
      }),
    );
    renderWithProviders();
    await waitFor(() => screen.getByRole('button', { name: /Activar 2FA/ }));

    fireEvent.click(screen.getByRole('button', { name: /Activar 2FA/ }));

    await waitFor(() => {
      expect(
        screen.getByText(/Próximamente: integraremos TOTP cuando R8/),
      ).toBeInTheDocument();
    });
  });

  it('API token rotate button is disabled with the R8 tooltip', async () => {
    fetchMock.mockResolvedValueOnce(mockState());
    renderWithProviders();
    await waitFor(() => screen.getByRole('button', { name: /Rotar token/ }));
    const btn = screen.getByRole('button', { name: /Rotar token/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', expect.stringMatching(/R8/));
  });
});
