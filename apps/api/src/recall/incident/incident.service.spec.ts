import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import type { AuditLogService } from '../../audit-log/application/audit-log.service';
import { AuditEventType } from '../../audit-log/application/types';
import { AuditLog } from '../../audit-log/domain/audit-log.entity';
import { RECALL_INCIDENT_AGGREGATE_TYPE } from '../domain/constants';
import { IncidentCodeGenerator } from './incident-code-generator';
import { AddendumValidationError, IncidentService } from './incident.service';

function makeAuditRow(
  overrides: Partial<AuditLog> & { eventType: string; aggregateId: string },
): AuditLog {
  const row = new AuditLog();
  row.id = overrides.id ?? `row-${overrides.eventType}-${Math.random()}`;
  row.organizationId = overrides.organizationId ?? 'org-1';
  row.eventType = overrides.eventType;
  row.aggregateType = overrides.aggregateType ?? RECALL_INCIDENT_AGGREGATE_TYPE;
  row.aggregateId = overrides.aggregateId;
  row.actorUserId = overrides.actorUserId ?? null;
  row.actorKind = overrides.actorKind ?? 'user';
  row.agentName = null;
  row.payloadBefore = null;
  row.payloadAfter = overrides.payloadAfter ?? null;
  row.reason = overrides.reason ?? null;
  row.citationUrl = null;
  row.snippet = null;
  row.createdAt = overrides.createdAt ?? new Date('2026-05-13T02:14:00Z');
  return row;
}

describe('IncidentService', () => {
  let auditLog: jest.Mocked<Pick<AuditLogService, 'query'>>;
  let codeGen: jest.Mocked<Pick<IncidentCodeGenerator, 'nextCode'>>;
  let emitter: EventEmitter2;
  let svc: IncidentService;

  beforeEach(() => {
    auditLog = {
      query: jest.fn(),
    } as unknown as jest.Mocked<Pick<AuditLogService, 'query'>>;
    codeGen = {
      nextCode: jest.fn().mockResolvedValue('IR-2026-0007'),
    } as unknown as jest.Mocked<Pick<IncidentCodeGenerator, 'nextCode'>>;
    emitter = new EventEmitter2();
    svc = new IncidentService(
      auditLog as unknown as AuditLogService,
      codeGen as unknown as IncidentCodeGenerator,
      emitter,
    );
  });

  describe('openIncident', () => {
    it('emits RECALL_INVESTIGATION_OPENED with a 4h legal deadline', async () => {
      const events: unknown[] = [];
      emitter.on(AuditEventType.RECALL_INVESTIGATION_OPENED, (e) => events.push(e));
      const incident = await svc.openIncident({
        organizationId: 'org-1',
        openedByUserId: 'user-1',
        lotIds: ['lot-1'],
        locationIds: ['loc-1'],
        recipientList: ['ops@example.org'],
      });
      expect(incident.incidentCode).toBe('IR-2026-0007');
      expect(incident.status).toBe('open');
      expect(events).toHaveLength(1);
      const env = events[0] as Record<string, unknown>;
      expect(env.aggregateType).toBe(RECALL_INCIDENT_AGGREGATE_TYPE);
      expect(env.actorUserId).toBe('user-1');
      expect(env.actorKind).toBe('user');
      const opened = Date.parse(incident.openedAt);
      const deadline = Date.parse(incident.legalDeadline);
      expect(deadline - opened).toBe(4 * 60 * 60 * 1000);
    });
  });

  describe('getIncident', () => {
    it('throws NotFoundException when no rows exist', async () => {
      auditLog.query.mockResolvedValue({
        rows: [],
        total: 0,
        limit: 200,
        offset: 0,
      });
      await expect(svc.getIncident('org-1', 'inc-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('projects status=open when only the opened row is present', async () => {
      auditLog.query.mockResolvedValue({
        rows: [
          makeAuditRow({
            eventType: 'RECALL_INVESTIGATION_OPENED',
            aggregateId: 'inc-1',
            payloadAfter: {
              incidentCode: 'IR-2026-0007',
              lotIds: ['lot-1'],
              locationIds: ['loc-1'],
              legalDeadline: '2026-05-13T06:14:00Z',
              openedAt: '2026-05-13T02:14:00Z',
            },
          }),
        ],
        total: 1,
        limit: 200,
        offset: 0,
      });
      const projection = await svc.getIncident('org-1', 'inc-1');
      expect(projection.incident.status).toBe('open');
      expect(projection.legalWindowStatus).toBe('pending');
      expect(projection.chronology).toHaveLength(1);
    });

    it('projects status=dispatched when a RECALL_DOSSIER_GENERATED row is present', async () => {
      auditLog.query.mockResolvedValue({
        rows: [
          makeAuditRow({
            eventType: 'RECALL_INVESTIGATION_OPENED',
            aggregateId: 'inc-1',
            payloadAfter: {
              incidentCode: 'IR-2026-0007',
              lotIds: ['lot-1'],
              locationIds: ['loc-1'],
              legalDeadline: '2026-05-13T06:14:00Z',
              openedAt: '2026-05-13T02:14:00Z',
            },
            createdAt: new Date('2026-05-13T02:14:00Z'),
          }),
          makeAuditRow({
            eventType: 'RECALL_DOSSIER_GENERATED',
            aggregateId: 'inc-1',
            payloadAfter: {
              recipient: 'ops@example.org',
              deliveryStatus: 'delivered',
              providerMessageId: 'msg-1',
              attempt: 1,
              dossierHash: 'abc',
              chainBroken: false,
            },
            createdAt: new Date('2026-05-13T02:21:00Z'),
          }),
        ],
        total: 2,
        limit: 200,
        offset: 0,
      });
      const projection = await svc.getIncident('org-1', 'inc-1');
      expect(projection.incident.status).toBe('dispatched');
      expect(projection.legalWindowStatus).toBe('within_deadline');
      expect(projection.recipientReceipts).toHaveLength(1);
      expect(projection.recipientReceipts[0].address).toBe('ops@example.org');
    });

    it('marks legalWindowStatus=over_deadline when dispatch is beyond +4h', async () => {
      auditLog.query.mockResolvedValue({
        rows: [
          makeAuditRow({
            eventType: 'RECALL_INVESTIGATION_OPENED',
            aggregateId: 'inc-1',
            payloadAfter: {
              incidentCode: 'IR-2026-0007',
              lotIds: ['lot-1'],
              locationIds: ['loc-1'],
              legalDeadline: '2026-05-13T06:14:00Z',
              openedAt: '2026-05-13T02:14:00Z',
            },
            createdAt: new Date('2026-05-13T02:14:00Z'),
          }),
          makeAuditRow({
            eventType: 'RECALL_DOSSIER_GENERATED',
            aggregateId: 'inc-1',
            payloadAfter: {
              recipient: 'ops@example.org',
              deliveryStatus: 'delivered',
              providerMessageId: 'msg-1',
              attempt: 1,
              dossierHash: 'abc',
              chainBroken: false,
            },
            createdAt: new Date('2026-05-13T07:00:00Z'),
          }),
        ],
        total: 2,
        limit: 200,
        offset: 0,
      });
      const projection = await svc.getIncident('org-1', 'inc-1');
      expect(projection.legalWindowStatus).toBe('over_deadline');
    });

    it('projects addenda newest-first', async () => {
      auditLog.query.mockResolvedValue({
        rows: [
          makeAuditRow({
            eventType: 'RECALL_INVESTIGATION_OPENED',
            aggregateId: 'inc-1',
            payloadAfter: {
              incidentCode: 'IR-2026-0007',
              lotIds: [],
              locationIds: [],
              legalDeadline: '2026-05-13T06:14:00Z',
              openedAt: '2026-05-13T02:14:00Z',
            },
            createdAt: new Date('2026-05-13T02:14:00Z'),
          }),
          makeAuditRow({
            eventType: 'RECALL_ADDENDUM_ATTACHED',
            aggregateId: 'inc-1',
            payloadAfter: {
              addendumId: 'add-1',
              text: 'first',
              attachmentMetadata: [],
              attachedAt: '2026-05-13T03:00:00Z',
            },
            createdAt: new Date('2026-05-13T03:00:00Z'),
          }),
          makeAuditRow({
            eventType: 'RECALL_ADDENDUM_ATTACHED',
            aggregateId: 'inc-1',
            payloadAfter: {
              addendumId: 'add-2',
              text: 'second',
              attachmentMetadata: [],
              attachedAt: '2026-05-13T04:00:00Z',
            },
            createdAt: new Date('2026-05-13T04:00:00Z'),
          }),
        ],
        total: 3,
        limit: 200,
        offset: 0,
      });
      const projection = await svc.getIncident('org-1', 'inc-1');
      expect(projection.addenda).toHaveLength(2);
      expect(projection.addenda[0].id).toBe('add-2');
      expect(projection.addenda[1].id).toBe('add-1');
    });
  });

  describe('attachAddendum', () => {
    it('rejects text over the cap', async () => {
      await expect(
        svc.attachAddendum({
          organizationId: 'org-1',
          incidentId: 'inc-1',
          attachedByUserId: 'user-1',
          text: 'x'.repeat(10_001),
        }),
      ).rejects.toBeInstanceOf(AddendumValidationError);
    });

    it('rejects attachments over 50 MB', async () => {
      // 50 MB + 1 byte of base64 — ~70 MB of base64 string
      const oversized = 'a'.repeat(72 * 1024 * 1024);
      await expect(
        svc.attachAddendum({
          organizationId: 'org-1',
          incidentId: 'inc-1',
          attachedByUserId: 'user-1',
          text: 'short',
          attachments: [
            { filename: 'lab.pdf', contentType: 'application/pdf', contentBase64: oversized },
          ],
        }),
      ).rejects.toBeInstanceOf(AddendumValidationError);
    });

    it('emits RECALL_ADDENDUM_ATTACHED with shape (addendumId, attachedAt)', async () => {
      const events: unknown[] = [];
      emitter.on(AuditEventType.RECALL_ADDENDUM_ATTACHED, (e) => events.push(e));
      const result = await svc.attachAddendum({
        organizationId: 'org-1',
        incidentId: 'inc-1',
        attachedByUserId: 'user-1',
        text: 'Inspector visited.',
      });
      expect(result.addendumId).toMatch(/[0-9a-f-]{36}/);
      expect(events).toHaveLength(1);
      const env = events[0] as Record<string, unknown>;
      expect(env.aggregateType).toBe(RECALL_INCIDENT_AGGREGATE_TYPE);
      expect(env.aggregateId).toBe('inc-1');
    });
  });
});
