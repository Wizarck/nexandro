import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhotoIngestReviewScreen } from './PhotoIngestReviewScreen';

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
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <PhotoIngestReviewScreen />
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ITEM_1_QUEUE = {
  itemId: 'itm-1',
  organizationId: 'org-demo',
  kind: 'invoice' as const,
  status: 'pending_review' as const,
  photoUrl: 'https://example.test/p1.jpg',
  thumbnailUrl: null,
  hint: 'Mercabarna · Albarán 4471',
  uploadedAt: '2026-05-15T14:00:00Z',
  extraction: {
    modelVersion: 'gpt-oss-vision-72b',
    promptVersion: '2.3',
    overallConfidence: 0.74,
    auditLogId: 'AL-2026-189617',
  },
  fields: [],
  boundingBoxes: [],
  signedAt: null,
  signedByUserId: null,
  correctionsHistory: [],
};

const ITEM_1_DETAIL = {
  ...ITEM_1_QUEUE,
  fields: [
    {
      fieldName: 'supplier',
      label: 'Proveedor',
      extractedValue: 'Mercabarna',
      operatorValue: 'Mercabarna',
      confidence: 0.91,
      boundingBox: null,
    },
    {
      fieldName: 'total',
      label: 'Total',
      extractedValue: '',
      operatorValue: '',
      confidence: 0.42,
      boundingBox: null,
    },
  ],
  boundingBoxes: [
    { fieldName: 'supplier', x: 10, y: 10, w: 100, h: 30, label: 'Proveedor' },
  ],
};

const ITEM_2_QUEUE = {
  ...ITEM_1_QUEUE,
  itemId: 'itm-2',
  hint: 'Atún rojo · Lot 88',
  kind: 'product' as const,
};

function routeMock(
  url: string,
  init?: RequestInit,
): Response {
  if (init?.method === 'POST' && url.includes('/sign')) {
    return jsonResponse({
      itemId: 'itm-1',
      status: 'signed',
      signedAt: '2026-05-15T14:30:00Z',
      auditLogId: 'AL-2026-189618',
      downstreamAggregateType: 'invoice',
      downstreamAggregateId: 'gr-99',
    });
  }
  if (init?.method === 'POST' && url.includes('/reclassify')) {
    return jsonResponse({
      itemId: 'itm-1',
      kind: 'product',
      auditLogId: 'AL-2026-189619',
    });
  }
  if (url.includes('/m3/photo-ingest/items/itm-1?')) {
    return jsonResponse(ITEM_1_DETAIL);
  }
  if (url.includes('/m3/photo-ingest/items/itm-2?')) {
    return jsonResponse({ ...ITEM_1_DETAIL, itemId: 'itm-2', kind: 'product' });
  }
  if (url.includes('/m3/photo-ingest/items?')) {
    return jsonResponse({ items: [ITEM_1_QUEUE, ITEM_2_QUEUE] });
  }
  return jsonResponse({});
}

describe('PhotoIngestReviewScreen', () => {
  it('renders the signed-out fallback when role is unset', () => {
    vi.mocked(useCurrentRole).mockReturnValue(null);
    vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
    renderWithClient();
    expect(
      screen.getByText(/Inicia sesión para revisar la cola/),
    ).toBeInTheDocument();
  });

  it('renders the staff fallback when role is STAFF', () => {
    vi.mocked(useCurrentRole).mockReturnValue('STAFF');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
    renderWithClient();
    expect(
      screen.getByText(/Acceso restringido/),
    ).toBeInTheDocument();
  });

  it('Manager sees the queue + selects an item + sees fields + signs', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(routeMock(String(input), init)),
    );

    renderWithClient();

    // Queue row renders.
    await waitFor(() =>
      expect(screen.getByText(/Mercabarna/)).toBeInTheDocument(),
    );

    // First item auto-selected; the photo viewer and fields mount.
    await waitFor(() =>
      expect(screen.getByLabelText('Proveedor')).toBeInTheDocument(),
    );

    // Reject-band Total field present + CTA disabled because total is empty.
    const cta = screen.getByRole('button', { name: /Firmar ingestión/ });
    expect(cta.hasAttribute('disabled')).toBe(true);

    // Type a non-empty total to unblock the gate.
    fireEvent.change(screen.getByLabelText('Total'), {
      target: { value: '142,80' },
    });

    await waitFor(() => {
      expect(
        screen
          .getByRole('button', { name: /Firmar ingestión/ })
          .hasAttribute('disabled'),
      ).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: /Firmar ingestión/ }));

    await waitFor(() =>
      expect(screen.getByText(/Ingestión firmada/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/ver en Procurement/)).toBeInTheDocument();

    // The POST sign was sent with the typed total.
    const signCall = fetchMock.mock.calls.find((call) => {
      const u = String(call[0]);
      const initObj = call[1] as RequestInit | undefined;
      return u.includes('/sign') && initObj?.method === 'POST';
    });
    expect(signCall).toBeTruthy();
    const body = JSON.parse(
      (signCall![1] as RequestInit).body as string,
    ) as { fields: { fieldName: string; operatorValue: string }[] };
    const totalField = body.fields.find((f) => f.fieldName === 'total');
    expect(totalField?.operatorValue).toBe('142,80');
  });

  it('persists a draft to localStorage on field edit', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(routeMock(String(input), init)),
    );

    renderWithClient();
    await waitFor(() =>
      expect(screen.getByLabelText('Total')).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText('Total'), {
      target: { value: '142,80' },
    });

    await waitFor(() => {
      const raw = window.localStorage.getItem(
        'nexandro.photoIngest.draft.v1.itm-1.MANAGER',
      );
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as {
        fieldValues: Record<string, string>;
        v: number;
      };
      expect(parsed.v).toBe(1);
      expect(parsed.fieldValues.total).toBe('142,80');
    });
  });

  it('discards a 31-minute-old draft on mount', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(routeMock(String(input), init)),
    );

    window.localStorage.setItem(
      'nexandro.photoIngest.draft.v1.itm-1.MANAGER',
      JSON.stringify({
        fieldValues: { total: 'stale' },
        savedAt: Date.now() - 31 * 60_000,
        v: 1,
      }),
    );

    renderWithClient();

    await waitFor(() =>
      expect(screen.getByLabelText('Total')).toBeInTheDocument(),
    );
    const total = screen.getByLabelText('Total') as HTMLInputElement;
    expect(total.value).toBe('');
    expect(
      window.localStorage.getItem(
        'nexandro.photoIngest.draft.v1.itm-1.MANAGER',
      ),
    ).toBeNull();
  });

  it('advances queue with the j shortcut outside form inputs', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(routeMock(String(input), init)),
    );

    renderWithClient();
    await waitFor(() =>
      expect(screen.getByText(/Mercabarna/)).toBeInTheDocument(),
    );
    // Wait for DetailPane to mount + register the keyboard handler. The
    // auto-select effect runs after items load; DetailPane mounts on the
    // next render once selectedItemId is non-null.
    await waitFor(() =>
      expect(screen.getByText(/Firmar ingestión/)).toBeInTheDocument(),
    );

    fireEvent.keyDown(window, { key: 'j' });

    await waitFor(() => {
      const selected = screen
        .getAllByRole('button')
        .find((b) => b.getAttribute('data-selected') === 'true');
      expect(selected?.textContent).toContain('Atún rojo');
    });
  });

  // Sprint 2 P1-2 (j12.md §Trigger ii): "+ Subir foto" upload affordance must
  // be visible at the top-right of the header regardless of populated/empty
  // state. Wiring to the real upload queue is M4 scope — for now the change
  // event surfaces an alert.
  describe('header upload affordance', () => {
    it('renders the Subir foto button when the queue is EMPTY', async () => {
      vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
      vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
      fetchMock.mockImplementation(() =>
        Promise.resolve(jsonResponse({ items: [] })),
      );

      renderWithClient();

      await waitFor(() =>
        expect(screen.getByText(/Cola vacía · todo al día/)).toBeInTheDocument(),
      );
      const btn = screen.getByTestId('photo-upload-button');
      expect(btn).toBeInTheDocument();
      expect(btn.textContent).toMatch(/Subir foto/);
    });

    it('renders the Subir foto button when the queue is POPULATED', async () => {
      vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
      vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(routeMock(String(input), init)),
      );

      renderWithClient();

      await waitFor(() =>
        expect(screen.getByText(/Mercabarna/)).toBeInTheDocument(),
      );
      expect(screen.getByTestId('photo-upload-button')).toBeInTheDocument();
    });

    it('the file input surfaces the M4-pending alert on change', async () => {
      vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
      vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
      fetchMock.mockImplementation(() =>
        Promise.resolve(jsonResponse({ items: [] })),
      );
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      renderWithClient();

      const input = (await screen.findByTestId(
        'photo-upload-input',
      )) as HTMLInputElement;
      const file = new File(['fake-png'], 'recepcion.png', { type: 'image/png' });
      fireEvent.change(input, { target: { files: [file] } });

      expect(alertSpy).toHaveBeenCalledWith(
        'Subida pendiente — entrará a la cola HITL',
      );
      alertSpy.mockRestore();
    });
  });

  it('suppresses keyboard shortcuts while typing inside an input', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(routeMock(String(input), init)),
    );

    renderWithClient();
    await waitFor(() =>
      expect(screen.getByLabelText('Total')).toBeInTheDocument(),
    );

    const total = screen.getByLabelText('Total');
    fireEvent.keyDown(total, { key: 'j' });

    // No queue navigation: the selected row stays on itm-1.
    const selected = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('data-selected') === 'true');
    expect(selected?.textContent).toContain('Mercabarna');
  });

  // m3.x-photo-ingest-retroactive-correction-ui — signed scope + retro
  // flow. The Firmadas chip switches the queue + status filter. A signed
  // item renders read-only with a history sidebar; clicking the retro
  // button opens the editable form; idempotent submits show a banner.
  describe('signed scope + retro flow', () => {
    const SIGNED_ITEM = {
      ...ITEM_1_QUEUE,
      itemId: 'itm-signed',
      status: 'signed' as const,
      hint: 'Mercabarna · Firmada',
      signedAt: '2026-05-14T10:00:00Z',
      signedByUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      fields: [
        {
          fieldName: 'qty',
          label: 'Cantidad',
          extractedValue: '18',
          operatorValue: '18',
          confidence: 0.99,
          boundingBox: null,
        },
      ],
      boundingBoxes: [],
      correctionsHistory: [
        {
          correctionId: '11111111-1111-4111-8111-111111111111',
          correctedAt: '2026-05-14T10:00:00.000Z',
          correctedByUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          reason: 'Recount tras inventario',
          previousCorrection: {
            fields: [{ fieldName: 'qty', operatorValue: '12' }],
          },
          contentHash: 'abc',
        },
      ],
    };

    function signedRouteMock(
      url: string,
      init?: RequestInit,
      retroResponse?: { idempotent: boolean; correctionsHistoryLength: number },
    ): Response {
      if (
        init?.method === 'POST' &&
        url.includes('/retroactive-correction')
      ) {
        return jsonResponse({
          itemId: 'itm-signed',
          status: 'signed',
          correctionsHistoryLength:
            retroResponse?.correctionsHistoryLength ?? 2,
          idempotent: retroResponse?.idempotent ?? false,
        });
      }
      if (url.includes('/m3/photo-ingest/items/itm-signed?')) {
        return jsonResponse(SIGNED_ITEM);
      }
      if (
        url.includes('/m3/photo-ingest/items?') &&
        url.includes('status=signed')
      ) {
        return jsonResponse({ items: [SIGNED_ITEM] });
      }
      return jsonResponse({});
    }

    it('Firmadas chip shows signed items with the corrections-history sidebar', async () => {
      vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
      vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(signedRouteMock(String(input), init)),
      );

      renderWithClient();

      // Pick the Firmadas chip.
      const chip = await screen.findByRole('button', { name: 'Firmadas' });
      fireEvent.click(chip);

      // Signed item auto-selected; the history sidebar mounts.
      await waitFor(() =>
        expect(screen.getByText('Historial de correcciones')).toBeInTheDocument(),
      );
      const entry = screen.getByTestId('corrections-history-entry');
      expect(entry).toHaveTextContent('Recount tras inventario');
      // Read-only fields render as aria-readonly elements (no inputs).
      const qty = screen.getByLabelText('Cantidad');
      expect(qty.tagName).toBe('DIV');
      expect(qty.getAttribute('aria-readonly')).toBe('true');
    });

    it('clicking a history entry opens the diff modal with old → new per-field rows; closing dismisses it', async () => {
      vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
      vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(signedRouteMock(String(input), init)),
      );

      renderWithClient();
      fireEvent.click(await screen.findByRole('button', { name: 'Firmadas' }));

      await waitFor(() =>
        expect(screen.getByText('Historial de correcciones')).toBeInTheDocument(),
      );

      // Click the single history entry button.
      const entry = screen.getByTestId('corrections-history-entry');
      const button = entry.querySelector('button');
      expect(button).not.toBeNull();
      fireEvent.click(button!);

      // Modal opens with one diff row for `qty` (snapshot '12' → current '18').
      const modal = await screen.findByTestId('corrections-history-diff-modal');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      const rows = screen.getAllByTestId('corrections-history-diff-row');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveAttribute('data-field-name', 'qty');
      expect(rows[0]).toHaveTextContent('12');
      expect(rows[0]).toHaveTextContent('18');

      // ESC closes.
      fireEvent.keyDown(modal, { key: 'Escape' });
      await waitFor(() =>
        expect(
          screen.queryByTestId('corrections-history-diff-modal'),
        ).not.toBeInTheDocument(),
      );
    });

    it('clicking "Corregir retroactivamente" switches the right column to editable retro mode', async () => {
      vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
      vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(signedRouteMock(String(input), init)),
      );

      renderWithClient();

      // Switch to Firmadas scope so a signed item is auto-selected.
      fireEvent.click(await screen.findByRole('button', { name: 'Firmadas' }));

      await waitFor(() =>
        expect(screen.getByText('Historial de correcciones')).toBeInTheDocument(),
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'Corregir retroactivamente' }),
      );

      // Field becomes an <input>; reason textarea appears; Reenviar firma button shown.
      const qty = await screen.findByLabelText('Cantidad');
      expect(qty.tagName).toBe('INPUT');
      expect(screen.getByLabelText(/Motivo/)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Reenviar firma' }),
      ).toBeInTheDocument();
    });

    it('submitting a retro correction with no changes shows the idempotent banner', async () => {
      vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
      vi.mocked(useCurrentOrgId).mockReturnValue('org-demo');
      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(
          signedRouteMock(String(input), init, {
            idempotent: true,
            correctionsHistoryLength: 1,
          }),
        ),
      );

      renderWithClient();

      fireEvent.click(await screen.findByRole('button', { name: 'Firmadas' }));
      await waitFor(() =>
        expect(screen.getByText('Historial de correcciones')).toBeInTheDocument(),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Corregir retroactivamente' }),
      );
      // Don't change the field; submit as-is.
      fireEvent.click(await screen.findByRole('button', { name: 'Reenviar firma' }));

      await waitFor(() =>
        expect(screen.getByTestId('retro-idempotent-banner')).toHaveTextContent(
          'Sin cambios — la última corrección es idéntica.',
        ),
      );
      // Retro mode stays open (input is still editable).
      expect(
        (screen.getByLabelText('Cantidad') as HTMLElement).tagName,
      ).toBe('INPUT');
    });
  });
});
