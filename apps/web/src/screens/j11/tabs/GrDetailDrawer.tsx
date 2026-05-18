import { useEffect, useMemo, useRef, useState } from 'react';
import type { GrDetail, GrLineDetail } from '../../../api/procurement';
import {
  useConfirmGrLine,
  useGoodsReceipt,
} from '../../../hooks/useProcurement';

/**
 * `<GrDetailDrawer />` — per-GR dock drawer per `docs/ux/j11.md` §5.
 *
 * Tablet-first surface: rows ≥ 64 px touch targets in the parent list,
 * primary buttons ≥ 48 px here, all wired against OKLCH design tokens.
 *
 * Sprint 4 W3-2 deliverable. The drawer is read-only-rendered from the
 * existing `GET /m3/procurement/gr/:id` detail payload added in the
 * same PR, with per-line edit fields (cantidad recibida · lote ·
 * caducidad) that submit through `useConfirmGrLine`.
 *
 * Sprint 4 W3-8 layered: the footer now carries the
 * `audit_log AL-2026-NNNNNN · ver chain →` chip linking to
 * `/audit-log?aggregate_id={gr.id}` (j11 §"Notes for
 * implementation"). The AL-short id slot mirrors the GR uuid suffix
 * until the canonical short id is denormalised onto the detail
 * payload (followup).
 *
 * Backend integration note: the per-line confirm endpoint is a
 * documented followup (see `apps/web/src/api/procurement.ts`
 * `confirmGoodsReceiptLine`). The mutation surfaces the rejection in
 * the row so the operator gets a non-silent failure.
 *
 * Hermes provenance (W3-4 bundled per scope):
 *   - `Pre-cargado por Hermes desde foto · HH:MM · revisar →` mute
 *     eyebrow when `sourcePhotoIngestionId !== null`.
 *   - `Confianza baja · revisar manualmente · N campos sin extraer`
 *     destructive eyebrow when `requiresReview === true`. (Spec calls
 *     for `metadata.confidence_band === 'flag-for-review'` but the
 *     richer metadata column is not yet emitted by the
 *     photo-ingestion-routing BC; `requiresReview` is the closest
 *     authoritative flag today per `goods_receipts.requires_review`.)
 */

export interface GrDetailDrawerProps {
  orgId: string;
  grId: string;
  onClose: () => void;
}

export function GrDetailDrawer({ orgId, grId, onClose }: GrDetailDrawerProps) {
  const detail = useGoodsReceipt(orgId, grId);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Focus the close button on mount so keyboard users land inside the
  // drawer (focus trap is intentionally minimal in this slice — the
  // shared `Drawer` primitive is on the M3 polish backlog).
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Esc closes per the j11 accessibility note in §"Notes for implementation".
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gr-detail-drawer-title"
      data-testid="gr-detail-drawer"
      className="fixed inset-0 z-40 flex justify-end"
    >
      <button
        type="button"
        aria-label="Cerrar drawer"
        data-testid="gr-detail-drawer-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-(--color-ink)/30"
      />
      <aside
        className="relative z-10 flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-(--color-bg) shadow-xl"
        style={{ borderLeft: '1px solid var(--color-border-strong)' }}
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-border-strong bg-(--color-bg) px-5 py-4">
          <div className="min-w-0">
            <p id="gr-detail-drawer-title" className="text-lg font-semibold text-ink">
              Recepción
            </p>
            {detail.data ? (
              <p className="mt-1 text-xs text-mute">
                {formatReceivedAt(detail.data.receivedAt)} · {detail.data.state}
              </p>
            ) : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] rounded-md border border-border-strong px-3 text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            Cerrar
          </button>
        </header>

        <div className="flex-1 space-y-4 px-5 py-4">
          {detail.isPending && (
            <p className="text-sm text-mute">Cargando líneas de la recepción…</p>
          )}
          {detail.error && (
            <p
              role="alert"
              className="rounded border border-(--color-destructive) bg-surface px-3 py-2 text-sm text-(--color-destructive)"
            >
              Error al cargar la recepción: {detail.error.message}
            </p>
          )}
          {detail.data && <DrawerBody orgId={orgId} detail={detail.data} />}
        </div>
      </aside>
    </div>
  );
}

function DrawerBody({ orgId, detail }: { orgId: string; detail: GrDetail }) {
  return (
    <>
      <HermesBanners detail={detail} />
      <HeaderFacts detail={detail} />
      <LinesList orgId={orgId} grId={detail.id} lines={detail.lines} />
      <AuditChipFooter grId={detail.id} />
    </>
  );
}

/**
 * Sprint 4 W3-8 — audit-chip footer linking the dock drawer to the
 * canonical audit_log entry for this GR. Same pattern as M2-audit-log-ui
 * (Wave 1.19): the link carries `aggregate_id` so the AuditLogScreen
 * lands pre-filtered on the operator's GR.
 *
 * Copy lock per Master review on j11 §"Notes for implementation":
 * `audit_log AL-2026-NNNNNN · ver chain →`. Today the GR detail payload
 * does NOT yet expose the `AL-2026-NNNNNN` short id (the hash-chain
 * shipping label is built on the audit-log side post-write). Until
 * that field is denormalised onto the GR detail, the chip surfaces
 * the linkable `audit_log` label + the chain-view affordance; the
 * `AL-2026-NNNNNN` short id slot in renders as the `gr.id`
 * shortened-uuid suffix so the row is still scannable. The
 * AuditLogScreen reads `aggregate_id` from URL params (followup —
 * the URL contract is canonical even while the screen reads from
 * form state).
 */
function AuditChipFooter({ grId }: { grId: string }) {
  const shortId = formatAuditChipShortId(grId);
  const href = `/audit-log?aggregate_id=${encodeURIComponent(grId)}`;
  return (
    <p
      className="pt-4 text-xs text-mute"
      data-testid="gr-detail-audit-chip"
    >
      <span>audit_log </span>
      <span className="font-mono text-ink">{shortId}</span>
      <span> · </span>
      <a
        href={href}
        data-testid="gr-detail-audit-chip-link"
        className="text-(--color-accent) underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        aria-label={`Ver la cadena de audit_log para esta recepción (${shortId})`}
      >
        ver chain →
      </a>
    </p>
  );
}

/**
 * The dock-drawer chip displays a stable, scannable short id derived
 * from the GR uuid until the backend denormalises the canonical
 * `AL-2026-NNNNNN` short id onto the GR detail payload. Picking the
 * last 6 hex chars of the uuid gives the operator a stable
 * 6-character identifier that's safe to read aloud over the dock
 * floor and is uniqueness-safe across realistic GR volumes within
 * a single org-day.
 */
function formatAuditChipShortId(grId: string): string {
  const compact = grId.replace(/-/g, '');
  const tail = compact.slice(-6).toUpperCase();
  return `AL-${new Date().getFullYear()}-${tail}`;
}

function HermesBanners({ detail }: { detail: GrDetail }) {
  const hermesSeed = detail.sourcePhotoIngestionId !== null;
  const lowConfidence = detail.requiresReview === true;
  if (!hermesSeed && !lowConfidence) return null;
  const receivedHHMM = formatHourMinute(detail.receivedAt);
  return (
    <div className="space-y-2">
      {hermesSeed && (
        <p
          data-testid="gr-hermes-prefill-eyebrow"
          className="text-xs text-mute"
        >
          Pre-cargado por Hermes desde foto · {receivedHHMM} · revisar →
        </p>
      )}
      {lowConfidence && (
        <p
          data-testid="gr-hermes-low-confidence-eyebrow"
          className="rounded-md border px-3 py-2 text-xs font-medium"
          style={{
            color: 'var(--color-destructive)',
            borderColor: 'var(--color-destructive)',
            backgroundColor: 'var(--color-bg)',
          }}
        >
          Confianza baja · revisar manualmente · {countMissingFields(detail)}{' '}
          campos sin extraer
        </p>
      )}
    </div>
  );
}

function HeaderFacts({ detail }: { detail: GrDetail }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <dt className="text-mute">OC</dt>
      <dd className="text-ink">{detail.poId ?? '—'}</dd>
      <dt className="text-mute">Albarán proveedor</dt>
      <dd className="text-ink">{detail.supplierInvoiceRef ?? '—'}</dd>
      <dt className="text-mute">Estado</dt>
      <dd className="text-ink">{detail.state}</dd>
      <dt className="text-mute">Líneas</dt>
      <dd className="text-ink">{detail.lines.length}</dd>
    </dl>
  );
}

function LinesList({
  orgId,
  grId,
  lines,
}: {
  orgId: string;
  grId: string;
  lines: GrLineDetail[];
}) {
  if (lines.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-4 text-sm text-mute">
        Aún no hay líneas registradas en esta recepción.
      </p>
    );
  }
  return (
    <ul
      data-testid="gr-detail-lines-list"
      className="space-y-3"
      aria-label="Líneas de la recepción"
    >
      {lines.map((line) => (
        <li key={line.id}>
          <GrLineRow orgId={orgId} grId={grId} line={line} />
        </li>
      ))}
    </ul>
  );
}

function GrLineRow({
  orgId,
  grId,
  line,
}: {
  orgId: string;
  grId: string;
  line: GrLineDetail;
}) {
  const confirm = useConfirmGrLine(orgId, grId);
  const [quantity, setQuantity] = useState<string>(
    String(line.qtyReceivedActual),
  );
  const [lotCode, setLotCode] = useState<string>(line.lotIdCreated ?? '');
  const initialLot = useMemo(() => line.lotIdCreated ?? '', [line.lotIdCreated]);
  const [expiry, setExpiry] = useState<string>(
    line.expiresAtOverride ? line.expiresAtOverride.slice(0, 10) : '',
  );
  const [overwriteOpen, setOverwriteOpen] = useState(false);

  const quantityNumber = Number.parseFloat(quantity);
  const quantityValid = Number.isFinite(quantityNumber) && quantityNumber > 0;
  const lotChanged = lotCode.trim() !== initialLot.trim();

  const doConfirm = () => {
    if (!quantityValid) return;
    confirm.mutate({
      lineId: line.id,
      input: {
        quantityReceived: quantityNumber,
        lotCode: lotCode.trim() || undefined,
        expiryDate: expiry || undefined,
      },
    });
  };

  const onConfirmClick = () => {
    if (lotChanged && initialLot.length > 0) {
      setOverwriteOpen(true);
      return;
    }
    doConfirm();
  };

  return (
    <article
      data-testid="gr-line-row"
      data-line-id={line.id}
      className="rounded-lg border bg-surface p-3"
      style={{ borderColor: 'var(--color-border-strong)' }}
    >
      <header className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink">
          Producto · <span className="text-mute">{line.productId.slice(0, 8)}</span>
        </p>
        <p className="text-xs text-mute">
          {line.poLineId ? 'Línea OC' : 'Sin OC'}
        </p>
      </header>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Cantidad esperada">
          <span data-testid="gr-line-qty-expected" className="tabular-nums text-sm text-ink">
            {line.qtyReceivedActual}
          </span>
        </Field>
        <Field label="Cantidad recibida">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={!quantityValid}
            aria-label="Cantidad recibida"
            data-testid="gr-line-qty-input"
            className="min-h-[48px] w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            style={{
              borderColor: quantityValid
                ? 'var(--color-border-strong)'
                : 'var(--color-destructive)',
              color: 'var(--color-ink)',
            }}
          />
        </Field>
        <Field label="Caducidad">
          <input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            aria-label="Fecha de caducidad"
            data-testid="gr-line-expiry-input"
            className="min-h-[48px] w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            style={{
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-ink)',
            }}
          />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Lote">
          <input
            type="text"
            value={lotCode}
            onChange={(e) => setLotCode(e.target.value)}
            aria-label="Código de lote"
            data-testid="gr-line-lot-input"
            className="min-h-[48px] w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            style={{
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-ink)',
            }}
          />
          {lotChanged && initialLot.length > 0 && (
            <p
              data-testid="gr-line-lot-change-hint"
              className="mt-1 text-xs"
              style={{ color: 'var(--color-destructive)' }}
            >
              Editaste el lote del proveedor — se pedirá confirmación.
            </p>
          )}
        </Field>
      </div>

      <footer className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {confirm.error && (
          <p
            role="alert"
            data-testid="gr-line-confirm-error"
            className="text-xs"
            style={{ color: 'var(--color-destructive)' }}
          >
            {confirm.error.message}
          </p>
        )}
        <button
          type="button"
          onClick={onConfirmClick}
          disabled={!quantityValid || confirm.isPending}
          data-testid="gr-line-confirm-btn"
          className="min-h-[48px] rounded-md px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-50"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-accent-fg)',
          }}
        >
          {confirm.isPending ? 'Confirmando…' : 'Confirmar'}
        </button>
      </footer>

      {overwriteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`overwrite-${line.id}-title`}
          data-testid="gr-line-lot-overwrite-modal"
          className="mt-3 rounded-md border bg-(--color-bg) p-3"
          style={{ borderColor: 'var(--color-border-strong)' }}
        >
          <p
            id={`overwrite-${line.id}-title`}
            className="text-sm font-medium text-ink"
          >
            ¿Sobrescribir lote del proveedor?
          </p>
          <p className="mt-1 text-xs text-mute">
            Original: <span className="font-medium">{initialLot}</span> ·
            nuevo: <span className="font-medium">{lotCode.trim() || '—'}</span>
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOverwriteOpen(false)}
              data-testid="gr-line-lot-overwrite-cancel"
              className="min-h-[48px] rounded-md px-3 text-sm text-mute focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                setOverwriteOpen(false);
                doConfirm();
              }}
              data-testid="gr-line-lot-overwrite-confirm"
              className="min-h-[48px] rounded-md px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-fg)',
              }}
            >
              Sí, sobrescribir
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs text-mute">
      <span className="block">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function formatReceivedAt(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

function formatHourMinute(iso: string): string {
  return iso.slice(11, 16);
}

function countMissingFields(detail: GrDetail): number {
  // The richer Hermes metadata column is not yet on the entity (see
  // header docstring). Until then we infer the "missing fields"
  // counter from the line list: every line with no lot or no expiry
  // is one operator-input field outstanding.
  let n = 0;
  for (const line of detail.lines) {
    if (line.lotIdCreated === null) n += 1;
    if (line.expiresAtOverride === null) n += 1;
  }
  if (detail.supplierInvoiceRef === null) n += 1;
  return n;
}
