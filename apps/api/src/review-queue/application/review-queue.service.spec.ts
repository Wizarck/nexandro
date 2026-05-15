import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditEventType } from '../../audit-log/application/types';
import { ReviewQueueRepository } from './review-queue.repository';
import { ReviewQueueService } from './review-queue.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const LOT = '22222222-2222-4222-8222-222222222222';
const GR = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';
const PHOTO = '55555555-5555-4555-8555-555555555555';

function buildService() {
  const repo = {
    listFlagged: jest.fn(),
    clearLotReview: jest.fn(),
    clearGrReview: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<
      ReviewQueueRepository,
      'listFlagged' | 'clearLotReview' | 'clearGrReview'
    >
  >;
  const events = {
    emitAsync: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<Pick<EventEmitter2, 'emitAsync'>>;
  const service = new ReviewQueueService(
    repo as unknown as ReviewQueueRepository,
    events as unknown as EventEmitter2,
  );
  return { service, repo, events };
}

describe('ReviewQueueService.listFlagged', () => {
  it('delegates to repository with the supplied options', async () => {
    const { service, repo } = buildService();
    (repo.listFlagged as jest.Mock).mockResolvedValue({ rows: [], truncated: false });

    await service.listFlagged(ORG, { aggregateType: 'lot', limit: 25 });

    expect(repo.listFlagged).toHaveBeenCalledWith(ORG, {
      aggregateType: 'lot',
      limit: 25,
    });
  });
});

describe('ReviewQueueService.clearReview', () => {
  it('clearing a flagged Lot emits LOT_REVIEW_CLEARED envelope (regulatory)', async () => {
    const { service, repo, events } = buildService();
    (repo.clearLotReview as jest.Mock).mockResolvedValue({
      cleared: true,
      alreadyClear: false,
      sourcePhotoIngestionId: PHOTO,
    });

    const result = await service.clearReview(ORG, 'lot', LOT, USER);

    expect(result).toEqual({
      aggregateType: 'lot',
      aggregateId: LOT,
      cleared: true,
      alreadyClear: false,
    });
    expect(events.emitAsync).toHaveBeenCalledTimes(1);
    const [channel, envelope] = (events.emitAsync as jest.Mock).mock.calls[0]!;
    expect(channel).toBe(AuditEventType.LOT_REVIEW_CLEARED);
    expect(envelope).toMatchObject({
      organizationId: ORG,
      aggregateType: 'lot',
      aggregateId: LOT,
      actorUserId: USER,
      actorKind: 'user',
    });
    expect(envelope.payloadAfter).toMatchObject({
      reviewedByUserId: USER,
      sourcePhotoIngestionId: PHOTO,
    });
    expect(typeof envelope.payloadAfter.reviewedAt).toBe('string');
  });

  it('clearing a flagged GR emits GR_REVIEW_CLEARED envelope', async () => {
    const { service, repo, events } = buildService();
    (repo.clearGrReview as jest.Mock).mockResolvedValue({
      cleared: true,
      alreadyClear: false,
      sourcePhotoIngestionId: PHOTO,
    });

    await service.clearReview(ORG, 'goods_receipt', GR, USER);

    expect(repo.clearGrReview).toHaveBeenCalledWith(ORG, GR);
    expect(repo.clearLotReview).not.toHaveBeenCalled();
    const [channel] = (events.emitAsync as jest.Mock).mock.calls[0]!;
    expect(channel).toBe(AuditEventType.GR_REVIEW_CLEARED);
  });

  it('idempotent clear (alreadyClear:true) returns the no-op shape WITHOUT emitting an envelope', async () => {
    const { service, repo, events } = buildService();
    (repo.clearLotReview as jest.Mock).mockResolvedValue({
      cleared: true,
      alreadyClear: true,
      sourcePhotoIngestionId: null,
    });

    const result = await service.clearReview(ORG, 'lot', LOT, USER);

    expect(result.alreadyClear).toBe(true);
    expect(events.emitAsync).not.toHaveBeenCalled();
  });

  it('unknown aggregateType throws BadRequestException before touching the repository', async () => {
    const { service, repo, events } = buildService();
    await expect(
      service.clearReview(
        ORG,
        'recipe' as unknown as 'lot',
        LOT,
        USER,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.clearLotReview).not.toHaveBeenCalled();
    expect(repo.clearGrReview).not.toHaveBeenCalled();
    expect(events.emitAsync).not.toHaveBeenCalled();
  });
});
