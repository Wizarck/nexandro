import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProcurementScreen } from '../ProcurementScreen';

vi.mock('../../../lib/currentUser', () => ({
  useCurrentRole: vi.fn(),
  useCurrentOrgId: vi.fn(),
}));

import { useCurrentOrgId, useCurrentRole } from '../../../lib/currentUser';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
  vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
  global.fetch = fetchMock as unknown as typeof fetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderScreen(initialUrl = '/procurement?tab=gr') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <ProcurementScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gr-1',
    poId: 'po-1',
    supplierId: 'sup-1',
    receivedAt: '2026-05-18T14:08:00.000Z',
    receivedAtLocationId: 'loc-1',
    state: 'draft',
    requiresReview: false,
    supplierInvoiceRef: 'INV-001',
    sourcePhotoIngestionId: null,
    createdAt: '2026-05-18T14:08:00.000Z',
    ...overrides,
  };
}

function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gr-1',
    organizationId: 'org-1',
    poId: 'po-1',
    supplierId: 'sup-1',
    receivedAt: '2026-05-18T14:08:00.000Z',
    receivedAtLocationId: 'loc-1',
    receivingUserId: 'user-1',
    supplierInvoiceRef: 'INV-001',
    state: 'draft',
    requiresReview: false,
    sourcePhotoIngestionId: null,
    createdAt: '2026-05-18T14:08:00.000Z',
    updatedAt: '2026-05-18T14:08:00.000Z',
    lines: [
      {
        id: 'gr-line-1',
        grId: 'gr-1',
        poLineId: 'po-line-1',
        productId: '11111111-1111-4111-8111-111111111111',
        qtyReceivedActual: 12,
        unitPriceActual: 4.5,
        lotIdCreated: 'LOT-SUP-001',
        expiresAtOverride: null,
        createdAt: '2026-05-18T14:08:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('GrDetailDrawer (Sprint 4 W3-2 — j11 dock UX)', () => {
  it('clicking a GR row opens the drawer + fetches the detail payload', async () => {
    fetchMock
      // GET /m3/procurement/gr
      .mockResolvedValueOnce(jsonResponse({ items: [makeListItem()], total: 1 }))
      // GET /m3/procurement/gr/gr-1
      .mockResolvedValueOnce(jsonResponse(makeDetail()));

    renderScreen();

    const row = await screen.findByTestId('gr-row');
    fireEvent.click(row);

    expect(await screen.findByTestId('gr-detail-drawer')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('gr-detail-lines-list')).toBeInTheDocument();
    });
    const detailCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/m3/procurement/gr/gr-1'),
    );
    expect(detailCall).toBeDefined();
  });

  it('renders per-line edit fields (cantidad recibida · lote · caducidad) with tablet-friendly min-h 48 px', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [makeListItem()], total: 1 }))
      .mockResolvedValueOnce(jsonResponse(makeDetail()));

    renderScreen();

    fireEvent.click(await screen.findByTestId('gr-row'));
    await screen.findByTestId('gr-detail-drawer');

    const qtyInput = await screen.findByTestId('gr-line-qty-input');
    expect(qtyInput).toHaveAttribute('type', 'number');
    expect(qtyInput.className).toContain('min-h-[48px]');

    const lotInput = screen.getByTestId('gr-line-lot-input');
    expect(lotInput).toHaveValue('LOT-SUP-001');
    expect(lotInput.className).toContain('min-h-[48px]');

    const expiryInput = screen.getByTestId('gr-line-expiry-input');
    expect(expiryInput).toHaveAttribute('type', 'date');
    expect(expiryInput.className).toContain('min-h-[48px]');

    const confirmBtn = screen.getByTestId('gr-line-confirm-btn');
    expect(confirmBtn.className).toContain('min-h-[48px]');
    expect(confirmBtn.textContent).toContain('Confirmar');
  });

  it('editing the lot code surfaces the overwrite confirm modal before submit', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [makeListItem()], total: 1 }))
      .mockResolvedValueOnce(jsonResponse(makeDetail()));

    renderScreen();

    fireEvent.click(await screen.findByTestId('gr-row'));
    await screen.findByTestId('gr-detail-drawer');

    const lotInput = await screen.findByTestId('gr-line-lot-input');
    fireEvent.change(lotInput, { target: { value: 'LOT-OPERATOR-999' } });
    expect(
      screen.getByTestId('gr-line-lot-change-hint'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('gr-line-confirm-btn'));

    const modal = await screen.findByTestId('gr-line-lot-overwrite-modal');
    expect(modal).toBeInTheDocument();
    expect(modal.textContent).toContain('¿Sobrescribir lote del proveedor?');

    fireEvent.click(screen.getByTestId('gr-line-lot-overwrite-cancel'));
    expect(
      screen.queryByTestId('gr-line-lot-overwrite-modal'),
    ).not.toBeInTheDocument();
  });

  it('confirming with the lot-overwrite modal triggers the confirm mutation + surfaces backend-gap error', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [makeListItem()], total: 1 }))
      .mockResolvedValueOnce(jsonResponse(makeDetail()));

    renderScreen();

    fireEvent.click(await screen.findByTestId('gr-row'));
    await screen.findByTestId('gr-detail-drawer');

    const lotInput = await screen.findByTestId('gr-line-lot-input');
    fireEvent.change(lotInput, { target: { value: 'LOT-OPERATOR-999' } });
    fireEvent.click(screen.getByTestId('gr-line-confirm-btn'));
    fireEvent.click(await screen.findByTestId('gr-line-lot-overwrite-confirm'));

    // The backend confirm endpoint is a documented followup; the mutation
    // rejects with an informative error so the operator sees a non-silent
    // failure rather than a stuck spinner.
    const err = await screen.findByTestId('gr-line-confirm-error');
    expect(err.textContent).toContain(
      'backend endpoint not yet wired',
    );
  });

  it('renders the Hermes pre-fill mute eyebrow when the GR is photo-seeded', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            makeListItem({ sourcePhotoIngestionId: 'photo-1' }),
          ],
          total: 1,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(makeDetail({ sourcePhotoIngestionId: 'photo-1' })),
      );

    renderScreen();

    const row = await screen.findByTestId('gr-row');
    expect(row).toHaveAttribute('data-hermes-seed', 'true');
    fireEvent.click(row);

    const eyebrow = await screen.findByTestId('gr-hermes-prefill-eyebrow');
    expect(eyebrow.textContent).toContain('Pre-cargado por Hermes desde foto');
    expect(eyebrow.textContent).toContain('14:08');
    // Low-confidence destructive eyebrow stays hidden on a normal seed.
    expect(
      screen.queryByTestId('gr-hermes-low-confidence-eyebrow'),
    ).not.toBeInTheDocument();
  });

  it('renders the destructive low-confidence eyebrow when requiresReview is true', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            makeListItem({
              sourcePhotoIngestionId: 'photo-1',
              requiresReview: true,
            }),
          ],
          total: 1,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          makeDetail({
            sourcePhotoIngestionId: 'photo-1',
            requiresReview: true,
            supplierInvoiceRef: null,
            lines: [
              {
                id: 'gr-line-1',
                grId: 'gr-1',
                poLineId: null,
                productId: '11111111-1111-4111-8111-111111111111',
                qtyReceivedActual: 0,
                unitPriceActual: 0,
                lotIdCreated: null,
                expiresAtOverride: null,
                createdAt: '2026-05-18T14:08:00.000Z',
              },
            ],
          }),
        ),
      );

    renderScreen();

    fireEvent.click(await screen.findByTestId('gr-row'));
    const lowConfidence = await screen.findByTestId(
      'gr-hermes-low-confidence-eyebrow',
    );
    expect(lowConfidence.textContent).toContain('Confianza baja');
    expect(lowConfidence.textContent).toContain('revisar manualmente');
    // 1 missing supplierInvoiceRef + 1 missing lot + 1 missing expiry = 3.
    expect(lowConfidence.textContent).toContain('3 campos sin extraer');
  });

  it('Cerrar button closes the drawer + does not re-fetch detail on close', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [makeListItem()], total: 1 }))
      .mockResolvedValueOnce(jsonResponse(makeDetail()));

    renderScreen();

    fireEvent.click(await screen.findByTestId('gr-row'));
    await screen.findByTestId('gr-detail-drawer');
    const fetchCallsBeforeClose = fetchMock.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    await waitFor(() => {
      expect(screen.queryByTestId('gr-detail-drawer')).not.toBeInTheDocument();
    });
    expect(fetchMock.mock.calls.length).toBe(fetchCallsBeforeClose);
  });

  it('GR list rows expose ≥64 px touch target + open-by-keyboard (Enter)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [makeListItem()], total: 1 }))
      .mockResolvedValueOnce(jsonResponse(makeDetail()));

    renderScreen();

    const row = await screen.findByTestId('gr-row');
    expect(row.className).toContain('min-h-[64px]');
    expect(row).toHaveAttribute('role', 'button');
    expect(row).toHaveAttribute('tabIndex', '0');

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(await screen.findByTestId('gr-detail-drawer')).toBeInTheDocument();
  });

  it('W3-8: footer surfaces audit chip with AL-YYYY-NNNNNN + chain link', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            makeListItem({ id: 'abcdef01-2345-6789-abcd-ef0123456789' }),
          ],
          total: 1,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          makeDetail({ id: 'abcdef01-2345-6789-abcd-ef0123456789' }),
        ),
      );

    renderScreen();

    fireEvent.click(await screen.findByTestId('gr-row'));
    await screen.findByTestId('gr-detail-drawer');

    const chip = await screen.findByTestId('gr-detail-audit-chip');
    expect(chip.textContent).toContain('audit_log');
    // Tail of the uuid (last 6 hex chars uppercased) becomes the
    // human-readable AL short id slot until the canonical
    // AL-YYYY-NNNNNN is denormalised onto the GR detail payload.
    expect(chip.textContent).toContain('456789');

    const link = await screen.findByTestId('gr-detail-audit-chip-link');
    expect(link).toHaveAttribute(
      'href',
      '/audit-log?aggregate_id=abcdef01-2345-6789-abcd-ef0123456789',
    );
    expect(link.textContent).toContain('ver chain');
  });
});
