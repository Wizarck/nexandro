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
  const ctrl = new IngestionController(
    ingestion as unknown as IngestionService,
    signService as unknown as HitlSignService,
    queue as unknown as HitlQueueQuery,
    repo as unknown as IngestionItemRepository,
    events,
  );
  return { ctrl, ingestion, signService, queue, repo, events };
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

  it.each([
    'ingest',
    'list',
    'getItem',
    'sign',
    'reclassify',
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
