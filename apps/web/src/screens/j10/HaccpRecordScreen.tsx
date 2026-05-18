import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CcpPicker,
  CorrectiveActionPicker,
  OutOfSpecStickyWarning,
  ReadingInput,
  RecentReadingsStrip,
  RoleGuard,
  SpecRangeReadback,
  type Ccp,
  type RecentReadingRow,
} from '@nexandro/ui-kit';
import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';
import {
  useCcps,
  useCorrectiveActions,
  useLastOutOfSpecUnresolved,
  useRecentReadings,
  useRecordReading,
} from '../../hooks/useHaccp';
import type {
  CcpReading,
  CcpSummary,
  CorrectiveAction,
} from '../../api/haccp';

/**
 * j10 HACCP CCP reading capture screen (slice #10 m3-haccp-ui).
 *
 * Composes the 6 ui-kit components into the kitchen-tablet capture
 * flow described in `docs/ux/j10.md`. State machine: pick CCP → enter
 * reading (live readback) → conditional corrective-action mount →
 * sign. Draft persists locally for 10 minutes per
 * (orgId, ccpId, actorUserId) per ADR-J10-DRAFT-PERSISTENCE-
 * LOCALSTORAGE.
 *
 * Per j10.md "no RBAC-differentiated UX for the basic act of
 * logging", the surface is available to all signed-in roles.
 */
export function HaccpRecordScreen() {
  const role = useCurrentRole();
  const orgId = useCurrentOrgId();
  if (role == null) return <SignedOut />;
  if (orgId == null) return <NoOrg />;
  return <Inner orgId={orgId} actorUserId={role} role={role} />;
}

const DRAFT_TTL_MS = 10 * 60_000;
const DRAFT_KEY_PREFIX = 'nexandro.haccp.draft.v1';

interface DraftV1 {
  value: string;
  notes?: string;
  correctiveActionId?: string;
  savedAt: number;
  v: 1;
}

function draftKey(orgId: string, ccpId: string, actorUserId: string): string {
  return `${DRAFT_KEY_PREFIX}.${orgId}.${ccpId}.${actorUserId}`;
}

function loadDraft(key: string): DraftV1 | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed != null &&
      (parsed as DraftV1).v === 1 &&
      typeof (parsed as DraftV1).savedAt === 'number' &&
      typeof (parsed as DraftV1).value === 'string'
    ) {
      const d = parsed as DraftV1;
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

function saveDraft(key: string, draft: DraftV1): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Quota / disabled — silent.
  }
}

function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // silent.
  }
}

function toComponentCcp(summary: CcpSummary): Ccp {
  return {
    id: summary.id,
    name: summary.name,
    fsmsRef: summary.fsmsRef,
    inputType: summary.inputType,
    spec: summary.spec,
    lastReading: summary.lastReading,
    dueBy: summary.dueBy,
  };
}

function toRecentRow(reading: CcpReading): RecentReadingRow {
  const display = reading.unit
    ? `${reading.value} ${reading.unit}`
    : reading.value;
  return {
    id: reading.id,
    display,
    recordedAt: reading.recordedAt,
    actor: reading.actorUserId ?? undefined,
    inSpec: reading.inSpec,
  };
}

function Inner({
  orgId,
  actorUserId,
  role,
}: {
  orgId: string;
  actorUserId: string;
  role: string | null;
}) {
  const ccpsQuery = useCcps(orgId);
  const ccpSummaries = useMemo(
    () => ccpsQuery.data ?? [],
    [ccpsQuery.data],
  );
  const ccps: Ccp[] = useMemo(
    () => ccpSummaries.map(toComponentCcp),
    [ccpSummaries],
  );

  const [selectedCcpId, setSelectedCcpId] = useState<string | null>(null);
  const selectedSummary = useMemo(
    () => ccpSummaries.find((c) => c.id === selectedCcpId) ?? null,
    [ccpSummaries, selectedCcpId],
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div
            className="text-xs uppercase tracking-[0.04em]"
            style={{ color: 'var(--color-mute)' }}
          >
            HACCP · Lectura de PCC
          </div>
          <h1
            className="mt-2 text-3xl font-semibold leading-tight"
            style={{ color: 'var(--color-ink)' }}
          >
            {selectedSummary?.name ?? 'Registrar lectura HACCP'}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-mute)' }}>
            {selectedSummary
              ? `referencia ${selectedSummary.fsmsRef}`
              : 'Elige un PCC para empezar a registrar la lectura.'}
          </p>
        </div>
        {/* Audit 2026-05-18 L1-5 follow-up: surface the APPCC bundle generator
            from HACCP. Iker's reflex when the inspector knocks is HACCP, not
            "/compliance/export". This shortcut closes the discoverability gap
            while the dedicated nav tab also exists. Owner+Manager only. */}
        <RoleGuard role={['OWNER', 'MANAGER']} currentRole={role as 'OWNER' | 'MANAGER' | 'STAFF' | null}>
          <Link
            to="/compliance/export"
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            style={{
              borderColor: 'var(--color-border-strong)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
            }}
          >
            <span aria-hidden="true">📄</span>
            Generar expediente APPCC
          </Link>
        </RoleGuard>
      </div>

      {/* Daily progress strip per j10.md §9 + audit L1-3: gives the Head
          Chef + Inspector the at-a-glance state ("¿estamos al día?") and
          gives Carmen pressure to log overdue rows. Hidden when a CCP is
          selected — focus shifts to the recording form below. */}
      {!selectedCcpId && <DailyProgressStrip ccps={ccpSummaries} />}

      <CcpPicker
        ccps={ccps}
        selectedId={selectedCcpId}
        onSelect={setSelectedCcpId}
      />

      {selectedCcpId && selectedSummary && (
        <RecordingPanel
          orgId={orgId}
          actorUserId={actorUserId}
          ccp={selectedSummary}
        />
      )}
    </div>
  );
}

function RecordingPanel({
  orgId,
  actorUserId,
  ccp,
}: {
  orgId: string;
  actorUserId: string;
  ccp: CcpSummary;
}) {
  const key = draftKey(orgId, ccp.id, actorUserId);

  const [value, setValue] = useState<string>('');
  const [correctiveActionId, setCorrectiveActionId] = useState<string | null>(
    null,
  );
  const [notes, setNotes] = useState<string>('');
  const [draftLoadedAt, setDraftLoadedAt] = useState<number | null>(null);
  const [submittedReading, setSubmittedReading] = useState<CcpReading | null>(
    null,
  );

  // Hydrate draft on mount / when CCP changes.
  useEffect(() => {
    const d = loadDraft(key);
    if (d) {
      setValue(d.value);
      setCorrectiveActionId(d.correctiveActionId ?? null);
      setNotes(d.notes ?? '');
      setDraftLoadedAt(d.savedAt);
    } else {
      setValue('');
      setCorrectiveActionId(null);
      setNotes('');
      setDraftLoadedAt(null);
    }
    setSubmittedReading(null);
  }, [key]);

  // Persist on every change (idle and active values both keep the draft alive).
  useEffect(() => {
    if (value === '' && !correctiveActionId && notes === '') {
      clearDraft(key);
      return;
    }
    saveDraft(key, {
      value,
      correctiveActionId: correctiveActionId ?? undefined,
      notes: notes || undefined,
      savedAt: Date.now(),
      v: 1,
    });
  }, [key, value, correctiveActionId, notes]);

  const recent = useRecentReadings(orgId, ccp.id);
  const prior = useLastOutOfSpecUnresolved(orgId, ccp.id);
  const correctives = useCorrectiveActions(orgId, ccp.id);
  const submit = useRecordReading();

  const specMin = ccp.spec?.min ?? null;
  const specMax = ccp.spec?.max ?? null;
  const unit = ccp.spec?.unit ?? '';

  const status: 'idle' | 'in-spec' | 'out-of-spec' = useMemo(() => {
    if (specMin == null || specMax == null) return 'idle';
    const raw = value.trim();
    if (raw === '') return 'idle';
    const n = Number(raw);
    if (Number.isNaN(n)) return 'idle';
    if (n < specMin || n > specMax) return 'out-of-spec';
    return 'in-spec';
  }, [value, specMin, specMax]);

  const ctaDisabled =
    submit.isPending ||
    value.trim() === '' ||
    (status === 'out-of-spec' && correctiveActionId == null);

  const handleSubmit = async () => {
    if (ctaDisabled) return;
    try {
      const response = await submit.mutateAsync({
        organizationId: orgId,
        ccpId: ccp.id,
        actorUserId,
        value,
        unit: unit || undefined,
        correctiveActionId: correctiveActionId ?? undefined,
        correctiveNotes: notes || undefined,
        fsmsStandardVersion: ccp.fsmsRef,
      });
      setSubmittedReading(response.reading);
      clearDraft(key);
    } catch {
      // Error surfaced via submit.error; the form stays mounted.
    }
  };

  const correctiveOptions: ReadonlyArray<{ id: string; label: string }> =
    correctives.data?.actions.map((a: CorrectiveAction) => ({
      id: a.id,
      label: a.label,
    })) ?? [];

  if (submittedReading) {
    return (
      <ConfirmationStrip
        reading={submittedReading}
        actorUserId={actorUserId}
        onAnother={() => setSubmittedReading(null)}
      />
    );
  }

  return (
    <>
      {prior.data?.unresolved && <OutOfSpecStickyWarning />}

      <section
        className="mt-6 rounded-lg border p-6"
        style={{
          backgroundColor: 'var(--color-bg)',
          borderColor: 'var(--color-border)',
        }}
        aria-label="Lectura HACCP"
      >
        <label
          className="block text-sm font-medium"
          style={{ color: 'var(--color-mute)' }}
          htmlFor="haccp-reading-value"
        >
          Lectura
        </label>

        {ccp.inputType === 'numeric' && (
          <>
            <div className="mt-2">
              <ReadingInput
                inputType="numeric"
                id="haccp-reading-value"
                value={value}
                onChange={setValue}
                unit={unit}
                placeholder={
                  specMin != null && specMax != null
                    ? `${specMin} a ${specMax}`
                    : undefined
                }
                aria-label="Valor de la lectura"
              />
            </div>
            {specMin != null && specMax != null && (
              <SpecRangeReadback
                specMin={specMin}
                specMax={specMax}
                currentValue={value}
                unit={unit}
              />
            )}
          </>
        )}

        {ccp.inputType === 'checkbox' && (
          <div className="mt-2">
            <ReadingInput
              inputType="checkbox"
              value={value === 'true'}
              onChange={(b) => setValue(b ? 'true' : 'false')}
              aria-label="Inspección visual"
            />
          </div>
        )}

        {ccp.inputType === 'multi-select' && (
          <div className="mt-2">
            <ReadingInput
              inputType="multi-select"
              value={value === '' ? [] : value.split(',').filter(Boolean)}
              options={[]}
              onChange={(arr) => setValue(arr.join(','))}
              aria-label="Selección múltiple"
            />
          </div>
        )}

        {status === 'out-of-spec' && (
          <CorrectiveActionPicker
            actions={correctiveOptions}
            selectedActionId={correctiveActionId}
            onSelectAction={setCorrectiveActionId}
            notes={notes}
            onChangeNotes={setNotes}
          />
        )}

        {draftLoadedAt && (
          <p
            className="mt-3 text-xs"
            style={{ color: 'var(--color-mute)' }}
          >
            Borrador desde hace {Math.max(1, Math.round((Date.now() - draftLoadedAt) / 60_000))} min · ¿continuar?
          </p>
        )}

        <div
          className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button
            type="button"
            onClick={() => {
              setValue('');
              setCorrectiveActionId(null);
              setNotes('');
              clearDraft(key);
            }}
            className="rounded-md border bg-transparent px-4 text-sm"
            style={{
              height: '56px',
              color: 'var(--color-mute)',
              borderColor: 'var(--color-border-strong)',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            name="firmar"
            onClick={handleSubmit}
            disabled={ctaDisabled}
            className="rounded-md px-6 text-lg font-semibold"
            style={{
              height: '64px',
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
            {submit.isPending ? 'Firmando…' : 'Firmar lectura'}
          </button>
        </div>

        {submit.error && (
          <p
            role="alert"
            className="mt-3 text-sm"
            style={{ color: 'var(--color-destructive)' }}
          >
            No se pudo firmar la lectura ({submit.error.status}). Revisa la conexión y vuelve a intentar.
          </p>
        )}
      </section>

      <div className="mt-6">
        <RecentReadingsStrip
          readings={(recent.data?.readings ?? []).map(toRecentRow)}
        />
      </div>
    </>
  );
}

function ConfirmationStrip({
  reading,
  actorUserId,
  onAnother,
}: {
  reading: CcpReading;
  actorUserId: string;
  onAnother: () => void;
}) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="mt-6 rounded-lg border p-6 text-center"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-success)',
      }}
    >
      <p style={{ color: 'var(--color-success)', fontWeight: 600 }}>
        ✓ Lectura firmada
      </p>
      <p
        className="mt-1 text-sm"
        style={{ color: 'var(--color-mute)' }}
      >
        audit_log {reading.auditLogId ?? '(pendiente)'} · firma {actorUserId}
      </p>
      <button
        type="button"
        onClick={onAnother}
        className="mt-4 rounded-md border bg-transparent px-4 text-sm"
        style={{
          height: '48px',
          color: 'var(--color-accent-press)',
          borderColor: 'var(--color-border-strong)',
        }}
      >
        Registrar otra lectura
      </button>
    </section>
  );
}

function DailyProgressStrip({ ccps }: { ccps: ReadonlyArray<CcpSummary> }) {
  const now = Date.now();
  const total = ccps.length;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  // Logged today: lastReading.recordedAt falls on today.
  let loggedToday = 0;
  let overdue = 0;
  let neverLogged = 0;
  for (const c of ccps) {
    if (c.lastReading?.recordedAt) {
      const ms = Date.parse(c.lastReading.recordedAt);
      if (!Number.isNaN(ms) && ms >= todayStartMs) loggedToday++;
    } else {
      neverLogged++;
    }
    if (c.dueBy && Date.parse(c.dueBy) < now) overdue++;
  }
  const hasIssue = overdue > 0 || neverLogged > 0;

  if (total === 0) return null;

  return (
    <section
      role="status"
      aria-label="Resumen del día"
      className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-4 py-3 text-sm"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: hasIssue ? 'var(--color-destructive)' : 'var(--color-border)',
        borderLeftWidth: '3px',
        color: 'var(--color-ink)',
      }}
    >
      <span>
        <strong className="tabular-nums">{loggedToday} / {total}</strong>{' '}
        <span style={{ color: 'var(--color-mute)' }}>lecturas hoy</span>
      </span>
      {overdue > 0 && (
        <span style={{ color: 'var(--color-destructive)' }}>
          · <strong className="tabular-nums">{overdue}</strong> vencidas
        </span>
      )}
      {neverLogged > 0 && (
        <span style={{ color: 'var(--color-mute)' }}>
          · <strong className="tabular-nums">{neverLogged}</strong> sin lectura
        </span>
      )}
    </section>
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
      Inicia sesión para registrar una lectura HACCP.
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
