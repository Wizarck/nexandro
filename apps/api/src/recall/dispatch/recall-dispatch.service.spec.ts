import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditEventType } from '../../audit-log/application/types';
import type { EmailDispatchService } from '../../shared/email-dispatch/email-dispatch.service.interface';
import { RECALL_INCIDENT_AGGREGATE_TYPE } from '../domain/constants';
import type { DossierService, RecallDossier } from '../dossier/dossier.service';
import { RecallDispatchService } from './recall-dispatch.service';

function buildDossier(): RecallDossier {
  return {
    incidentCode: 'IR-2026-0007',
    openedAt: '2026-05-13T02:14:00Z',
    legalDeadline: '2026-05-13T06:14:00Z',
    chronology: [],
    lotProvenance: null,
    consumptionChain: null,
    signatureBlock: {
      actorUserName: 'Iker',
      generatedAt: '2026-05-13T02:21:00Z',
      dossierHash: 'a'.repeat(64),
      chainBroken: false,
      firstBrokenRowId: null,
    },
    pdfBytes: Buffer.from('mock-pdf'),
    metadata: { chainBroken: false, firstBrokenRowId: null },
  };
}

describe('RecallDispatchService', () => {
  let emitter: EventEmitter2;
  let dossierService: jest.Mocked<Pick<DossierService, 'generate'>>;
  let emailDispatch: jest.Mocked<Pick<EmailDispatchService, 'dispatch' | 'verifyConnection'>>;
  let svc: RecallDispatchService;

  beforeEach(() => {
    emitter = new EventEmitter2();
    dossierService = {
      generate: jest.fn(async () => buildDossier()),
    } as unknown as jest.Mocked<Pick<DossierService, 'generate'>>;
    emailDispatch = {
      dispatch: jest.fn(),
      verifyConnection: jest.fn(async () => true),
    } as unknown as jest.Mocked<Pick<EmailDispatchService, 'dispatch' | 'verifyConnection'>>;
    svc = new RecallDispatchService(
      emitter,
      dossierService as unknown as DossierService,
      emailDispatch as unknown as EmailDispatchService,
    );
  });

  it('dispatch86Flag emits one envelope with the correct shape', async () => {
    const captured: unknown[] = [];
    emitter.on(AuditEventType.RECALL_86_FLAG_DISPATCHED, (e) => captured.push(e));
    await svc.dispatch86Flag({
      organizationId: 'org-1',
      incidentId: 'inc-1',
      actorUserId: 'user-1',
      actorKind: 'user',
      lotIds: ['lot-1'],
      locationIds: ['loc-1'],
    });
    expect(captured).toHaveLength(1);
    const env = captured[0] as Record<string, unknown>;
    expect(env.aggregateType).toBe(RECALL_INCIDENT_AGGREGATE_TYPE);
    expect(env.aggregateId).toBe('inc-1');
    expect(env.actorKind).toBe('user');
  });

  it('dispatchDossier emits one RECALL_DOSSIER_GENERATED per recipient', async () => {
    const captured: unknown[] = [];
    emitter.on(AuditEventType.RECALL_DOSSIER_GENERATED, (e) => captured.push(e));
    emailDispatch.dispatch.mockResolvedValue({
      status: 'success',
      providerMessageId: 'msg-1',
      deliveredAt: new Date('2026-05-13T02:21:00Z'),
      provider: 'smtp',
      attempts: 1,
    });
    const outcome = await svc.dispatchDossier({
      organizationId: 'org-1',
      incidentId: 'inc-1',
      actorUserId: 'user-1',
      actorKind: 'user',
      dossierInput: {
        organizationId: 'org-1',
        incidentId: 'inc-1',
        incidentCode: 'IR-2026-0007',
        openedAt: '2026-05-13T02:14:00Z',
        legalDeadline: '2026-05-13T06:14:00Z',
        lotProvenance: null,
        consumptionChain: null,
      },
      recipientList: ['ops@example.org', 'inspector@example.eu'],
    });
    expect(emailDispatch.dispatch).toHaveBeenCalledTimes(2);
    expect(captured).toHaveLength(2);
    expect(outcome.receipts.every((r) => r.status === 'delivered')).toBe(true);
  });

  it('reflects email failure in receipts WITHOUT throwing', async () => {
    emailDispatch.dispatch
      .mockResolvedValueOnce({
        status: 'success',
        providerMessageId: 'msg-1',
        deliveredAt: new Date(),
        provider: 'smtp',
        attempts: 1,
      })
      .mockResolvedValueOnce({
        status: 'failure',
        error: {
          code: 'RETRYABLE_TRANSIENT',
          message: 'SMTP 503',
          attempts: 3,
        },
      });
    const outcome = await svc.dispatchDossier({
      organizationId: 'org-1',
      incidentId: 'inc-1',
      actorUserId: 'user-1',
      actorKind: 'user',
      dossierInput: {
        organizationId: 'org-1',
        incidentId: 'inc-1',
        incidentCode: 'IR-2026-0007',
        openedAt: '2026-05-13T02:14:00Z',
        legalDeadline: '2026-05-13T06:14:00Z',
        lotProvenance: null,
        consumptionChain: null,
      },
      recipientList: ['ok@example.org', 'failed@example.org'],
    });
    expect(outcome.receipts).toHaveLength(2);
    expect(outcome.receipts[0].status).toBe('delivered');
    expect(outcome.receipts[1].status).toBe('failed');
    expect(outcome.receipts[1].errorCode).toBe('RETRYABLE_TRANSIENT');
  });

  it('surfaces a dossierError when the renderer fails (without emitting per-recipient envelopes)', async () => {
    const captured: unknown[] = [];
    emitter.on(AuditEventType.RECALL_DOSSIER_GENERATED, (e) => captured.push(e));
    dossierService.generate.mockRejectedValueOnce(new Error('renderer down'));
    const outcome = await svc.dispatchDossier({
      organizationId: 'org-1',
      incidentId: 'inc-1',
      actorUserId: 'user-1',
      actorKind: 'user',
      dossierInput: {
        organizationId: 'org-1',
        incidentId: 'inc-1',
        incidentCode: 'IR-2026-0007',
        openedAt: '2026-05-13T02:14:00Z',
        legalDeadline: '2026-05-13T06:14:00Z',
        lotProvenance: null,
        consumptionChain: null,
      },
      recipientList: ['ops@example.org'],
    });
    expect(outcome.dossierError?.code).toBe('DOSSIER_RENDER_FAILED');
    expect(outcome.receipts).toHaveLength(0);
    expect(captured).toHaveLength(0);
    expect(emailDispatch.dispatch).not.toHaveBeenCalled();
  });

  it('redispatchDossier emits RECALL_DOSSIER_REDISPATCHED with the original timestamp', async () => {
    const captured: unknown[] = [];
    emitter.on(AuditEventType.RECALL_DOSSIER_REDISPATCHED, (e) => captured.push(e));
    emailDispatch.dispatch.mockResolvedValue({
      status: 'success',
      providerMessageId: 'msg-2',
      deliveredAt: new Date(),
      provider: 'smtp',
      attempts: 1,
    });
    await svc.redispatchDossier({
      organizationId: 'org-1',
      incidentId: 'inc-1',
      actorUserId: 'user-1',
      actorKind: 'user',
      dossierInput: {
        organizationId: 'org-1',
        incidentId: 'inc-1',
        incidentCode: 'IR-2026-0007',
        openedAt: '2026-05-13T02:14:00Z',
        legalDeadline: '2026-05-13T06:14:00Z',
        lotProvenance: null,
        consumptionChain: null,
      },
      recipientList: ['failed@example.org'],
      originalDispatchedAt: '2026-05-13T02:21:00Z',
      cachedDossier: buildDossier(),
    });
    expect(captured).toHaveLength(1);
    const env = captured[0] as { payloadAfter?: { originalDispatchedAt?: string } };
    expect(env.payloadAfter?.originalDispatchedAt).toBe('2026-05-13T02:21:00Z');
  });
});
