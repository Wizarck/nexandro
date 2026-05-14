/**
 * Recall dossier shapes per ADR-028 (architecture-m3.md) — consumed by
 * apps/api `DossierService` via `renderRecallDossierToPdf`.
 *
 * These types intentionally re-state the data the renderer needs
 * (rather than importing apps/api domain types) so the package stays
 * a pure peer of `apps/api/src/recall/` without creating a cycle.
 */

export interface RecallDossierTraceNode {
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly label: string;
  readonly children: ReadonlyArray<RecallDossierTraceNode>;
  readonly quantityConsumed?: number | null;
  readonly serviceWindow?: string | null;
  readonly depthExceeded?: boolean;
}

export interface RecallDossierChronologyEntry {
  readonly id: string;
  readonly eventType: string;
  readonly actorUserId: string | null;
  readonly actorKind: string;
  readonly createdAt: string;
  readonly payloadAfter: unknown;
  readonly reason: string | null;
}

export interface RecallDossierSignatureBlock {
  readonly actorUserName: string | null;
  readonly generatedAt: string;
  readonly dossierHash: string;
  readonly chainBroken: boolean;
  readonly firstBrokenRowId: string | null;
}

export interface RecallDossierData {
  readonly incidentCode: string;
  readonly openedAt: string;
  readonly legalDeadline: string;
  readonly chronology: ReadonlyArray<RecallDossierChronologyEntry>;
  readonly lotProvenance: RecallDossierTraceNode | null;
  readonly consumptionChain: RecallDossierTraceNode | null;
  readonly signatureBlock: RecallDossierSignatureBlock;
}
