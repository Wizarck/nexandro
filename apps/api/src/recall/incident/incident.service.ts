import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditLogService } from '../../audit-log/application/audit-log.service';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import { safeAuditEmit } from '../../shared/audit-emit/safe-audit-emit';
import {
  RECALL_ADDENDUM_ATTACHMENT_MAX_BYTES,
  RECALL_ADDENDUM_TEXT_MAX,
  RECALL_INCIDENT_AGGREGATE_TYPE,
  RECALL_LEGAL_DEADLINE_HOURS,
} from '../domain/constants';
import type {
  AddendumAttachedPayload,
  DossierGeneratedPayload,
  DossierRedispatchedPayload,
  Incident,
  IncidentOpenedPayload,
  IncidentProjection,
  IncidentStatus,
  LegalWindowStatus,
} from '../domain/incident';
import type {
  ChronologyEntry,
  DispatchRecipient,
  IncidentAddendum,
} from '../types';
import { IncidentCodeGenerator } from './incident-code-generator';

export interface OpenIncidentInput {
  readonly organizationId: string;
  readonly openedByUserId: string | null;
  readonly lotIds: ReadonlyArray<string>;
  readonly locationIds: ReadonlyArray<string>;
  readonly recipientList: ReadonlyArray<string>;
  readonly reason?: string;
}

export interface AttachAddendumInput {
  readonly organizationId: string;
  readonly incidentId: string;
  readonly attachedByUserId: string | null;
  readonly text: string;
  readonly attachments?: ReadonlyArray<{
    readonly filename: string;
    readonly contentType: string;
    readonly contentBase64: string;
  }>;
}

export class AddendumValidationError extends Error {
  constructor(
    readonly code:
      | 'ADDENDUM_TEXT_TOO_LONG'
      | 'ADDENDUM_ATTACHMENT_TOO_LARGE'
      | 'ADDENDUM_ATTACHMENT_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'AddendumValidationError';
  }
}

/**
 * IncidentService — coordinator for the recall incident lifecycle.
 *
 * Per ADR-RECALL-INCIDENT-VIA-AUDIT-LOG: every mutation is an event
 * emission, never a table UPDATE. Reads project over `audit_log` filtered
 * by `aggregate_id` + `aggregate_type='recall_incident'`.
 */
@Injectable()
export class IncidentService {
  private readonly logger = new Logger(IncidentService.name);

  constructor(
    private readonly auditLog: AuditLogService,
    private readonly codeGenerator: IncidentCodeGenerator,
    private readonly events: EventEmitter2,
  ) {}

  async openIncident(input: OpenIncidentInput): Promise<Incident> {
    const now = new Date();
    const incidentId = randomUUID();
    const incidentCode = await this.codeGenerator.nextCode(
      input.organizationId,
      now,
    );
    const legalDeadline = new Date(
      now.getTime() + RECALL_LEGAL_DEADLINE_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const openedAt = now.toISOString();

    const payloadAfter: IncidentOpenedPayload = {
      incidentCode,
      lotIds: [...input.lotIds],
      locationIds: [...input.locationIds],
      legalDeadline,
      openedAt,
    };

    const envelope: AuditEventEnvelope<null, IncidentOpenedPayload> = {
      organizationId: input.organizationId,
      aggregateType: RECALL_INCIDENT_AGGREGATE_TYPE,
      aggregateId: incidentId,
      actorUserId: input.openedByUserId,
      actorKind: 'user',
      payloadBefore: null,
      payloadAfter,
      reason: input.reason,
    };

    // `emitAsync` so subscribers complete inline; per INT spec gotcha
    // (project memory: emitAsync for read-after-write across the bus).
    await safeAuditEmit(
      this.events,
      AuditEventType.RECALL_INVESTIGATION_OPENED,
      envelope,
      this.logger,
    );

    return {
      id: incidentId,
      organizationId: input.organizationId,
      incidentCode,
      openedAt,
      openedByUserId: input.openedByUserId,
      legalDeadline,
      status: 'open',
      lotIds: [...input.lotIds],
      locationIds: [...input.locationIds],
      recipientList: [...input.recipientList],
    };
  }

  async getIncident(
    organizationId: string,
    incidentId: string,
  ): Promise<IncidentProjection> {
    const page = await this.auditLog.query({
      organizationId,
      aggregateType: RECALL_INCIDENT_AGGREGATE_TYPE,
      aggregateId: incidentId,
      limit: 200,
      offset: 0,
    });
    if (page.rows.length === 0) {
      throw new NotFoundException(
        `Incident ${incidentId} not found for org ${organizationId}`,
      );
    }
    // The service ordered DESC; project oldest-first for chronology.
    const ordered = [...page.rows].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const opened = ordered.find(
      (row) => row.eventType === 'RECALL_INVESTIGATION_OPENED',
    );
    if (!opened) {
      throw new NotFoundException(
        `Incident ${incidentId} has no RECALL_INVESTIGATION_OPENED row`,
      );
    }
    const openedPayload = opened.payloadAfter as IncidentOpenedPayload;
    const chronology: ChronologyEntry[] = ordered.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      actorUserId: row.actorUserId,
      actorKind: row.actorKind,
      createdAt: row.createdAt.toISOString(),
      payloadAfter: row.payloadAfter,
      reason: row.reason,
    }));

    const recipientReceipts = this.projectRecipientReceipts(ordered);
    const addenda = this.projectAddenda(ordered);
    const dispatched = ordered.find(
      (row) =>
        row.eventType === 'RECALL_DOSSIER_GENERATED' ||
        row.eventType === 'RECALL_86_FLAG_DISPATCHED',
    );
    const closeMarker = ordered.find(
      (row) => row.eventType === 'RECALL_INCIDENT_CLOSED',
    );
    const status: IncidentStatus = closeMarker
      ? 'closed'
      : dispatched
        ? 'dispatched'
        : 'open';

    const dossierGen = ordered.find(
      (row) => row.eventType === 'RECALL_DOSSIER_GENERATED',
    );
    const dossierPayload =
      dossierGen?.payloadAfter as DossierGeneratedPayload | undefined;
    const dossierMeta = {
      generatedAt: dossierGen?.createdAt.toISOString() ?? null,
      chainBroken: dossierPayload?.chainBroken ?? false,
      firstBrokenRowId: dossierPayload?.firstBrokenRowId ?? null,
    };

    const legalWindowStatus = this.computeLegalWindow(
      openedPayload.legalDeadline,
      dispatched?.createdAt.toISOString() ?? null,
    );

    const incident: Incident = {
      id: incidentId,
      organizationId,
      incidentCode: openedPayload.incidentCode,
      openedAt: openedPayload.openedAt,
      openedByUserId: opened.actorUserId,
      legalDeadline: openedPayload.legalDeadline,
      status,
      lotIds: openedPayload.lotIds,
      locationIds: openedPayload.locationIds,
      recipientList: recipientReceipts.map((r) => r.address),
      dossierHash: dossierPayload?.dossierHash ?? null,
    };

    return {
      incident,
      chronology,
      recipientReceipts,
      addenda,
      legalWindowStatus,
      dossierMeta,
    };
  }

  /**
   * Build the chronology slice without forming the projection — used by
   * DossierService.generate() so we don't double-fetch.
   */
  async loadChronology(
    organizationId: string,
    incidentId: string,
  ): Promise<ChronologyEntry[]> {
    const page = await this.auditLog.query({
      organizationId,
      aggregateType: RECALL_INCIDENT_AGGREGATE_TYPE,
      aggregateId: incidentId,
      limit: 200,
      offset: 0,
    });
    const ordered = [...page.rows].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return ordered.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      actorUserId: row.actorUserId,
      actorKind: row.actorKind,
      createdAt: row.createdAt.toISOString(),
      payloadAfter: row.payloadAfter,
      reason: row.reason,
    }));
  }

  async attachAddendum(input: AttachAddendumInput): Promise<{
    addendumId: string;
    attachedAt: string;
  }> {
    if (input.text.length > RECALL_ADDENDUM_TEXT_MAX) {
      throw new AddendumValidationError(
        'ADDENDUM_TEXT_TOO_LONG',
        `Addendum text exceeds ${RECALL_ADDENDUM_TEXT_MAX} chars`,
      );
    }
    const attachmentMetadata: Array<{
      filename: string;
      contentType: string;
      byteSize: number;
    }> = [];
    for (const att of input.attachments ?? []) {
      const byteSize = approxBase64Bytes(att.contentBase64);
      if (byteSize > RECALL_ADDENDUM_ATTACHMENT_MAX_BYTES) {
        throw new AddendumValidationError(
          'ADDENDUM_ATTACHMENT_TOO_LARGE',
          `Attachment ${att.filename} (${byteSize} bytes) exceeds max ${RECALL_ADDENDUM_ATTACHMENT_MAX_BYTES}`,
        );
      }
      if (!att.filename || !att.contentType) {
        throw new AddendumValidationError(
          'ADDENDUM_ATTACHMENT_INVALID',
          'Attachment must carry filename and contentType',
        );
      }
      attachmentMetadata.push({
        filename: att.filename,
        contentType: att.contentType,
        byteSize,
      });
    }
    const addendumId = randomUUID();
    const attachedAt = new Date().toISOString();
    const payloadAfter: AddendumAttachedPayload = {
      addendumId,
      text: input.text,
      attachmentMetadata,
      attachedAt,
    };
    const envelope: AuditEventEnvelope<null, AddendumAttachedPayload> = {
      organizationId: input.organizationId,
      aggregateType: RECALL_INCIDENT_AGGREGATE_TYPE,
      aggregateId: input.incidentId,
      actorUserId: input.attachedByUserId,
      actorKind: 'user',
      payloadBefore: null,
      payloadAfter,
    };
    await safeAuditEmit(
      this.events,
      AuditEventType.RECALL_ADDENDUM_ATTACHED,
      envelope,
      this.logger,
    );
    return { addendumId, attachedAt };
  }

  private projectRecipientReceipts(
    rows: ReadonlyArray<{
      eventType: string;
      payloadAfter: unknown;
    }>,
  ): DispatchRecipient[] {
    const out: DispatchRecipient[] = [];
    for (const row of rows) {
      if (
        row.eventType !== 'RECALL_DOSSIER_GENERATED' &&
        row.eventType !== 'RECALL_DOSSIER_REDISPATCHED'
      ) {
        continue;
      }
      const payload = row.payloadAfter as
        | DossierGeneratedPayload
        | DossierRedispatchedPayload
        | undefined;
      if (!payload || typeof payload !== 'object' || !payload.recipient) continue;
      out.push({
        address: payload.recipient,
        status: this.normaliseDeliveryStatus(payload.deliveryStatus),
        providerMessageId: payload.providerMessageId ?? null,
        errorCode: payload.errorCode ?? null,
        errorMessage: payload.errorMessage ?? null,
        attempt: payload.attempt,
        deliveredAt: payload.deliveryStatus === 'delivered'
          ? (payload as { deliveredAt?: string }).deliveredAt ?? null
          : null,
      });
    }
    return out;
  }

  private normaliseDeliveryStatus(
    raw: string,
  ): DispatchRecipient['status'] {
    if (raw === 'delivered' || raw === 'failed' || raw === 'retrying' || raw === 'pending') {
      return raw;
    }
    return 'pending';
  }

  private projectAddenda(
    rows: ReadonlyArray<{
      id: string;
      eventType: string;
      actorUserId: string | null;
      createdAt: Date;
      payloadAfter: unknown;
    }>,
  ): IncidentAddendum[] {
    const out: IncidentAddendum[] = [];
    for (const row of rows) {
      if (row.eventType !== 'RECALL_ADDENDUM_ATTACHED') continue;
      const payload = row.payloadAfter as AddendumAttachedPayload | undefined;
      if (!payload || typeof payload !== 'object') continue;
      out.push({
        id: payload.addendumId,
        attachedByUserId: row.actorUserId,
        attachedAt: payload.attachedAt,
        text: payload.text,
        attachmentMetadata: payload.attachmentMetadata ?? [],
      });
    }
    // J7 surfaces newest-first per j7.md §7.
    return out.reverse();
  }

  private computeLegalWindow(
    legalDeadlineIso: string,
    firstDispatchedAtIso: string | null,
  ): LegalWindowStatus {
    if (firstDispatchedAtIso === null) return 'pending';
    const deadline = Date.parse(legalDeadlineIso);
    const dispatched = Date.parse(firstDispatchedAtIso);
    if (Number.isNaN(deadline) || Number.isNaN(dispatched)) return 'pending';
    return dispatched <= deadline ? 'within_deadline' : 'over_deadline';
  }
}

/**
 * Approximate decoded byte size of a base64 string without actually
 * decoding (avoids materialising large buffers when we only need the
 * size for validation).
 */
function approxBase64Bytes(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}
