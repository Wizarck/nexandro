import { useMemo, useState } from 'react';
import {
  AddendumComposer,
  DispatchReceiptCard,
  DossierPreview,
  IncidentChronologyRail,
  RecipientList,
  type ChronologyRailEntry,
  type DispatchReceiptRow,
  type RecipientListEntry,
} from '@opentrattos/ui-kit';
import {
  dossierPdfUrl,
} from '../api/recall';
import {
  useAttachAddendum,
  useIncident,
  useRedispatch,
} from '../hooks/useRecallIncident';

export interface RecallDossierJ7ScreenProps {
  organizationId: string;
  incidentId: string;
}

const EVENT_LABELS: Record<string, string> = {
  RECALL_INVESTIGATION_OPENED: 'Investigación iniciada',
  RECALL_86_FLAG_DISPATCHED: 'Servicio detenido (86-flag)',
  RECALL_DOSSIER_GENERATED: 'Dossier despachado',
  RECALL_DOSSIER_REDISPATCHED: 'Dossier reenviado',
  RECALL_ADDENDUM_ATTACHED: 'Adenda adjuntada',
};

export function RecallDossierJ7Screen({
  organizationId,
  incidentId,
}: RecallDossierJ7ScreenProps) {
  const projection = useIncident(organizationId, incidentId);
  const redispatch = useRedispatch(organizationId, incidentId);
  const attach = useAttachAddendum(organizationId, incidentId);
  const [picker, setPicker] = useState<string[]>([]);

  const chronologyEntries: ChronologyRailEntry[] = useMemo(() => {
    if (!projection.data) return [];
    return projection.data.chronology.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      label: EVENT_LABELS[row.eventType] ?? row.eventType,
      createdAt: row.createdAt,
      actor: row.actorUserId,
    }));
  }, [projection.data]);

  const receiptRows: DispatchReceiptRow[] = useMemo(() => {
    if (!projection.data) return [];
    return projection.data.recipientReceipts.map((r) => ({
      address: r.address,
      status: r.status,
      providerMessageId: r.providerMessageId ?? null,
      deliveredAt: r.deliveredAt ?? null,
      attempt: r.attempt,
      errorMessage: r.errorMessage ?? null,
    }));
  }, [projection.data]);

  const recipientListEntries: RecipientListEntry[] = useMemo(() => {
    if (!projection.data) return [];
    return projection.data.incident.recipientList.map((address) => ({
      address,
      lastStatus: projection.data!.recipientReceipts.find(
        (r) => r.address === address,
      )?.status,
    }));
  }, [projection.data]);

  if (!projection.data) {
    return (
      <main className="px-6 py-6">
        <p style={{ color: 'var(--color-mute)' }}>Cargando incidente…</p>
      </main>
    );
  }

  const inc = projection.data.incident;
  const legalLabel =
    projection.data.legalWindowStatus === 'within_deadline'
      ? '✓ Dentro de plazo'
      : projection.data.legalWindowStatus === 'over_deadline'
        ? '⚠ Fuera de plazo'
        : 'Plazo legal pendiente';

  const onRedispatchConfirm = (): void => {
    if (picker.length === 0) return;
    void redispatch.mutateAsync({ recipientList: picker });
  };

  const onAddendumSubmit = async (input: {
    text: string;
    attachments: { file: File }[];
  }): Promise<void> => {
    const attachments = await Promise.all(
      input.attachments.map(async (a) => {
        const buf = await a.file.arrayBuffer();
        const b64 = bufferToBase64(buf);
        return {
          filename: a.file.name,
          contentType: a.file.type || 'application/octet-stream',
          contentBase64: b64,
        };
      }),
    );
    await attach.mutateAsync({ text: input.text, attachments });
  };

  return (
    <main className="grid gap-6 px-6 py-6 lg:grid-cols-[1fr_22rem]">
      <section className="space-y-6">
        <header>
          <p
            className="text-xs tracking-[0.04em]"
            style={{ color: 'var(--color-mute)' }}
          >
            Incidente {inc.incidentCode} · despachado · {legalLabel}
          </p>
        </header>

        <DispatchReceiptCard rows={receiptRows} />

        <DossierPreview
          pdfUrl={dossierPdfUrl(organizationId, incidentId)}
          incidentCode={inc.incidentCode}
          dispatchedAt={projection.data.dossierMeta.generatedAt ?? inc.openedAt}
        />

        <RecipientList
          entries={recipientListEntries}
          selected={picker}
          onChange={setPicker}
          confirmButton={{
            label: 'Reenviar a seleccionados',
            onClick: onRedispatchConfirm,
            disabled: redispatch.isPending,
          }}
        />

        <AddendumComposer
          onSubmit={(input) => {
            void onAddendumSubmit(input);
          }}
          busy={attach.isPending}
        />
      </section>

      <IncidentChronologyRail entries={chronologyEntries} />
    </main>
  );
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  // apps/web runs only in the browser — `btoa` is the canonical base64
  // encoder. SSR is not a deployment target for this surface.
  return btoa(binary);
}
