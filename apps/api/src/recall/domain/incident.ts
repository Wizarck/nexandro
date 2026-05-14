import type { ChronologyEntry, DispatchRecipient, IncidentAddendum } from '../types';

/**
 * Per ADR-RECALL-INCIDENT-VIA-AUDIT-LOG, `Incident` is NOT a TypeORM
 * entity — it is a projection over `audit_log` rows that share the same
 * `aggregate_id` and `aggregate_type='recall_incident'`. Status is
 * derived from the envelope sequence.
 */
export type IncidentStatus = 'open' | 'dispatched' | 'closed';

export type LegalWindowStatus = 'within_deadline' | 'over_deadline' | 'pending';

export interface Incident {
  readonly id: string;
  readonly organizationId: string;
  readonly incidentCode: string;
  readonly openedAt: string;
  readonly openedByUserId: string | null;
  readonly legalDeadline: string;
  readonly status: IncidentStatus;
  readonly lotIds: ReadonlyArray<string>;
  readonly locationIds: ReadonlyArray<string>;
  readonly recipientList: ReadonlyArray<string>;
  readonly dossierHash?: string | null;
}

/**
 * Full payload returned by `GET /m3/recall/incidents/:id` — projects every
 * audit_log envelope for the incident into J7-friendly shapes.
 */
export interface IncidentProjection {
  readonly incident: Incident;
  readonly chronology: ReadonlyArray<ChronologyEntry>;
  readonly recipientReceipts: ReadonlyArray<DispatchRecipient>;
  readonly addenda: ReadonlyArray<IncidentAddendum>;
  readonly legalWindowStatus: LegalWindowStatus;
  readonly dossierMeta: {
    readonly generatedAt: string | null;
    readonly chainBroken: boolean;
    readonly firstBrokenRowId: string | null;
  };
}

/**
 * Payload returned by `POST /m3/recall/incidents/:id/dispatch` — the j6
 * sticky CTA receipt. `recipientReceipts` carries one row per recipient
 * in `recipientList`; `dossierError` is set when the dossier PDF could
 * NOT render (the 86-flag is still dispatched per AC-RECALL-2).
 */
export interface DispatchResult {
  readonly dispatchedAt: string;
  readonly incidentStatus: IncidentStatus;
  readonly recipientReceipts: ReadonlyArray<DispatchRecipient>;
  readonly dossierError?: {
    readonly code: string;
    readonly message: string;
  };
  readonly missingRecipientsWarning?: string;
}

/**
 * Shape of `payload_after` on `RECALL_INVESTIGATION_OPENED` envelopes.
 * Captures the parameters of the call so the chronology stays
 * reconstructable from `audit_log` alone (single source of truth).
 */
export interface IncidentOpenedPayload {
  readonly incidentCode: string;
  readonly lotIds: ReadonlyArray<string>;
  readonly locationIds: ReadonlyArray<string>;
  readonly legalDeadline: string;
  readonly openedAt: string;
}

export interface FlagDispatchedPayload {
  readonly lotIds: ReadonlyArray<string>;
  readonly locationIds: ReadonlyArray<string>;
  readonly dispatchedAt: string;
}

export interface DossierGeneratedPayload {
  readonly recipient: string;
  readonly deliveryStatus: 'delivered' | 'failed' | 'pending' | 'retrying';
  readonly providerMessageId?: string | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly attempt: number;
  readonly dossierHash: string;
  readonly chainBroken: boolean;
  readonly firstBrokenRowId?: string | null;
}

export interface DossierRedispatchedPayload extends DossierGeneratedPayload {
  readonly originalDispatchedAt: string;
}

export interface AddendumAttachedPayload {
  readonly addendumId: string;
  readonly text: string;
  readonly attachmentMetadata: ReadonlyArray<{
    readonly filename: string;
    readonly contentType: string;
    readonly byteSize: number;
  }>;
  readonly attachedAt: string;
}
