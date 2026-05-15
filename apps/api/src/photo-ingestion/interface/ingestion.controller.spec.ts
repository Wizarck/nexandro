import 'reflect-metadata';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request } from 'express';
import { ROLES_METADATA_KEY } from '../../shared/decorators/roles.decorator';
import type { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import type { HitlQueueQuery } from '../application/hitl-queue.query';
import type { HitlSignService } from '../application/hitl-sign.service';
import type { IngestionItemRepository } from '../application/ingestion-item.repository';
import type { IngestionService } from '../application/ingestion.service';
import type { RetroactiveCorrectionService } from '../application/retroactive-correction.service';
import {
  IngestionAlreadySignedError,
  IngestionPhotoNotFoundError,
  IngestionRejectBandFieldMissingError,
} from '../domain/errors';
import { IngestionController } from './ingestion.controller';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '99999999-9999-4999-8999-999999999999';
const ITEM = '33333333-3333-4333-8333-333333333333';
const PHOTO = '22222222-2222-4222-8222-222222222222';

function fakeReq(user: AuthenticatedUserPayload | undefined): Request {
  return { user } as unknown as Request;
}

function buildCtrl() {
  const ingestion = {
    ingest: jest.fn(),
  } as unknown as jest.Mocked<Pick<IngestionService, 'ingest'>>;
  const signService = {
    sign: jest.fn(),
  } as unknown as jest.Mocked<Pick<HitlSignService, 'sign'>>;
  const queue = {
    listAwaitingReview: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<Pick<HitlQueueQuery, 'listAwaitingReview'>>;
  const repo = {
    findById: jest.fn(),
    listByStatus: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<
    Pick<IngestionItemRepository, 'findById' | 'listByStatus'>
  >;
  const events = new EventEmitter2();
  const retroactive = {
    apply: jest.fn(),
  } as unknown as jest.Mocked<Pick<RetroactiveCorrectionService, 'apply'>>;
  const ctrl = new IngestionController(
    ingestion as unknown as IngestionService,
    signService as unknown as HitlSignService,
    queue as unknown as HitlQueueQuery,
    repo as unknown as IngestionItemRepository,
    retroactive as unknown as RetroactiveCorrectionService,
    events,
  );
  return { ctrl, ingestion, signService, queue, repo, retroactive, events };
}

describe('IngestionController', () => {
  it('ingest — rejects unauthenticated callers', async () => {
    const { ctrl } = buildCtrl();
    await expect(
      ctrl.ingest(
        {
          organizationId: ORG,
          photoId: PHOTO,
          kind: 'invoice',
        },
        fakeReq(undefined),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('ingest — rejects cross-org callers', async () => {
    const { ctrl } = buildCtrl();
    await expect(
      ctrl.ingest(
        {
          organizationId: OTHER_ORG,
          photoId: PHOTO,
          kind: 'invoice',
        },
        fakeReq({ userId: 'u', organizationId: ORG, role: 'OWNER' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ingest — maps IngestionPhotoNotFoundError to 404', async () => {
    const { ctrl, ingestion } = buildCtrl();
    (ingestion.ingest as jest.Mock).mockRejectedValue(
      new IngestionPhotoNotFoundError(PHOTO),
    );
    await expect(
      ctrl.ingest(
        {
          organizationId: ORG,
          photoId: PHOTO,
          kind: 'invoice',
        },
        fakeReq({ userId: 'u', organizationId: ORG, role: 'MANAGER' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ingest — defaults capability per kind', async () => {
    const { ctrl, ingestion } = buildCtrl();
    (ingestion.ingest as jest.Mock).mockResolvedValue({
      itemId: 'i',
      status: 'auto_filled',
      overallConfidence: 0.95,
    });
    await ctrl.ingest(
      { organizationId: ORG, photoId: PHOTO, kind: 'invoice' },
      fakeReq({ userId: 'u', organizationId: ORG, role: 'OWNER' }),
    );
    expect(ingestion.ingest).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ capability: 'inventory.ingest-invoice-photo' }),
    );
  });

  it('sign — maps IngestionRejectBandFieldMissingError to 422', async () => {
    const { ctrl, signService } = buildCtrl();
    (signService.sign as jest.Mock).mockRejectedValue(
      new IngestionRejectBandFieldMissingError('total_amount'),
    );
    await expect(
      ctrl.sign(
        ITEM,
        { organizationId: ORG, fieldCorrections: [] },
        fakeReq({ userId: 'u', organizationId: ORG, role: 'MANAGER' }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('sign — maps IngestionAlreadySignedError to 422', async () => {
    const { ctrl, signService } = buildCtrl();
    (signService.sign as jest.Mock).mockRejectedValue(
      new IngestionAlreadySignedError(ITEM),
    );
    await expect(
      ctrl.sign(
        ITEM,
        { organizationId: ORG, fieldCorrections: [] },
        fakeReq({ userId: 'u', organizationId: ORG, role: 'MANAGER' }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('getItem — 404 when not found', async () => {
    const { ctrl, repo } = buildCtrl();
    (repo.findById as jest.Mock).mockResolvedValue(null);
    await expect(
      ctrl.getItem(
        ITEM,
        { organizationId: ORG },
        fakeReq({ userId: 'u', organizationId: ORG, role: 'OWNER' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('retroactiveCorrection — forwards orgId/itemId/fieldCorrections + signer userId to service', async () => {
    const { ctrl, retroactive } = buildCtrl();
    (retroactive.apply as jest.Mock).mockResolvedValue({
      itemId: ITEM,
      status: 'signed',
      correctionsHistoryLength: 1,
      idempotent: false,
    });

    const result = await ctrl.retroactiveCorrection(
      ITEM,
      {
        organizationId: ORG,
        fieldCorrections: [{ name: 'qty', value: 18 }],
        reason: 'recount',
      },
      fakeReq({ userId: 'u-1', organizationId: ORG, role: 'MANAGER' }),
    );

    expect(result).toEqual({
      itemId: ITEM,
      status: 'signed',
      correctionsHistoryLength: 1,
      idempotent: false,
    });
    expect(retroactive.apply).toHaveBeenCalledWith(ORG, ITEM, {
      fieldCorrections: [{ name: 'qty', value: 18 }],
      correctedByUserId: 'u-1',
      reason: 'recount',
    });
  });

  it('retroactiveCorrection — cross-org body rejects with 403 ForbiddenException (no service call)', async () => {
    const { ctrl, retroactive } = buildCtrl();
    await expect(
      ctrl.retroactiveCorrection(
        ITEM,
        {
          organizationId: OTHER_ORG,
          fieldCorrections: [{ name: 'qty', value: 18 }],
        },
        fakeReq({ userId: 'u-1', organizationId: ORG, role: 'MANAGER' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(retroactive.apply).not.toHaveBeenCalled();
  });

  it('retroactiveCorrection — maps service errors: cross-tenant→404, not-correctable→422, empty-field→422', async () => {
    const { ctrl, retroactive } = buildCtrl();
    const { IngestionCrossTenantError, IngestionItemNotCorrectableError, IngestionCorrectionEmptyError } = await import('../domain/errors');

    (retroactive.apply as jest.Mock).mockRejectedValueOnce(
      new IngestionCrossTenantError(ITEM),
    );
    await expect(
      ctrl.retroactiveCorrection(
        ITEM,
        { organizationId: ORG, fieldCorrections: [{ name: 'qty', value: 1 }] },
        fakeReq({ userId: 'u-1', organizationId: ORG, role: 'MANAGER' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    (retroactive.apply as jest.Mock).mockRejectedValueOnce(
      new IngestionItemNotCorrectableError(ITEM, 'awaiting_review'),
    );
    await expect(
      ctrl.retroactiveCorrection(
        ITEM,
        { organizationId: ORG, fieldCorrections: [{ name: 'qty', value: 1 }] },
        fakeReq({ userId: 'u-1', organizationId: ORG, role: 'MANAGER' }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    (retroactive.apply as jest.Mock).mockRejectedValueOnce(
      new IngestionCorrectionEmptyError('qty'),
    );
    await expect(
      ctrl.retroactiveCorrection(
        ITEM,
        { organizationId: ORG, fieldCorrections: [{ name: 'qty', value: 1 }] },
        fakeReq({ userId: 'u-1', organizationId: ORG, role: 'MANAGER' }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it.each([
    'ingest',
    'list',
    'getItem',
    'sign',
    'reclassify',
    'retroactiveCorrection',
  ])('%s method carries @Roles("OWNER", "MANAGER") metadata', (method) => {
    const proto = IngestionController.prototype as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    const fn = proto[method];
    expect(typeof fn).toBe('function');
    const roles = Reflect.getMetadata(ROLES_METADATA_KEY, fn) as
      | string[]
      | undefined;
    expect(roles).toEqual(['OWNER', 'MANAGER']);
  });
});
