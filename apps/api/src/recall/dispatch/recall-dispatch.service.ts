import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import {
  EMAIL_DISPATCH_SERVICE,
  type EmailDispatchService,
} from '../../shared/email-dispatch/email-dispatch.service.interface';
import type {
  EmailAttachment,
  EmailDispatchResult,
} from '../../shared/email-dispatch/types';
import {
  RECALL_DISPATCH_EMAIL_TAG,
  RECALL_INCIDENT_AGGREGATE_TYPE,
} from '../domain/constants';
import type {
  DossierGeneratedPayload,
  DossierRedispatchedPayload,
  FlagDispatchedPayload,
} from '../domain/incident';
import type { DispatchRecipient } from '../types';
import {
  DossierService,
  type RecallDossier,
  type RecallDossierInput,
} from '../dossier/dossier.service';

export interface Dispatch86FlagInput {
  readonly organizationId: string;
  readonly incidentId: string;
  readonly actorUserId: string | null;
  readonly actorKind: 'user' | 'agent';
  readonly lotIds: ReadonlyArray<string>;
  readonly locationIds: ReadonlyArray<string>;
}

export interface DispatchDossierInput {
  readonly organizationId: string;
  readonly incidentId: string;
  readonly actorUserId: string | null;
  readonly actorKind: 'user' | 'agent';
  readonly dossierInput: RecallDossierInput;
  readonly recipientList: ReadonlyArray<string>;
  readonly subject?: string;
  readonly bodyText?: string;
}

export interface RedispatchInput extends DispatchDossierInput {
  readonly originalDispatchedAt: string;
  /** Optional pre-built dossier — if absent we regenerate on the fly. */
  readonly cachedDossier?: RecallDossier;
}

export interface DispatchOutcome {
  readonly receipts: ReadonlyArray<DispatchRecipient>;
  readonly dossier: RecallDossier | null;
  readonly dossierError?: { code: string; message: string };
}

@Injectable()
export class RecallDispatchService {
  private readonly logger = new Logger(RecallDispatchService.name);

  constructor(
    private readonly events: EventEmitter2,
    private readonly dossierService: DossierService,
    @Inject(EMAIL_DISPATCH_SERVICE)
    private readonly emailDispatch: EmailDispatchService,
  ) {}

  /**
   * Emit the 86-flag envelope. The flag is the canonical "stop service"
   * signal consumed by kitchen Hermes agent surfaces (WhatsApp / Telegram
   * / Web chat widget) per ADR-MCP-RECALL-CAPABILITIES.
   */
  async dispatch86Flag(input: Dispatch86FlagInput): Promise<void> {
    const dispatchedAt = new Date().toISOString();
    const payloadAfter: FlagDispatchedPayload = {
      lotIds: [...input.lotIds],
      locationIds: [...input.locationIds],
      dispatchedAt,
    };
    const envelope: AuditEventEnvelope<null, FlagDispatchedPayload> = {
      organizationId: input.organizationId,
      aggregateType: RECALL_INCIDENT_AGGREGATE_TYPE,
      aggregateId: input.incidentId,
      actorUserId: input.actorUserId,
      actorKind: input.actorKind,
      payloadBefore: null,
      payloadAfter,
    };
    await this.events.emitAsync(
      AuditEventType.RECALL_86_FLAG_DISPATCHED,
      envelope,
    );
  }

  /**
   * Generate the dossier and email it to every recipient. Per AC-RECALL-2
   * + ADR-DISPATCH-PER-RECIPIENT-AUDIT: each recipient is one audit_log
   * envelope. Failures are NEVER thrown — they're captured per-recipient
   * and reflected in the response receipts.
   */
  async dispatchDossier(input: DispatchDossierInput): Promise<DispatchOutcome> {
    let dossier: RecallDossier;
    try {
      dossier = await this.dossierService.generate(input.dossierInput);
    } catch (err) {
      this.logger.error(
        `dossier.generate-failed incidentId=${input.incidentId} ${(err as Error).message}`,
      );
      return {
        receipts: [],
        dossier: null,
        dossierError: {
          code: 'DOSSIER_RENDER_FAILED',
          message: (err as Error).message,
        },
      };
    }

    const attachments: EmailAttachment[] = [
      {
        filename: `dossier-${dossier.incidentCode}.pdf`,
        contentType: 'application/pdf',
        contentBase64: dossier.pdfBytes.toString('base64'),
      },
    ];
    const subject =
      input.subject ?? `Dossier incidente ${dossier.incidentCode}`;
    const bodyText =
      input.bodyText ??
      this.defaultBodyText(dossier);

    const receipts: DispatchRecipient[] = [];
    for (const recipient of input.recipientList) {
      const result = await this.emailDispatch.dispatch({
        to: [recipient],
        subject,
        bodyText,
        attachments,
        tag: RECALL_DISPATCH_EMAIL_TAG,
        organizationId: input.organizationId,
      });
      const receipt = this.toReceipt(recipient, result, 1);
      receipts.push(receipt);
      await this.emitDossierGenerated(input, dossier, receipt);
    }

    return { receipts, dossier };
  }

  async redispatchDossier(input: RedispatchInput): Promise<DispatchOutcome> {
    let dossier = input.cachedDossier ?? null;
    if (!dossier) {
      try {
        dossier = await this.dossierService.generate(input.dossierInput);
      } catch (err) {
        this.logger.error(
          `dossier.regen-failed incidentId=${input.incidentId} ${(err as Error).message}`,
        );
        return {
          receipts: [],
          dossier: null,
          dossierError: {
            code: 'DOSSIER_RENDER_FAILED',
            message: (err as Error).message,
          },
        };
      }
    }

    const attachments: EmailAttachment[] = [
      {
        filename: `dossier-${dossier.incidentCode}.pdf`,
        contentType: 'application/pdf',
        contentBase64: dossier.pdfBytes.toString('base64'),
      },
    ];
    const subject =
      input.subject ?? `Dossier incidente ${dossier.incidentCode} (reenvío)`;
    const bodyText = input.bodyText ?? this.defaultBodyText(dossier);

    const receipts: DispatchRecipient[] = [];
    for (const recipient of input.recipientList) {
      const result = await this.emailDispatch.dispatch({
        to: [recipient],
        subject,
        bodyText,
        attachments,
        tag: RECALL_DISPATCH_EMAIL_TAG,
        organizationId: input.organizationId,
      });
      const receipt = this.toReceipt(recipient, result, 2);
      receipts.push(receipt);
      await this.emitDossierRedispatched(
        input,
        dossier,
        receipt,
        input.originalDispatchedAt,
      );
    }
    return { receipts, dossier };
  }

  private toReceipt(
    recipient: string,
    result: EmailDispatchResult,
    attempt: number,
  ): DispatchRecipient {
    if (result.status === 'success') {
      return {
        address: recipient,
        status: 'delivered',
        providerMessageId: result.providerMessageId,
        errorCode: null,
        errorMessage: null,
        attempt: result.attempts,
        deliveredAt: result.deliveredAt.toISOString(),
      };
    }
    return {
      address: recipient,
      status: 'failed',
      providerMessageId: null,
      errorCode: result.error.code,
      errorMessage: result.error.message,
      attempt: Math.max(attempt, result.error.attempts),
      deliveredAt: null,
    };
  }

  private async emitDossierGenerated(
    input: DispatchDossierInput,
    dossier: RecallDossier,
    receipt: DispatchRecipient,
  ): Promise<void> {
    const payloadAfter: DossierGeneratedPayload = {
      recipient: receipt.address,
      deliveryStatus: receipt.status === 'delivered' ? 'delivered' : 'failed',
      providerMessageId: receipt.providerMessageId ?? null,
      errorCode: receipt.errorCode,
      errorMessage: receipt.errorMessage,
      attempt: receipt.attempt,
      dossierHash: dossier.signatureBlock.dossierHash,
      chainBroken: dossier.signatureBlock.chainBroken,
      firstBrokenRowId: dossier.signatureBlock.firstBrokenRowId,
    };
    const envelope: AuditEventEnvelope<null, DossierGeneratedPayload> = {
      organizationId: input.organizationId,
      aggregateType: RECALL_INCIDENT_AGGREGATE_TYPE,
      aggregateId: input.incidentId,
      actorUserId: input.actorUserId,
      actorKind: input.actorKind,
      payloadBefore: null,
      payloadAfter,
    };
    await this.events.emitAsync(
      AuditEventType.RECALL_DOSSIER_GENERATED,
      envelope,
    );
  }

  private async emitDossierRedispatched(
    input: RedispatchInput,
    dossier: RecallDossier,
    receipt: DispatchRecipient,
    originalDispatchedAt: string,
  ): Promise<void> {
    const payloadAfter: DossierRedispatchedPayload = {
      recipient: receipt.address,
      deliveryStatus: receipt.status === 'delivered' ? 'delivered' : 'failed',
      providerMessageId: receipt.providerMessageId ?? null,
      errorCode: receipt.errorCode,
      errorMessage: receipt.errorMessage,
      attempt: receipt.attempt,
      dossierHash: dossier.signatureBlock.dossierHash,
      chainBroken: dossier.signatureBlock.chainBroken,
      firstBrokenRowId: dossier.signatureBlock.firstBrokenRowId,
      originalDispatchedAt,
    };
    const envelope: AuditEventEnvelope<null, DossierRedispatchedPayload> = {
      organizationId: input.organizationId,
      aggregateType: RECALL_INCIDENT_AGGREGATE_TYPE,
      aggregateId: input.incidentId,
      actorUserId: input.actorUserId,
      actorKind: input.actorKind,
      payloadBefore: null,
      payloadAfter,
    };
    await this.events.emitAsync(
      AuditEventType.RECALL_DOSSIER_REDISPATCHED,
      envelope,
    );
  }

  private defaultBodyText(dossier: RecallDossier): string {
    return [
      `Dossier de incidente ${dossier.incidentCode}`,
      `Abierto: ${dossier.openedAt}`,
      `Plazo legal: ${dossier.legalDeadline}`,
      '',
      'Se adjunta el dossier en PDF. Cadena audit_log: ' +
        (dossier.signatureBlock.chainBroken ? 'rota' : 'íntegra') +
        '.',
      `Hash SHA-256: ${dossier.signatureBlock.dossierHash}`,
    ].join('\n');
  }
}
