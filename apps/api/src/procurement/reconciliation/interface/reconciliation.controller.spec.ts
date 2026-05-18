import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IllegalReconciliationTransition,
  ReconciliationInvariantError,
  ReconciliationNotFoundError,
} from '../domain/errors';
import { Reconciliation } from '../domain/reconciliation.entity';
import { ReconciliationService } from '../application/reconciliation.service';
import {
  ReconciliationController,
  type ReconciliationListQueryDto,
  type ResolveReconciliationDto,
} from './reconciliation.controller';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '33333333-3333-4333-8333-333333333333';
const ID = '44444444-4444-4444-8444-444444444444';

function makeRecon(overrides: Partial<Reconciliation> = {}): Reconciliation {
  const r = new Reconciliation();
  r.id = overrides.id ?? ID;
  r.organizationId = overrides.organizationId ?? ORG;
  r.poId = overrides.poId ?? '55555555-5555-4555-8555-555555555555';
  r.poNumber = overrides.poNumber ?? 'PO-2026-0001';
  r.grId = overrides.grId ?? '66666666-6666-4666-8666-666666666666';
  r.supplierId = overrides.supplierId ?? '77777777-7777-4777-8777-777777777777';
  r.discrepancyType = overrides.discrepancyType ?? 'cantidad';
  r.diff = overrides.diff ?? { expectedQty: 100, actualQty: 120, unit: 'kg' };
  r.state = overrides.state ?? 'abierta';
  r.resolvedAt = overrides.resolvedAt ?? null;
  r.resolvedByUserId = overrides.resolvedByUserId ?? null;
  r.resolutionNotes = overrides.resolutionNotes ?? null;
  r.createdAt = overrides.createdAt ?? new Date('2026-05-18T10:00:00Z');
  r.updatedAt = overrides.updatedAt ?? new Date('2026-05-18T10:00:00Z');
  return r;
}

function makeReq(overrides: { userId?: string; role?: string } = {}): Request {
  return {
    user: {
      userId: overrides.userId ?? USER,
      organizationId: ORG,
      role: (overrides.role as never) ?? 'OWNER',
    },
  } as unknown as Request;
}

function buildController(): {
  controller: ReconciliationController;
  svc: jest.Mocked<Pick<ReconciliationService, 'list' | 'resolve'>>;
} {
  const svc = {
    list: jest.fn(),
    resolve: jest.fn(),
  };
  const controller = new ReconciliationController(
    svc as unknown as ReconciliationService,
  );
  return { controller, svc: svc as never };
}

function makeListQuery(
  overrides: Partial<ReconciliationListQueryDto> = {},
): ReconciliationListQueryDto {
  return { organizationId: ORG, ...overrides } as ReconciliationListQueryDto;
}

function makeResolveBody(
  overrides: Partial<ResolveReconciliationDto> = {},
): ResolveReconciliationDto {
  return {
    organizationId: ORG,
    state: 'aceptada',
    ...overrides,
  } as ResolveReconciliationDto;
}

describe('ReconciliationController (Sprint 4 W3-5 — real backend)', () => {
  describe('GET /m3/procurement/reconciliation', () => {
    it('returns empty list when service has no rows', async () => {
      const { controller, svc } = buildController();
      svc.list.mockResolvedValue([]);
      const result = await controller.list(makeListQuery());
      expect(result).toEqual({ items: [], total: 0 });
      expect(svc.list).toHaveBeenCalledWith(ORG, {
        state: undefined,
        limit: 50,
        offset: 0,
      });
    });

    it('forwards state filter to service', async () => {
      const { controller, svc } = buildController();
      svc.list.mockResolvedValue([]);
      await controller.list(makeListQuery({ state: 'abierta' }));
      expect(svc.list).toHaveBeenCalledWith(ORG, {
        state: 'abierta',
        limit: 50,
        offset: 0,
      });
    });

    it('maps rows to DTO with ISO date strings', async () => {
      const { controller, svc } = buildController();
      svc.list.mockResolvedValue([
        makeRecon({
          state: 'aceptada',
          resolvedAt: new Date('2026-05-18T11:00:00Z'),
          resolvedByUserId: USER,
          resolutionNotes: 'looks fine',
        }),
      ]);
      const result = await controller.list(makeListQuery());
      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        id: ID,
        poNumber: 'PO-2026-0001',
        discrepancyType: 'cantidad',
        state: 'aceptada',
        resolvedAt: '2026-05-18T11:00:00.000Z',
        resolvedByUserId: USER,
        resolutionNotes: 'looks fine',
        createdAt: '2026-05-18T10:00:00.000Z',
      });
      expect(result.items[0].diff).toEqual({
        expectedQty: 100,
        actualQty: 120,
        unit: 'kg',
      });
    });

    it('passes through organizationId from query DTO (multi-tenant gate)', async () => {
      const { controller, svc } = buildController();
      svc.list.mockResolvedValue([]);
      const other = '22222222-2222-4222-8222-222222222222';
      await controller.list(makeListQuery({ organizationId: other }));
      expect(svc.list).toHaveBeenCalledWith(other, expect.any(Object));
    });

    it('respects custom limit/offset', async () => {
      const { controller, svc } = buildController();
      svc.list.mockResolvedValue([]);
      await controller.list(makeListQuery({ limit: 10, offset: 20 }));
      expect(svc.list).toHaveBeenCalledWith(ORG, {
        state: undefined,
        limit: 10,
        offset: 20,
      });
    });
  });

  describe('POST /:id/resolve', () => {
    it('resolves successfully and returns updated DTO', async () => {
      const { controller, svc } = buildController();
      svc.resolve.mockResolvedValue(
        makeRecon({
          state: 'aceptada',
          resolvedAt: new Date('2026-05-18T11:00:00Z'),
          resolvedByUserId: USER,
          resolutionNotes: 'ok',
        }),
      );
      const result = await controller.resolve(
        ID,
        makeResolveBody({ state: 'aceptada', notes: 'ok' }),
        makeReq(),
      );
      expect(result.state).toBe('aceptada');
      expect(result.resolutionNotes).toBe('ok');
      expect(svc.resolve).toHaveBeenCalledWith(
        ID,
        ORG,
        { state: 'aceptada', notes: 'ok' },
        USER,
      );
    });

    it('passes null notes when body has no notes field', async () => {
      const { controller, svc } = buildController();
      svc.resolve.mockResolvedValue(
        makeRecon({ state: 'devuelta', resolvedAt: new Date(), resolvedByUserId: USER }),
      );
      await controller.resolve(
        ID,
        makeResolveBody({ state: 'devuelta' }),
        makeReq(),
      );
      expect(svc.resolve).toHaveBeenCalledWith(
        ID,
        ORG,
        { state: 'devuelta', notes: null },
        USER,
      );
    });

    it('stamps userId from req.user (audit attribution)', async () => {
      const { controller, svc } = buildController();
      svc.resolve.mockResolvedValue(
        makeRecon({ state: 'nota-credito', resolvedAt: new Date(), resolvedByUserId: 'other-user' }),
      );
      await controller.resolve(
        ID,
        makeResolveBody({ state: 'nota-credito' }),
        makeReq({ userId: 'other-user' }),
      );
      expect(svc.resolve).toHaveBeenCalledWith(
        ID,
        ORG,
        expect.any(Object),
        'other-user',
      );
    });

    it('throws UnauthorizedException when req.user is missing', async () => {
      const { controller, svc } = buildController();
      const req = {} as Request;
      await expect(
        controller.resolve(ID, makeResolveBody(), req),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(svc.resolve).not.toHaveBeenCalled();
    });

    it('maps ReconciliationNotFoundError → 404 NotFoundException', async () => {
      const { controller, svc } = buildController();
      svc.resolve.mockRejectedValue(new ReconciliationNotFoundError(ID));
      await expect(
        controller.resolve(ID, makeResolveBody(), makeReq()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps IllegalReconciliationTransition → 400 BadRequestException', async () => {
      const { controller, svc } = buildController();
      svc.resolve.mockRejectedValue(
        new IllegalReconciliationTransition('aceptada', 'devuelta'),
      );
      await expect(
        controller.resolve(ID, makeResolveBody({ state: 'devuelta' }), makeReq()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps ReconciliationInvariantError → 400 BadRequestException', async () => {
      const { controller, svc } = buildController();
      svc.resolve.mockRejectedValue(
        new ReconciliationInvariantError('notes too long'),
      );
      await expect(
        controller.resolve(ID, makeResolveBody(), makeReq()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rethrows unexpected errors (does not swallow)', async () => {
      const { controller, svc } = buildController();
      const boom = new Error('db connection lost');
      svc.resolve.mockRejectedValue(boom);
      await expect(
        controller.resolve(ID, makeResolveBody(), makeReq()),
      ).rejects.toBe(boom);
    });
  });
});
