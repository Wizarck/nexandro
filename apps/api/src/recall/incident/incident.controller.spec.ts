import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import type { RecallDispatchService } from '../dispatch/recall-dispatch.service';
import type { DossierService } from '../dossier/dossier.service';
import type { IncidentProjection } from '../domain/incident';
import { AddendumValidationError, IncidentService } from './incident.service';
import { IncidentController } from './incident.controller';

function fakeReq(user: AuthenticatedUserPayload | undefined): Request {
  return { user } as unknown as Request;
}

function makeProjection(
  overrides: Partial<IncidentProjection['incident']> = {},
): IncidentProjection {
  return {
    incident: {
      id: 'inc-1',
      organizationId: 'org-1',
      incidentCode: 'IR-2026-0007',
      openedAt: '2026-05-13T02:14:00Z',
      openedByUserId: 'user-1',
      legalDeadline: '2026-05-13T06:14:00Z',
      status: 'open',
      lotIds: ['lot-1'],
      locationIds: ['loc-1'],
      recipientList: ['ops@example.org'],
      ...overrides,
    },
    chronology: [],
    recipientReceipts: [],
    addenda: [],
    legalWindowStatus: 'pending',
    dossierMeta: { generatedAt: null, chainBroken: false, firstBrokenRowId: null },
  };
}

describe('IncidentController', () => {
  let incidents: jest.Mocked<
    Pick<IncidentService, 'openIncident' | 'getIncident' | 'attachAddendum'>
  >;
  let dispatch: jest.Mocked<
    Pick<RecallDispatchService, 'dispatch86Flag' | 'dispatchDossier' | 'redispatchDossier'>
  >;
  let dossier: jest.Mocked<Pick<DossierService, 'generate'>>;
  let ctrl: IncidentController;

  beforeEach(() => {
    incidents = {
      openIncident: jest.fn(),
      getIncident: jest.fn(),
      attachAddendum: jest.fn(),
    } as jest.Mocked<typeof incidents>;
    dispatch = {
      dispatch86Flag: jest.fn().mockResolvedValue(undefined),
      dispatchDossier: jest.fn(),
      redispatchDossier: jest.fn(),
    } as jest.Mocked<typeof dispatch>;
    dossier = {
      generate: jest.fn(),
    } as jest.Mocked<typeof dossier>;
    ctrl = new IncidentController(
      incidents as unknown as IncidentService,
      dispatch as unknown as RecallDispatchService,
      dossier as unknown as DossierService,
    );
  });

  describe('open()', () => {
    it('rejects unauthenticated callers', async () => {
      await expect(
        ctrl.open(
          {
            organizationId: 'org-1',
            lotIds: [],
            locationIds: [],
            recipientList: [],
          },
          fakeReq(undefined),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects cross-org callers', async () => {
      await expect(
        ctrl.open(
          {
            organizationId: 'org-OTHER',
            lotIds: [],
            locationIds: [],
            recipientList: [],
          },
          fakeReq({ userId: 'u', organizationId: 'org-1', role: 'OWNER' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forwards openedByUserId from req.user (NOT from body)', async () => {
      incidents.openIncident.mockResolvedValue({
        id: 'inc-1',
        organizationId: 'org-1',
        incidentCode: 'IR-2026-0007',
        openedAt: '2026-05-13T02:14:00Z',
        openedByUserId: 'user-A',
        legalDeadline: '2026-05-13T06:14:00Z',
        status: 'open',
        lotIds: [],
        locationIds: [],
        recipientList: [],
      });
      await ctrl.open(
        {
          organizationId: 'org-1',
          lotIds: [],
          locationIds: [],
          recipientList: [],
        },
        fakeReq({ userId: 'user-A', organizationId: 'org-1', role: 'MANAGER' }),
      );
      expect(incidents.openIncident).toHaveBeenCalledWith(
        expect.objectContaining({ openedByUserId: 'user-A' }),
      );
    });
  });

  describe('dispatchIncident()', () => {
    it('rejects empty recipient list with RECALL_RECIPIENTS_NOT_CONFIGURED', async () => {
      await expect(
        ctrl.dispatchIncident(
          'inc-1',
          { organizationId: 'org-1', recipientList: [] },
          fakeReq({ userId: 'u', organizationId: 'org-1', role: 'OWNER' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('routes 86-flag + dossier when recipientList is valid', async () => {
      incidents.getIncident.mockResolvedValue(makeProjection());
      dispatch.dispatchDossier.mockResolvedValue({
        receipts: [
          {
            address: 'ops@example.org',
            status: 'delivered',
            providerMessageId: 'msg-1',
            errorCode: null,
            errorMessage: null,
            attempt: 1,
            deliveredAt: new Date().toISOString(),
          },
        ],
        dossier: null,
      });
      const res = await ctrl.dispatchIncident(
        'inc-1',
        { organizationId: 'org-1', recipientList: ['ops@example.org'] },
        fakeReq({ userId: 'u', organizationId: 'org-1', role: 'OWNER' }),
      );
      expect(dispatch.dispatch86Flag).toHaveBeenCalledTimes(1);
      expect(dispatch.dispatchDossier).toHaveBeenCalledTimes(1);
      expect(res.incidentStatus).toBe('dispatched');
      expect(res.recipientReceipts).toHaveLength(1);
    });

    it('rejects cross-org request', async () => {
      await expect(
        ctrl.dispatchIncident(
          'inc-1',
          { organizationId: 'org-OTHER', recipientList: ['x@y.z'] },
          fakeReq({ userId: 'u', organizationId: 'org-1', role: 'OWNER' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('getIncident()', () => {
    it('returns the projection for an existing incident', async () => {
      const projection = makeProjection({ status: 'dispatched' });
      incidents.getIncident.mockResolvedValue(projection);
      const res = await ctrl.getIncident(
        'inc-1',
        { organizationId: 'org-1' },
        fakeReq({ userId: 'u', organizationId: 'org-1', role: 'OWNER' }),
      );
      expect(res.incident.status).toBe('dispatched');
    });
  });

  describe('attachAddendum()', () => {
    it('maps AddendumValidationError to 422', async () => {
      incidents.attachAddendum.mockRejectedValue(
        new AddendumValidationError('ADDENDUM_TEXT_TOO_LONG', 'too long'),
      );
      await expect(
        ctrl.attachAddendum(
          'inc-1',
          { organizationId: 'org-1', text: 'x' },
          fakeReq({ userId: 'u', organizationId: 'org-1', role: 'OWNER' }),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('returns addendumId on success', async () => {
      incidents.attachAddendum.mockResolvedValue({
        addendumId: 'add-1',
        attachedAt: '2026-05-13T03:00:00Z',
      });
      const res = await ctrl.attachAddendum(
        'inc-1',
        { organizationId: 'org-1', text: 'Inspector visited.' },
        fakeReq({ userId: 'u', organizationId: 'org-1', role: 'OWNER' }),
      );
      expect(res.addendumId).toBe('add-1');
    });
  });

  describe('redispatchIncident()', () => {
    it('passes the original dispatch timestamp to the service', async () => {
      const projection = makeProjection({ status: 'dispatched' });
      // simulate one prior delivery
      const proj: IncidentProjection = {
        ...projection,
        recipientReceipts: [
          {
            address: 'ops@example.org',
            status: 'delivered',
            providerMessageId: 'msg-1',
            errorCode: null,
            errorMessage: null,
            attempt: 1,
            deliveredAt: '2026-05-13T02:21:00Z',
          },
        ],
      };
      incidents.getIncident.mockResolvedValue(proj);
      dispatch.redispatchDossier.mockResolvedValue({
        receipts: [],
        dossier: null,
      });
      await ctrl.redispatchIncident(
        'inc-1',
        { organizationId: 'org-1', recipientList: ['ops@example.org'] },
        fakeReq({ userId: 'u', organizationId: 'org-1', role: 'OWNER' }),
      );
      const arg = dispatch.redispatchDossier.mock.calls[0][0];
      expect(arg.originalDispatchedAt).toBe('2026-05-13T02:21:00Z');
    });
  });
});
