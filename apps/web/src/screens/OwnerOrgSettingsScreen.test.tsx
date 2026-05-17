import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OwnerOrgSettingsScreen } from './OwnerOrgSettingsScreen';

vi.mock('../lib/currentUser', () => ({
  useCurrentRole: vi.fn(),
  useCurrentOrgId: vi.fn(),
}));

import { useCurrentOrgId, useCurrentRole } from '../lib/currentUser';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OwnerOrgSettingsScreen />
    </QueryClientProvider>,
  );
}

describe('OwnerOrgSettingsScreen', () => {
  it('Owner sees the form populated from GET response', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          organizationId: 'org-1',
          businessName: 'Acme',
          pageSize: 'a4',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    renderWithClient();
    await waitFor(() => {
      expect(screen.getByLabelText('Nombre del negocio')).toHaveValue('Acme');
    });
    expect(screen.getByRole('radio', { name: /A4/i })).toBeChecked();
  });

  it('Manager sees the access-denied fallback and zero fetches fire', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderWithClient();

    expect(
      screen.getByText('Solo el Owner puede modificar la configuración de etiquetas.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signed-out user (currentRole=null) sees the fallback and no fetch fires', async () => {
    vi.mocked(useCurrentRole).mockReturnValue(null);
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderWithClient();

    expect(
      screen.getByText('Solo el Owner puede modificar la configuración de etiquetas.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submitting the form calls PUT with the sanitized values and shows the success toast', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ organizationId: 'org-1', businessName: 'Old' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { organizationId: 'org-1', businessName: 'New' },
          missingFields: [],
          nextRequired: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    // The mutation's onSuccess invalidates the GET query → a third fetch fires.
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ organizationId: 'org-1', businessName: 'New' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    renderWithClient();
    await waitFor(() => expect(screen.getByLabelText('Nombre del negocio')).toHaveValue('Old'));

    fireEvent.change(screen.getByLabelText('Nombre del negocio'), {
      target: { value: 'New' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([_url, init]) => (init as RequestInit | undefined)?.method === 'PUT',
      );
      expect(putCall).toBeDefined();
      const body = JSON.parse(((putCall![1] as RequestInit).body ?? '{}') as string);
      expect(body.businessName).toBe('New');
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Configuración guardada');
    });
  });
});
