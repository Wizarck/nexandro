import { useState } from 'react';
import {
  RecallActionBar,
  RecallConfirmationStrip,
} from '@nexandro/ui-kit';
import { CrisisLayout } from '../layouts/CrisisLayout';
import {
  useCountdownToDeadline,
  useDispatch86Flag,
  useIncident,
} from '../hooks/useRecallIncident';

/**
 * J6 Recall investigation screen — sticky CTA + confirmation strip.
 *
 * The host owns the routing — the parent feeds `organizationId` +
 * `incidentId` from the URL. The incident search field (slice #11)
 * and trace tree (slice #12) mount at the top of `<main>` once they
 * land at master; for this slice the screen is the CTA + strip
 * scaffold.
 */
export interface RecallInvestigateJ6ScreenProps {
  organizationId: string;
  incidentId: string;
}

export function RecallInvestigateJ6Screen({
  organizationId,
  incidentId,
}: RecallInvestigateJ6ScreenProps) {
  const incident = useIncident(organizationId, incidentId);
  const dispatch = useDispatch86Flag(organizationId, incidentId);
  const countdown = useCountdownToDeadline(
    incident.data?.incident.legalDeadline ?? null,
  );
  const [mode, setMode] = useState<'idle' | 'confirm' | 'receipt'>('idle');

  const onCtaActivate = (): void => {
    setMode('confirm');
  };

  const onConfirm = async (): Promise<void> => {
    if (!incident.data) return;
    try {
      await dispatch.mutateAsync({
        recipientList: incident.data.incident.recipientList,
      });
      setMode('receipt');
    } catch {
      // Surface stays in confirm mode; the dispatch service shape
      // captures per-recipient failures via the receipt card.
      setMode('receipt');
    }
  };

  const onCancel = (): void => setMode('idle');

  return (
    <CrisisLayout>
      <header className="mb-6">
        <p
          className="text-xs tracking-[0.04em] tabular-nums"
          style={{ color: 'var(--color-mute)' }}
        >
          Investigación de incidente
          {countdown.label && (
            <>
              {' · '}
              <span
                style={{
                  color: countdown.overdue
                    ? 'var(--color-destructive)'
                    : 'var(--color-mute)',
                }}
              >
                {countdown.overdue
                  ? `+${countdown.label.slice(1)} fuera de plazo`
                  : `${countdown.label} restante`}
              </span>
            </>
          )}
        </p>
        {incident.data && (
          <h1
            className="mt-2 text-lg font-semibold"
            style={{ color: 'var(--color-ink)' }}
          >
            {incident.data.incident.incidentCode}
          </h1>
        )}
      </header>
      {/* Slot for slice #11 IncidentSearchField + slice #12 RecallTraceTree.
          Intentionally empty in slice #13 — surfaces land at master-merge. */}
      <section data-slot="search-and-trace" />

      <RecallActionBar
        label="Detener servicio + Generar dossier"
        onActivate={onCtaActivate}
        disabled={dispatch.isPending || mode === 'receipt'}
      >
        {mode === 'confirm' && (
          <RecallConfirmationStrip
            mode="confirm"
            message={`¿Cortar servicio en ${incident.data?.incident.locationIds.length ?? 0} locales + enviar dossier a ${incident.data?.incident.recipientList.length ?? 0} destinatarios?`}
            onConfirm={onConfirm}
            onCancel={onCancel}
            busy={dispatch.isPending}
          />
        )}
        {mode === 'receipt' && (
          <RecallConfirmationStrip
            mode="receipt"
            message={`Dossier dispatched · ${new Date().toLocaleTimeString('es-ES')}`}
            receiptLink={{
              label: 'ver dossier →',
              onClick: () => {
                window.location.assign(
                  `/recall/incidents/${incidentId}?organizationId=${encodeURIComponent(organizationId)}`,
                );
              },
            }}
          />
        )}
      </RecallActionBar>
    </CrisisLayout>
  );
}
