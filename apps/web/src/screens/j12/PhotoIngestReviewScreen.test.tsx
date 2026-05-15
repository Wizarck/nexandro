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
        'opentrattos.photoIngest.draft.v1.itm-1.MANAGER',
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
      'opentrattos.photoIngest.draft.v1.itm-1.MANAGER',
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
        'opentrattos.photoIngest.draft.v1.itm-1.MANAGER',
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
});
