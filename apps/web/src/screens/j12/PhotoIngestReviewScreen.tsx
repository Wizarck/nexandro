import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AiProvenanceChip,
  ExtractedFieldList,
  HitlQueueList,
  PhotoViewer,
  TransparencyBanner,
  type ExtractedField,
  type HitlQueueRow,
} from '@opentrattos/ui-kit';
import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';
import {
  useHitlQueue,
  useIngestionItem,
  useReclassifyIngestion,
  useSignIngestion,
} from '../../hooks/usePhotoIngest';
import type {
  IngestionField,
  IngestionItem,
  SignIngestionResponse,
} from '../../api/photo-ingest';

/**
 * j12 Photo-ingestion HITL review screen (slice #17b
 * m3-photo-ingest-review-ui, Wave 2.8). LAST M3 slice.
 *
 * Composes 6 ui-kit primitives + TransparencyBanner (Wave 2.7) into a
 * three-column office-laptop layout per the j12 mock:
 *   left   — HitlQueueList with bulk-review chip group above
 *   centre — PhotoViewer with bounding-box overlay
 *   right  — ExtractedFieldList + AiProvenanceChip
 *
 * State machine: idle → selected → editing → submitting → submitted.
 * Reciprocal box ↔ field hover state is lifted here per ADR-J12-
 * RECIPROCAL-LINK-CLIENT-SIDE. 30-minute localStorage draft per
 * (itemId, actorUserId) per ADR-J12-DRAFT-LOCALSTORAGE. Owner +
 * Manager only per ADR-J12-OWNER-MANAGER-ONLY.
 */
const DRAFT_TTL_MS = 30 * 60_000;
const DRAFT_KEY_PREFIX = 'opentrattos.photoIngest.draft.v1';

type ScopeChip = 'mine' | 'all' | 'rejected';

interface PhotoIngestDraftV1 {
  fieldValues: Record<string, string>;
  savedAt: number;
  v: 1;
}

function draftKey(itemId: string, actorUserId: string): string {
  return `${DRAFT_KEY_PREFIX}.${itemId}.${actorUserId}`;
}

function loadDraft(key: string): PhotoIngestDraftV1 | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed != null &&
      (parsed as PhotoIngestDraftV1).v === 1 &&
      typeof (parsed as PhotoIngestDraftV1).savedAt === 'number' &&
      typeof (parsed as PhotoIngestDraftV1).fieldValues === 'object'
    ) {
      const d = parsed as PhotoIngestDraftV1;
      if (Date.now() - d.savedAt > DRAFT_TTL_MS) {
        window.localStorage.removeItem(key);
        return null;
      }
      return d;
    }
    return null;
  } catch {
    return null;
  }
}

function saveDraft(key: string, draft: PhotoIngestDraftV1): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Quota / disabled — silent. j12 §Edge case "Network drops mid-edit".
  }
}

function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // silent.
  }
}

function toQueueRow(item: IngestionItem): HitlQueueRow {
  return {
    itemId: item.itemId,
    kind: item.kind,
    hint: item.hint,
    thumbnailUrl: item.thumbnailUrl,
    uploadedAt: Date.parse(item.uploadedAt),
    overallConfidence: item.extraction.overallConfidence,
  };
}

function toExtractedField(field: IngestionField, override?: string): ExtractedField {
  return {
    fieldName: field.fieldName,
    label: field.label,
    extractedValue: field.extractedValue,
    operatorValue: override ?? field.operatorValue,
    confidence: field.confidence,
  };
}

function isTypingInsideForm(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function PhotoIngestReviewScreen() {
  const role = useCurrentRole();
  const orgId = useCurrentOrgId();
  if (role == null) return <SignedOut />;
  if (orgId == null) return <NoOrg />;
  if (role !== 'OWNER' && role !== 'MANAGER') return <ForbiddenForStaff />;
  return <Inner orgId={orgId} actorUserId={role} />;
}

function Inner({
  orgId,
  actorUserId,
}: {
  orgId: string;
  actorUserId: string;
}) {
  const [scope, setScope] = useState<ScopeChip>('mine');
  const queue = useHitlQueue(orgId, { scope });
  const items = useMemo(() => queue.data?.items ?? [], [queue.data]);
  const queueRows = useMemo<ReadonlyArray<HitlQueueRow>>(
    () => items.map(toQueueRow),
    [items],
  );

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Auto-select first row when nothing is picked but the queue has items.
  useEffect(() => {
    if (selectedItemId == null && items.length > 0) {
      setSelectedItemId(items[0]!.itemId);
    }
  }, [items, selectedItemId]);

  const advanceQueue = useCallback(
    (dir: 1 | -1) => {
      if (items.length === 0) return;
      const idx = items.findIndex((i) => i.itemId === selectedItemId);
      const next = idx < 0 ? 0 : (idx + dir + items.length) % items.length;
      setSelectedItemId(items[next]!.itemId);
    },
    [items, selectedItemId],
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div
        className="text-xs uppercase tracking-[0.04em]"
        style={{ color: 'var(--color-mute)' }}
      >
        Revisión humana · ingestión por foto (HITL)
      </div>
      <h1
        className="mt-2 text-3xl font-semibold leading-tight"
        style={{ color: 'var(--color-ink)' }}
      >
        Cola de revisión · {queueRows.length} elementos
      </h1>

      <TransparencyBanner />

      <BulkReviewChips scope={scope} onChange={setScope} />

      <div className="mt-4 grid gap-6 lg:grid-cols-12">
        <aside className="lg:col-span-3">
          <HitlQueueList
            rows={queueRows}
            selectedItemId={selectedItemId}
            onSelect={setSelectedItemId}
          />
        </aside>
        <main className="lg:col-span-9">
          {selectedItemId == null ? (
            <EmptyState />
          ) : (
            <DetailPane
              orgId={orgId}
              actorUserId={actorUserId}
              itemId={selectedItemId}
              onAdvance={() => advanceQueue(1)}
              onPrev={() => advanceQueue(-1)}
            />
          )}
        </main>
      </div>

      <KeyboardHintsBar />
    </div>
  );
}

function BulkReviewChips({
  scope,
  onChange,
}: {
  scope: ScopeChip;
  onChange: (next: ScopeChip) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filtro de revisión"
      className="mt-4 flex flex-wrap gap-2"
    >
      <ScopeChipBtn label="Mis revisiones" selected={scope === 'mine'} onClick={() => onChange('mine')} />
      <ScopeChipBtn label="Todas" selected={scope === 'all'} onClick={() => onChange('all')} />
      <ScopeChipBtn label="Rechazadas" selected={scope === 'rejected'} onClick={() => onChange('rejected')} />
    </div>
  );
}

function ScopeChipBtn({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="rounded-full border px-3 py-1 text-sm"
      style={{
        backgroundColor: selected
          ? 'var(--color-accent-soft)'
          : 'transparent',
        borderColor: selected ? 'var(--color-accent)' : 'var(--color-border)',
        color: selected ? 'var(--color-ink)' : 'var(--color-mute)',
      }}
    >
      {label}
    </button>
  );
}

function DetailPane({
  orgId,
  actorUserId,
  itemId,
  onAdvance,
  onPrev,
}: {
  orgId: string;
  actorUserId: string;
  itemId: string;
  onAdvance: () => void;
  onPrev: () => void;
}) {
  const itemQuery = useIngestionItem(orgId, itemId);
  const sign = useSignIngestion();
  const reclassify = useReclassifyIngestion();

  const key = draftKey(itemId, actorUserId);

  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [draftLoadedAt, setDraftLoadedAt] = useState<number | null>(null);
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SignIngestionResponse | null>(
    null,
  );

  // Hydrate draft + reset on item change.
  useEffect(() => {
    const d = loadDraft(key);
    if (d) {
      setFieldValues(d.fieldValues);
      setDraftLoadedAt(d.savedAt);
    } else {
      setFieldValues({});
      setDraftLoadedAt(null);
    }
    setSubmitted(null);
    setHydratedKey(key);
  }, [key]);

  // Persist on every change (debounce via React batching). Guard against
  // the cross-item leak window: only persist for the key we've actually
  // hydrated for in this render cycle.
  useEffect(() => {
    if (hydratedKey !== key) return;
    if (Object.keys(fieldValues).length === 0) {
      // Nothing to save; keep an existing draft alive.
      return;
    }
    saveDraft(key, {
      fieldValues,
      savedAt: Date.now(),
      v: 1,
    });
  }, [key, hydratedKey, fieldValues]);

  const fields = useMemo<ReadonlyArray<ExtractedField>>(() => {
    const raw = itemQuery.data?.fields ?? [];
    return raw.map((f) => toExtractedField(f, fieldValues[f.fieldName]));
  }, [itemQuery.data, fieldValues]);

  const ctaDisabled = useMemo(() => {
    if (sign.isPending) return true;
    return fields.some(
      (f) => f.confidence < 0.6 && f.operatorValue.trim() === '',
    );
  }, [fields, sign.isPending]);

  const handleFieldChange = useCallback(
    (fieldName: string, value: string) => {
      setFieldValues((prev) => ({ ...prev, [fieldName]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (ctaDisabled || itemQuery.data == null) return;
    try {
      const response = await sign.mutateAsync({
        organizationId: orgId,
        itemId,
        actorUserId,
        fields: fields.map((f) => ({
          fieldName: f.fieldName,
          operatorValue: f.operatorValue,
        })),
      });
      setSubmitted(response);
      clearDraft(key);
    } catch {
      // Error surfaced via sign.error.
    }
  }, [
    ctaDisabled,
    itemQuery.data,
    sign,
    orgId,
    itemId,
    actorUserId,
    fields,
    key,
  ]);

  const handleReclassify = useCallback(async () => {
    if (itemQuery.data == null) return;
    const newKind = itemQuery.data.kind === 'invoice' ? 'product' : 'invoice';
    try {
      await reclassify.mutateAsync({
        organizationId: orgId,
        itemId,
        actorUserId,
        newKind,
      });
    } catch {
      // silent
    }
  }, [itemQuery.data, reclassify, orgId, itemId, actorUserId]);

  // Keyboard shortcuts per ADR-J12-KEYBOARD-SHORTCUTS-FORM-FIRST.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingInsideForm(e.target)) return;
      if (e.key === 'j') {
        e.preventDefault();
        onAdvance();
      } else if (e.key === 'k') {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'Enter') {
        if (!ctaDisabled) {
          e.preventDefault();
          void handleSubmit();
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        void handleReclassify();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAdvance, onPrev, handleSubmit, handleReclassify, ctaDisabled]);

  if (itemQuery.isLoading || !itemQuery.data) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-dashed p-6 text-center text-sm"
        style={{
          color: 'var(--color-mute)',
          borderColor: 'var(--color-border-strong)',
        }}
      >
        Cargando ítem…
      </div>
    );
  }

  if (submitted) {
    return (
      <SuccessStrip
        response={submitted}
        kind={itemQuery.data.kind}
        onAdvance={onAdvance}
        onBackToPanel={() => setSubmitted(null)}
      />
    );
  }

  const item = itemQuery.data;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section aria-label="Visor de foto" className="flex flex-col gap-3">
        <PhotoViewer
          photoUrl={item.photoUrl}
          boundingBoxes={item.boundingBoxes}
          highlightedField={highlightedField}
          onBoxHover={setHighlightedField}
        />
      </section>

      <section aria-label="Campos extraídos" className="flex flex-col gap-3">
        {draftLoadedAt && (
          <p className="text-xs" style={{ color: 'var(--color-mute)' }}>
            Borrador desde hace{' '}
            {Math.max(1, Math.round((Date.now() - draftLoadedAt) / 60_000))} min · ¿continuar?
          </p>
        )}
        <ExtractedFieldList
          fields={fields}
          onFieldChange={handleFieldChange}
          highlightedField={highlightedField}
          onFieldHover={setHighlightedField}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
          <button
            type="button"
            onClick={handleReclassify}
            className="rounded-md border bg-transparent px-3 py-2 text-sm"
            style={{
              color: 'var(--color-mute)',
              borderColor: 'var(--color-border-strong)',
            }}
          >
            cambiar tipo →
          </button>
          <button
            type="button"
            name="firmar"
            onClick={handleSubmit}
            disabled={ctaDisabled}
            className="rounded-md px-6 text-sm font-semibold"
            style={{
              height: '48px',
              backgroundColor: ctaDisabled
                ? 'var(--color-surface-2)'
                : 'var(--color-accent)',
              color: ctaDisabled
                ? 'var(--color-mute)'
                : 'var(--color-accent-fg)',
              border: 'none',
              cursor: ctaDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            {sign.isPending ? 'Firmando…' : 'Firmar ingestión'}
          </button>
        </div>
        <div className="mt-1">
          <AiProvenanceChip
            modelVersion={item.extraction.modelVersion}
            promptVersion={item.extraction.promptVersion}
            overallConfidence={item.extraction.overallConfidence}
            auditLogId={item.extraction.auditLogId ?? '(pendiente)'}
          />
        </div>
        {sign.error && (
          <p
            role="alert"
            className="text-sm"
            style={{ color: 'var(--color-destructive)' }}
          >
            No se pudo firmar la ingestión ({sign.error.status}). Revisa la
            conexión y vuelve a intentar.
          </p>
        )}
      </section>
    </div>
  );
}

function SuccessStrip({
  response,
  kind,
  onAdvance,
  onBackToPanel,
}: {
  response: SignIngestionResponse;
  kind: 'invoice' | 'product';
  onAdvance: () => void;
  onBackToPanel: () => void;
}) {
  const downstreamLabel = kind === 'invoice' ? 'GR draft' : 'Lot';
  const downstreamTarget = kind === 'invoice' ? 'Procurement' : 'Inventory';
  return (
    <section
      role="status"
      aria-live="polite"
      className="rounded-lg border p-6"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-success)',
      }}
    >
      <p style={{ color: 'var(--color-success)', fontWeight: 600 }}>
        ✓ Ingestión firmada · {downstreamLabel} creado ·{' '}
        <span style={{ textDecoration: 'underline' }}>
          ver en {downstreamTarget} →
        </span>
      </p>
      <p className="mt-1 text-sm" style={{ color: 'var(--color-mute)' }}>
        audit_log {response.auditLogId} · aggregate{' '}
        {response.downstreamAggregateId}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAdvance}
          className="rounded-md border bg-transparent px-4 py-2 text-sm"
          style={{
            color: 'var(--color-accent-press)',
            borderColor: 'var(--color-border-strong)',
          }}
        >
          Revisar siguiente
        </button>
        <button
          type="button"
          onClick={onBackToPanel}
          className="rounded-md border bg-transparent px-4 py-2 text-sm"
          style={{
            color: 'var(--color-mute)',
            borderColor: 'var(--color-border-strong)',
          }}
        >
          Volver al panel
        </button>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed p-6 text-center text-sm"
      style={{
        color: 'var(--color-mute)',
        borderColor: 'var(--color-border-strong)',
      }}
    >
      No hay elementos pendientes de revisión. Sube una foto para comenzar.
    </div>
  );
}

function KeyboardHintsBar() {
  return (
    <p className="mt-6 text-xs" style={{ color: 'var(--color-mute)' }}>
      Atajos: <kbd>j</kbd>/<kbd>k</kbd> navegar cola · <kbd>↵</kbd> firmar ·
      <kbd>R</kbd> reclasificar
    </p>
  );
}

function SignedOut() {
  return (
    <div
      role="status"
      className="mx-auto mt-6 max-w-2xl rounded-lg border border-dashed p-6 text-center"
      style={{
        color: 'var(--color-mute)',
        borderColor: 'var(--color-border-strong)',
      }}
    >
      Inicia sesión para revisar la cola de ingestión por foto.
    </div>
  );
}

function NoOrg() {
  return (
    <div
      role="status"
      className="mx-auto mt-6 max-w-2xl rounded-lg border border-dashed p-6 text-center"
      style={{
        color: 'var(--color-mute)',
        borderColor: 'var(--color-border-strong)',
      }}
    >
      No hay organización activa.
    </div>
  );
}

function ForbiddenForStaff() {
  return (
    <div
      role="status"
      className="mx-auto mt-6 max-w-2xl rounded-lg border border-dashed p-6 text-center"
      style={{
        color: 'var(--color-mute)',
        borderColor: 'var(--color-border-strong)',
      }}
    >
      Acceso restringido · solicita aprobación a Owner/Manager →
    </div>
  );
}
