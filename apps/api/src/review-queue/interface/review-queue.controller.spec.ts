import 'reflect-metadata';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ROLES_METADATA_KEY } from '../../shared/decorators/roles.decorator';
import type { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import type { ReviewQueueService } from '../application/review-queue.service';
import { ReviewQueueController } from './review-queue.controller';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '99999999-9999-4999-8999-999999999999';
const LOT = '22222222-2222-4222-8222-222222222222';
const GR = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';

function fakeReq(user: AuthenticatedUserPayload | undefined): Request {
  return { user } as unknown as Request;
}

function buildCtrl() {
  const service = {
    listFlagged: jest.fn(),
    clearReview: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<ReviewQueueService, 'listFlagged' | 'clearReview'>
  >;
  const ctrl = new ReviewQueueController(
    service as unknown as ReviewQueueService,
  );
  return { ctrl, service };
}

describe('ReviewQueueController.list', () => {
  it('rejects unauthenticated callers', async () => {
    const { ctrl } = buildCtrl();
    await expect(
      ctrl.list({ organizationId: ORG }, fakeReq(undefined)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects cross-org callers', async () => {
    const { ctrl, service } = buildCtrl();
    await expect(
      ctrl.list(
        { organizationId: OTHER_ORG },
        fakeReq({ userId: USER, organizationId: ORG, role: 'MANAGER' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.listFlagged).not.toHaveBeenCalled();
  });

  it('forwards options to the service + returns the result', async () => {
    const { ctrl, service } = buildCtrl();
    (service.listFlagged as jest.Mock).mockResolvedValue({
      rows: [],
      truncated: false,
    });

    const result = await ctrl.list(
      { organizationId: ORG, aggregateType: 'lot', limit: 25 },
      fakeReq({ userId: USER, organizationId: ORG, role: 'OWNER' }),
    );

    expect(result).toEqual({ rows: [], truncated: false });
    expect(service.listFlagged).toHaveBeenCalledWith(ORG, {
      aggregateType: 'lot',
      limit: 25,
    });
  });
});

describe('ReviewQueueController.clear', () => {
  it('rejects bad aggregateType with 400 BadRequest (no service call)', async () => {
    const { ctrl, service } = buildCtrl();
    await expect(
      ctrl.clear(
        'recipe',
        LOT,
        { organizationId: ORG },
        fakeReq({ userId: USER, organizationId: ORG, role: 'MANAGER' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.clearReview).not.toHaveBeenCalled();
  });

  it('rejects cross-org body with 403 (no service call)', async () => {
    const { ctrl, service } = buildCtrl();
    await expect(
      ctrl.clear(
        'lot',
        LOT,
        { organizationId: OTHER_ORG },
        fakeReq({ userId: USER, organizationId: ORG, role: 'MANAGER' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.clearReview).not.toHaveBeenCalled();
  });

  it('clears a lot via the service with the authenticated user id as reviewer', async () => {
    const { ctrl, service } = buildCtrl();
    (service.clearReview as jest.Mock).mockResolvedValue({
      aggregateType: 'lot',
      aggregateId: LOT,
      cleared: true,
      alreadyClear: false,
    });

    const result = await ctrl.clear(
      'lot',
      LOT,
      { organizationId: ORG },
      fakeReq({ userId: USER, organizationId: ORG, role: 'MANAGER' }),
    );

    expect(result.cleared).toBe(true);
    expect(service.clearReview).toHaveBeenCalledWith(ORG, 'lot', LOT, USER);
  });

  it('clears a goods_receipt via the service', async () => {
    const { ctrl, service } = buildCtrl();
    (service.clearReview as jest.Mock).mockResolvedValue({
      aggregateType: 'goods_receipt',
      aggregateId: GR,
      cleared: true,
      alreadyClear: false,
    });

    await ctrl.clear(
      'goods_receipt',
      GR,
      { organizationId: ORG },
      fakeReq({ userId: USER, organizationId: ORG, role: 'OWNER' }),
    );

    expect(service.clearReview).toHaveBeenCalledWith(
      ORG,
      'goods_receipt',
      GR,
      USER,
    );
  });
});

describe('ReviewQueueController RBAC metadata', () => {
  it.each(['list', 'clear'])(
    '%s method carries @Roles("OWNER", "MANAGER") metadata',
    (method) => {
      const proto = ReviewQueueController.prototype as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >;
      const fn = proto[method];
      const roles = Reflect.getMetadata(ROLES_METADATA_KEY, fn) as
        | string[]
        | undefined;
      expect(roles).toBeDefined();
      expect(new Set(roles)).toEqual(new Set(['OWNER', 'MANAGER']));
    },
  );
});
