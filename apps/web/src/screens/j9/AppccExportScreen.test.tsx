import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppccExportScreen } from './AppccExportScreen';

vi.mock('../../lib/currentUser', () => ({
  useCurrentRole: vi.fn(),
  useCurrentOrgId: vi.fn(),
}));

import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';

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

function renderWithClient(initialUrl = '/compliance/export') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <AppccExportScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function emptyArchive(): Response {
  return jsonResponse({ bundles: [] });
}

describe('AppccExportScreen', () => {
  it('renders signed-out fallback when role is unset', () => {
    vi.mocked(useCurrentRole).mockReturnValue(null);
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    renderWithClient();
    expect(
      screen.getByText(/Inicia sesión para acceder/),
    ).toBeInTheDocument();
  });

  it('renders no-org fallback when orgId is unset', () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue(undefined);
    renderWithClient();
    expect(screen.getByText('No hay organización activa.')).toBeInTheDocument();
  });

  it('renders forbidden fallback when role is STAFF', () => {
    vi.mocked(useCurrentRole).mockReturnValue('STAFF');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockImplementation(() => Promise.resolve(emptyArchive()));
    renderWithClient();
    expect(
      screen.getByText(/Solo Owners o Managers/),
    ).toBeInTheDocument();
  });

  it('renders the form with default selections for an Owner', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockImplementation(() => Promise.resolve(emptyArchive()));
    renderWithClient();

    expect(
      screen.getByText(
        'Exportación APPCC · expediente para autoridad sanitaria',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Generar bundle de auditoría')).toBeInTheDocument();
    // TransparencyBanner verbatim text
    expect(
      screen.getByRole('note').textContent,
    ).toContain('No producimos resumen ejecutivo.');

    // Default locale chip selected
    const localeGroup = screen.getByRole('group', { name: /Idioma/ });
    const pressedLocale = Array.from(
      localeGroup.querySelectorAll('button'),
    ).find((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressedLocale?.textContent).toContain('Castellano (es-ES)');

    // Default scope: haccp + lot checked. Sprint 2 P1-6: Spanish labels.
    const haccpCheckbox = screen.getByLabelText(
      /Registros HACCP/,
    ) as HTMLInputElement;
    const lotCheckbox = screen.getByLabelText(
      /Ciclo de vida de lotes/,
    ) as HTMLInputElement;
    const procurementCheckbox = screen.getByLabelText(
      /Compras/,
    ) as HTMLInputElement;
    expect(haccpCheckbox.checked).toBe(true);
    expect(lotCheckbox.checked).toBe(true);
    expect(procurementCheckbox.checked).toBe(false);
  });

  it('flips the locale chip when the operator picks a different locale', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockImplementation(() => Promise.resolve(emptyArchive()));
    renderWithClient();

    const localeGroup = screen.getByRole('group', { name: /Idioma/ });
    const euChip = Array.from(localeGroup.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Euskara'),
    )!;
    fireEvent.click(euChip);
    expect(euChip.getAttribute('aria-pressed')).toBe('true');
  });

  it('submits the bundle request and mounts the progress strip', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    // 1st call: archive list (initial fetch)
    // 2nd call: POST generateBundle
    // subsequent: status polling
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.includes('/m3/compliance/exports')) {
        return Promise.resolve(
          jsonResponse({ bundleId: 'b-1', status: 'generating' }),
        );
      }
      if (url.includes('/m3/compliance/exports/b-1?')) {
        return Promise.resolve(
          jsonResponse({
            bundleId: 'b-1',
            status: 'generating',
            currentStep: 'render_derivatives',
            currentStepIndex: 2,
            pageCount: 24,
            sizeBytes: 1_200_000,
            sha256: null,
            auditLogId: null,
            pdfUrl: null,
            csvUrl: null,
            dispatchedRecipients: 0,
          }),
        );
      }
      if (url.includes('/m3/compliance/exports?')) {
        return Promise.resolve(emptyArchive());
      }
      return Promise.resolve(emptyArchive());
    });

    renderWithClient();
    const generateButton = screen.getByRole('button', {
      name: 'Generar bundle',
    });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(
        screen.getByText('Renderizando vistas derivativas'),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });

  it('renders the BundleDownloadRow when status flips to ready', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.includes('/m3/compliance/exports')) {
        return Promise.resolve(
          jsonResponse({ bundleId: 'b-1', status: 'generating' }),
        );
      }
      if (url.includes('/m3/compliance/exports/b-1?')) {
        return Promise.resolve(
          jsonResponse({
            bundleId: 'b-1',
            status: 'ready',
            currentStep: 'done',
            currentStepIndex: 4,
            pageCount: 48,
            sizeBytes: 2_300_000,
            sha256:
              'a9f3b7c41e028d564a91fc837b295e0d3c4f8a179bd4e6020f157c83a945b274',
            auditLogId: 'AL-2026-189554',
            pdfUrl: '/pdf',
            csvUrl: '/csv',
            dispatchedRecipients: 0,
          }),
        );
      }
      if (url.includes('/m3/compliance/exports?')) {
        return Promise.resolve(emptyArchive());
      }
      return Promise.resolve(emptyArchive());
    });

    renderWithClient();
    fireEvent.click(screen.getByRole('button', { name: 'Generar bundle' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Descargar PDF/ }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /Descargar CSV/ }),
    ).toBeInTheDocument();
    // SHA-256 short form rendered
    expect(screen.getByText('a9f3…b274')).toBeInTheDocument();
    expect(screen.getByText('AL-2026-189554')).toBeInTheDocument();
  });

  // Audit v2 B-4: deep-link pre-fill ("Inspector aquí ahora").
  it('pre-fills inspector scope + raises banner when ?mode=inspeccion', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockImplementation(() => Promise.resolve(emptyArchive()));

    renderWithClient('/compliance/export?mode=inspeccion');

    // Paprika banner present
    expect(
      screen.getByRole('alert').textContent,
    ).toMatch(/Modo inspección activo/);

    // Inspector scope: haccp + lot + procurement + photo (not ai_obs).
    // Sprint 2 P1-6: Spanish labels.
    const haccp = screen.getByLabelText(/Registros HACCP/) as HTMLInputElement;
    const lot = screen.getByLabelText(/Ciclo de vida de lotes/) as HTMLInputElement;
    const procurement = screen.getByLabelText(/Compras/) as HTMLInputElement;
    const photo = screen.getByLabelText(/Trazabilidad de fotos/) as HTMLInputElement;
    expect(haccp.checked).toBe(true);
    expect(lot.checked).toBe(true);
    expect(procurement.checked).toBe(true);
    expect(photo.checked).toBe(true);
  });

  it('honours an explicit ?scope=haccp,photo and ignores defaults', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockImplementation(() => Promise.resolve(emptyArchive()));

    renderWithClient('/compliance/export?scope=haccp,photo');

    const haccp = screen.getByLabelText(/Registros HACCP/) as HTMLInputElement;
    const lot = screen.getByLabelText(/Ciclo de vida de lotes/) as HTMLInputElement;
    const photo = screen.getByLabelText(/Trazabilidad de fotos/) as HTMLInputElement;
    expect(haccp.checked).toBe(true);
    expect(lot.checked).toBe(false); // overridden by explicit ?scope
    expect(photo.checked).toBe(true);
  });

  // Sprint 2 P1-3 (audit 2026-05-18-v3-detail-06 BLOCKER Flag #1): bare-URL
  // surface must expose a paprika "Modo inspección →" chip that toggles
  // inspector-mode client-side (no re-route). Closes the muscle-memory gap
  // when Owner Roberto taps `Expediente APPCC` directly in the top nav
  // instead of coming from the HACCP dashboard deep-link.
  it('renders the "Modo inspección" chip on the bare URL and toggles inspector mode on click', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockImplementation(() => Promise.resolve(emptyArchive()));

    renderWithClient('/compliance/export');

    // Banner not present yet (bare URL = quarterly defaults).
    expect(screen.queryByRole('alert')).toBeNull();

    const chip = screen.getByTestId('enable-inspector-mode-chip');
    expect(chip.textContent).toMatch(/Modo inspección/);

    // Procurement + Photo are unchecked under the quarterly defaults.
    const procurementBefore = screen.getByLabelText(/Compras/) as HTMLInputElement;
    const photoBefore = screen.getByLabelText(/Trazabilidad de fotos/) as HTMLInputElement;
    expect(procurementBefore.checked).toBe(false);
    expect(photoBefore.checked).toBe(false);

    fireEvent.click(chip);

    // Banner mounts, chip hides, scope widens to the inspector set.
    expect(screen.getByRole('alert').textContent).toMatch(/Modo inspección activo/);
    expect(screen.queryByTestId('enable-inspector-mode-chip')).toBeNull();
    expect(
      (screen.getByLabelText(/Compras/) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/Trazabilidad de fotos/) as HTMLInputElement).checked,
    ).toBe(true);
  });

  // Master feedback 2026-05-18: no way to exit inspector mode once activated.
  it('exits inspector mode + resets scope to defaults when the X button is clicked', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockImplementation(() => Promise.resolve(emptyArchive()));

    renderWithClient('/compliance/export?mode=inspeccion');

    // Banner is visible + procurement/photo are checked.
    expect(screen.getByRole('alert').textContent).toMatch(/Modo inspección activo/);
    expect((screen.getByLabelText(/Compras/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Trazabilidad de fotos/) as HTMLInputElement).checked).toBe(true);

    const exitBtn = screen.getByTestId('disable-inspector-mode-button');
    fireEvent.click(exitBtn);

    // Banner gone, chip returns, scope restored to quarterly default (haccp+lot only).
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('enable-inspector-mode-chip')).toBeInTheDocument();
    expect((screen.getByLabelText(/HACCP/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Lot lifecycle|Ciclo de vida/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Compras/) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/Trazabilidad de fotos/) as HTMLInputElement).checked).toBe(false);
  });
});
