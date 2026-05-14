import { api } from './client';

export type IncidentSearchKind =
  | 'lot'
  | 'supplier'
  | 'ingredient'
  | 'aggregate';

export interface IncidentSearchHit {
  kind: IncidentSearchKind;
  id: string;
  label: string;
  supportingText: string;
  receivedAt: string | null;
  symptomMatchScore: number;
}

export interface IncidentSearchResponse {
  hits: IncidentSearchHit[];
}

export interface IncidentSearchParams {
  organizationId: string;
  query: string;
  types?: readonly IncidentSearchKind[];
  limit?: number;
}

function buildQuery(params: IncidentSearchParams): string {
  const search = new URLSearchParams();
  search.set('organizationId', params.organizationId);
  search.set('q', params.query);
  if (params.types && params.types.length > 0) {
    search.set('types', params.types.join(','));
  }
  if (typeof params.limit === 'number') {
    search.set('limit', String(params.limit));
  }
  return search.toString();
}

export async function getRecallSearch(
  params: IncidentSearchParams,
): Promise<IncidentSearchResponse> {
  return api<IncidentSearchResponse>(`/m3/recall/search?${buildQuery(params)}`);
}

export interface IncidentResponse {
  incidentId: string;
  incidentCode: string;
  legalDeadline: string;
  status: 'open' | 'dispatched' | 'closed';
}

export interface IncidentProjectionResponse {
  incident: {
    id: string;
    organizationId: string;
    incidentCode: string;
    openedAt: string;
    openedByUserId: string | null;
    legalDeadline: string;
    status: 'open' | 'dispatched' | 'closed';
    lotIds: string[];
    locationIds: string[];
    recipientList: string[];
    dossierHash: string | null;
  };
  chronology: Array<{
    id: string;
    eventType: string;
    actorUserId: string | null;
    actorKind: 'user' | 'agent' | 'system';
    createdAt: string;
    payloadAfter: unknown;
    reason: string | null;
  }>;
  recipientReceipts: Array<{
    address: string;
    status: 'pending' | 'delivered' | 'retrying' | 'failed';
    providerMessageId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    attempt: number;
    deliveredAt: string | null;
  }>;
  addenda: Array<{
    id: string;
    attachedByUserId: string | null;
    attachedAt: string;
    text: string;
    attachmentMetadata: Array<{
      filename: string;
      contentType: string;
      byteSize: number;
    }>;
  }>;
  legalWindowStatus: 'within_deadline' | 'over_deadline' | 'pending';
  dossierMeta: {
    generatedAt: string | null;
    chainBroken: boolean;
    firstBrokenRowId: string | null;
  };
}

export interface DispatchOutcomeResponse {
  dispatchedAt: string;
  incidentStatus: 'dispatched';
  recipientReceipts: IncidentProjectionResponse['recipientReceipts'];
  dossierError?: { code: string; message: string };
}

export async function openIncident(input: {
  organizationId: string;
  lotIds: string[];
  locationIds: string[];
  recipientList: string[];
  reason?: string;
}): Promise<IncidentResponse> {
  return api<IncidentResponse>(`/m3/recall/incidents`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getIncident(
  organizationId: string,
  incidentId: string,
): Promise<IncidentProjectionResponse> {
  const qs = new URLSearchParams({ organizationId }).toString();
  return api<IncidentProjectionResponse>(
    `/m3/recall/incidents/${incidentId}?${qs}`,
  );
}

export async function dispatchIncident(
  incidentId: string,
  input: {
    organizationId: string;
    recipientList: string[];
    lotIds?: string[];
    locationIds?: string[];
    subject?: string;
    bodyText?: string;
  },
): Promise<DispatchOutcomeResponse> {
  return api<DispatchOutcomeResponse>(
    `/m3/recall/incidents/${incidentId}/dispatch`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function redispatchIncident(
  incidentId: string,
  input: { organizationId: string; recipientList: string[] },
): Promise<DispatchOutcomeResponse> {
  return api<DispatchOutcomeResponse>(
    `/m3/recall/incidents/${incidentId}/redispatch`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function attachAddendum(
  incidentId: string,
  input: {
    organizationId: string;
    text: string;
    attachments?: Array<{
      filename: string;
      contentType: string;
      contentBase64: string;
    }>;
  },
): Promise<{ addendumId: string; attachedAt: string }> {
  return api<{ addendumId: string; attachedAt: string }>(
    `/m3/recall/incidents/${incidentId}/addenda`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function dossierPdfUrl(
  organizationId: string,
  incidentId: string,
): string {
  const qs = new URLSearchParams({ organizationId }).toString();
  return `/api/m3/recall/incidents/${incidentId}/dossier.pdf?${qs}`;
}
