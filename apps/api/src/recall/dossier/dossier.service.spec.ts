import type { AuditLogService } from '../../audit-log/application/audit-log.service';
import { AuditLog } from '../../audit-log/domain/audit-log.entity';
import { RECALL_INCIDENT_AGGREGATE_TYPE } from '../domain/constants';
import { DossierRenderError, DossierService } from './dossier.service';

jest.mock('@opentrattos/label-renderer', () => {
  const actual = jest.requireActual('@opentrattos/label-renderer');
  return {
    ...actual,
    renderRecallDossierToPdf: jest.fn(async () => Buffer.from('mock-pdf-bytes')),
  };
});

function makeAuditRow(overrides: {
  id?: string;
  eventType: string;
  createdAt?: Date;
  payloadAfter?: unknown;
}): AuditLog {
  const row = new AuditLog();
  row.id = overrides.id ?? `row-${overrides.eventType}`;
  row.organizationId = 'org-1';
  row.eventType = overrides.eventType;
  row.aggregateType = RECALL_INCIDENT_AGGREGATE_TYPE;
  row.aggregateId = 'inc-1';
  row.actorUserId = 'user-1';
  row.actorKind = 'user';
  row.agentName = null;
  row.payloadBefore = null;
  row.payloadAfter = overrides.payloadAfter ?? {};
  row.reason = null;
  row.citationUrl = null;
  row.snippet = null;
  row.createdAt = overrides.createdAt ?? new Date('2026-05-13T02:14:00Z');
  return row;
}

describe('DossierService', () => {
  let audit: jest.Mocked<Pick<AuditLogService, 'query'>>;
  let svc: DossierService;

  beforeEach(() => {
    audit = {
      query: jest.fn(async () => ({
        rows: [
          makeAuditRow({
            eventType: 'RECALL_INVESTIGATION_OPENED',
            createdAt: new Date('2026-05-13T02:14:00Z'),
          }),
          makeAuditRow({
            eventType: 'RECALL_86_FLAG_DISPATCHED',
            createdAt: new Date('2026-05-13T02:18:00Z'),
          }),
        ],
        total: 2,
        limit: 200,
        offset: 0,
      })),
    } as jest.Mocked<Pick<AuditLogService, 'query'>>;
    svc = new DossierService(audit as unknown as AuditLogService);
  });

  it('composes a dossier with chain-intact signature block', async () => {
    const dossier = await svc.generate({
      organizationId: 'org-1',
      incidentId: 'inc-1',
      incidentCode: 'IR-2026-0007',
      openedAt: '2026-05-13T02:14:00Z',
      legalDeadline: '2026-05-13T06:14:00Z',
      openedByUserName: 'Iker',
      lotProvenance: null,
      consumptionChain: null,
    });
    expect(dossier.signatureBlock.chainBroken).toBe(false);
    expect(dossier.signatureBlock.dossierHash).toMatch(/^[0-9a-f]{64}$/);
    expect(dossier.chronology).toHaveLength(2);
    expect(dossier.pdfBytes).toBeInstanceOf(Buffer);
    expect(dossier.metadata.chainBroken).toBe(false);
  });

  it('returns a stable dossier hash for the same chronology', async () => {
    const d1 = await svc.generate({
      organizationId: 'org-1',
      incidentId: 'inc-1',
      incidentCode: 'IR-2026-0007',
      openedAt: '2026-05-13T02:14:00Z',
      legalDeadline: '2026-05-13T06:14:00Z',
      lotProvenance: null,
      consumptionChain: null,
    });
    const d2 = await svc.generate({
      organizationId: 'org-1',
      incidentId: 'inc-1',
      incidentCode: 'IR-2026-0007',
      openedAt: '2026-05-13T02:14:00Z',
      legalDeadline: '2026-05-13T06:14:00Z',
      lotProvenance: null,
      consumptionChain: null,
    });
    expect(d1.signatureBlock.dossierHash).toBe(d2.signatureBlock.dossierHash);
  });

  it('surfaces DossierRenderError when the PDF renderer throws', async () => {
    const { renderRecallDossierToPdf } = jest.requireMock(
      '@opentrattos/label-renderer',
    ) as { renderRecallDossierToPdf: jest.Mock };
    renderRecallDossierToPdf.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    await expect(
      svc.generate({
        organizationId: 'org-1',
        incidentId: 'inc-1',
        incidentCode: 'IR-2026-0007',
        openedAt: '2026-05-13T02:14:00Z',
        legalDeadline: '2026-05-13T06:14:00Z',
        lotProvenance: null,
        consumptionChain: null,
      }),
    ).rejects.toBeInstanceOf(DossierRenderError);
  });

  it('orders the chronology oldest-first', async () => {
    audit.query.mockResolvedValueOnce({
      rows: [
        makeAuditRow({
          id: 'r2',
          eventType: 'RECALL_DOSSIER_GENERATED',
          createdAt: new Date('2026-05-13T03:00:00Z'),
        }),
        makeAuditRow({
          id: 'r1',
          eventType: 'RECALL_INVESTIGATION_OPENED',
          createdAt: new Date('2026-05-13T02:14:00Z'),
        }),
      ],
      total: 2,
      limit: 200,
      offset: 0,
    });
    const dossier = await svc.generate({
      organizationId: 'org-1',
      incidentId: 'inc-1',
      incidentCode: 'IR-2026-0007',
      openedAt: '2026-05-13T02:14:00Z',
      legalDeadline: '2026-05-13T06:14:00Z',
      lotProvenance: null,
      consumptionChain: null,
    });
    expect(dossier.chronology[0].id).toBe('r1');
    expect(dossier.chronology[1].id).toBe('r2');
  });
});
