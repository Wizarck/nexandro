export type TraceNodeKind = 'lot' | 'recipe' | 'menu-item' | 'service-window';

export type ReverseAnchorKind = 'symptom' | 'menu-item' | 'recipe';

export interface ReverseAnchor {
  id: string;
  kind: ReverseAnchorKind;
}

export interface TraceNode {
  id: string;
  kind: TraceNodeKind;
  label: string;
  quantityBadge?: string;
  children: TraceNode[];
  depthExceeded?: boolean;
}

export interface TraceOptions {
  maxDepth?: number;
}

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

export interface IncidentSearchOpts {
  types?: readonly IncidentSearchKind[];
  limit?: number;
}

export const INCIDENT_SEARCH_DEFAULT_LIMIT = 8 as const;

export const INCIDENT_SEARCH_MAX_LIMIT = 8 as const;

export const ALL_INCIDENT_SEARCH_KINDS: readonly IncidentSearchKind[] = [
  'lot',
  'supplier',
  'ingredient',
  'aggregate',
];

export interface ChronologyEntry {
  readonly id: string;
  readonly eventType: string;
  readonly actorUserId: string | null;
  readonly actorKind: 'user' | 'agent' | 'system';
  readonly createdAt: string;
  readonly payloadAfter: unknown;
  readonly reason: string | null;
}

export interface DispatchRecipient {
  readonly address: string;
  readonly status: 'pending' | 'delivered' | 'retrying' | 'failed';
  readonly providerMessageId?: string | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly attempt: number;
  readonly deliveredAt?: string | null;
}

export interface IncidentAddendum {
  readonly id: string;
  readonly attachedByUserId: string | null;
  readonly attachedAt: string;
  readonly text: string;
  readonly attachmentMetadata: ReadonlyArray<{
    readonly filename: string;
    readonly contentType: string;
    readonly byteSize: number;
  }>;
}
