import 'reflect-metadata';
import { AuditLogService } from '../../audit-log/application/audit-log.service';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import { DownstreamRevocationRepository } from './downstream-revocation.repository';
import { DownstreamRevocationSubscriber } from './downstream-revocation.subscriber';

const ORG = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const LOT_A = '33333333-3333-4333-8333-333333333333';
const LOT_B = '44444444-4444-4444-8444-444444444444';
const GR_A = '55555555-5555-4555-8555-555555555555';

function buildSubscriber() {
  const repo = {
    flagLotsBySourcePhotoIngestion: jest.fn(),
    flagGoodsReceiptsBySourcePhotoIngestion: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<
      DownstreamRevocationRepository,
      'flagLotsBySourcePhotoIngestion' | 'flagGoodsReceiptsBySourcePhotoIngestion'
    >
  >;
  const auditLog = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Pick<AuditLogService, 'record'>>;
  const subscriber = new DownstreamRevocationSubscriber(
    repo as unknown as DownstreamRevocationRepository,
    auditLog as unknown as AuditLogService,
  );
  return { subscriber, repo, auditLog };
}

function envelope(overrides: Partial<AuditEventEnvelope> = {}): AuditEventEnvelope {
  return {
    organizationId: ORG,
    aggregateType: 'photo_ingestion_item',
    aggregateId: ITEM,
    actorUserId: 'user-1',
    actorKind: 'user',
    payloadAfter: { operatorCorrection: {}, correctionsHistoryLength: 1 },
    ...overrides,
  };
}

describe('DownstreamRevocationSubscriber.onHitlRetroactiveCorrection', () => {
  it('1 lot match: records one LOT_FLAGGED_FOR_REVIEW envelope with aggregateType=lot', async () => {
    const { subscriber, repo, auditLog } = buildSubscriber();
    repo.flagLotsBySourcePhotoIngestion.mockResolvedValue({
      columnExists: true,
      flaggedRowIds: [LOT_A],
    });
    repo.flagGoodsReceiptsBySourcePhotoIngestion.mockResolvedValue({
      columnExists: true,
      flaggedRowIds: [],
    });

    await subscriber.onHitlRetroactiveCorrection(envelope());

    expect(repo.flagLotsBySourcePhotoIngestion).toHaveBeenCalledWith(ORG, ITEM);
    expect(repo.flagGoodsReceiptsBySourcePhotoIngestion).toHaveBeenCalledWith(
      ORG,
      ITEM,
    );

    const flaggedCalls = auditLog.record.mock.calls.filter(
      ([ch]) => ch === AuditEventType.LOT_FLAGGED_FOR_REVIEW,
    );
    expect(flaggedCalls).toHaveLength(1);
    const env = flaggedCalls[0]![1] as AuditEventEnvelope;
    expect(env.aggregateType).toBe('lot');
    expect(env.aggregateId).toBe(LOT_A);
    expect(env.actorKind).toBe('system');
    expect((env.payloadAfter as Record<string, unknown>).requiresReview).toBe(true);
    expect(
      (env.payloadAfter as Record<string, unknown>).sourcePhotoIngestionItemId,
    ).toBe(ITEM);

    expect(
      auditLog.record.mock.calls.some(
        ([ch]) => ch === AuditEventType.GR_FLAGGED_FOR_REVIEW,
      ),
    ).toBe(false);
    expect(
      auditLog.record.mock.calls.some(
        ([ch]) => ch === AuditEventType.DOWNSTREAM_REVOCATION_DEFERRED,
      ),
    ).toBe(false);
  });

  it('1 GR match: records one GR_FLAGGED_FOR_REVIEW with aggregateType=goods_receipt', async () => {
    const { subscriber, repo, auditLog } = buildSubscriber();
    repo.flagLotsBySourcePhotoIngestion.mockResolvedValue({
      columnExists: true,
      flaggedRowIds: [],
    });
    repo.flagGoodsReceiptsBySourcePhotoIngestion.mockResolvedValue({
      columnExists: true,
      flaggedRowIds: [GR_A],
    });

    await subscriber.onHitlRetroactiveCorrection(envelope());

    const grCalls = auditLog.record.mock.calls.filter(
      ([ch]) => ch === AuditEventType.GR_FLAGGED_FOR_REVIEW,
    );
    expect(grCalls).toHaveLength(1);
    const env = grCalls[0]![1] as AuditEventEnvelope;
    expect(env.aggregateType).toBe('goods_receipt');
    expect(env.aggregateId).toBe(GR_A);
  });

  it('both lots AND GR match: records one envelope per matched row across both kinds', async () => {
    const { subscriber, repo, auditLog } = buildSubscriber();
    repo.flagLotsBySourcePhotoIngestion.mockResolvedValue({
      columnExists: true,
      flaggedRowIds: [LOT_A, LOT_B],
    });
    repo.flagGoodsReceiptsBySourcePhotoIngestion.mockResolvedValue({
      columnExists: true,
      flaggedRowIds: [GR_A],
    });

    await subscriber.onHitlRetroactiveCorrection(envelope());

    expect(
      auditLog.record.mock.calls.filter(
        ([ch]) => ch === AuditEventType.LOT_FLAGGED_FOR_REVIEW,
      ),
    ).toHaveLength(2);
    expect(
      auditLog.record.mock.calls.filter(
        ([ch]) => ch === AuditEventType.GR_FLAGGED_FOR_REVIEW,
      ),
    ).toHaveLength(1);
  });

  it('no matches: no envelopes recorded (both probes return empty)', async () => {
    const { subscriber, repo, auditLog } = buildSubscriber();
    repo.flagLotsBySourcePhotoIngestion.mockResolvedValue({
      columnExists: true,
      flaggedRowIds: [],
    });
    repo.flagGoodsReceiptsBySourcePhotoIngestion.mockResolvedValue({
      columnExists: true,
      flaggedRowIds: [],
    });

    await subscriber.onHitlRetroactiveCorrection(envelope());

    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('lots column missing: short-circuits with DOWNSTREAM_REVOCATION_DEFERRED, never probes GR', async () => {
    const { subscriber, repo, auditLog } = buildSubscriber();
    repo.flagLotsBySourcePhotoIngestion.mockResolvedValue({
      columnExists: false,
    });

    await subscriber.onHitlRetroactiveCorrection(envelope());

    expect(repo.flagGoodsReceiptsBySourcePhotoIngestion).not.toHaveBeenCalled();
    const deferredCalls = auditLog.record.mock.calls.filter(
      ([ch]) => ch === AuditEventType.DOWNSTREAM_REVOCATION_DEFERRED,
    );
    expect(deferredCalls).toHaveLength(1);
    const env = deferredCalls[0]![1] as AuditEventEnvelope;
    expect(env.aggregateType).toBe('photo_ingestion_item');
    expect(env.aggregateId).toBe(ITEM);
    expect((env.payloadAfter as Record<string, unknown>).reason).toBe(
      'lots:column-missing',
    );
  });

  it('GR column missing (after lots OK): records DOWNSTREAM_REVOCATION_DEFERRED with goods_receipts reason', async () => {
    const { subscriber, repo, auditLog } = buildSubscriber();
    repo.flagLotsBySourcePhotoIngestion.mockResolvedValue({
      columnExists: true,
      flaggedRowIds: [],
    });
    repo.flagGoodsReceiptsBySourcePhotoIngestion.mockResolvedValue({
      columnExists: false,
    });

    await subscriber.onHitlRetroactiveCorrection(envelope());

    const deferredCalls = auditLog.record.mock.calls.filter(
      ([ch]) => ch === AuditEventType.DOWNSTREAM_REVOCATION_DEFERRED,
    );
    expect(deferredCalls).toHaveLength(1);
    expect(
      (deferredCalls[0]![1] as AuditEventEnvelope).payloadAfter,
    ).toMatchObject({ reason: 'goods_receipts:column-missing' });
  });

  it('invalid envelope shape: skipped without probing the repo', async () => {
    const { subscriber, repo, auditLog } = buildSubscriber();
    await subscriber.onHitlRetroactiveCorrection(
      undefined as unknown as AuditEventEnvelope,
    );
    await subscriber.onHitlRetroactiveCorrection({
      organizationId: 1 as unknown as string,
      aggregateType: 'photo_ingestion_item',
      aggregateId: ITEM,
      actorUserId: null,
      actorKind: 'system',
    });
    expect(repo.flagLotsBySourcePhotoIngestion).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('repository throw: error logged, never propagates', async () => {
    const { subscriber, repo } = buildSubscriber();
    repo.flagLotsBySourcePhotoIngestion.mockRejectedValue(new Error('boom'));
    await expect(
      subscriber.onHitlRetroactiveCorrection(envelope()),
    ).resolves.toBeUndefined();
  });

  it('audit-log record throw: error is logged, handler continues, no propagation', async () => {
    // Simulates a regulatory strict-mode rethrow inside AuditLogService.record
    // (cf. m3.x-audit-log-subscriber-strict-mode, PR #169). The
    // DownstreamRevocationSubscriber must catch + log + continue so a single
    // audit-write failure cannot abort the wider downstream-revocation flow.
    const { subscriber, repo, auditLog } = buildSubscriber();
    repo.flagLotsBySourcePhotoIngestion.mockResolvedValue({
      columnExists: true,
      flaggedRowIds: [LOT_A, LOT_B],
    });
    repo.flagGoodsReceiptsBySourcePhotoIngestion.mockResolvedValue({
      columnExists: true,
      flaggedRowIds: [GR_A],
    });
    auditLog.record.mockImplementation(async (eventType: string) => {
      if (eventType === AuditEventType.LOT_FLAGGED_FOR_REVIEW) {
        throw new Error('hash-chain-broken');
      }
      return undefined as never;
    });
    const errorSpy = jest
      .spyOn(
        (subscriber as unknown as { logger: { error: (m: string) => void } })
          .logger,
        'error',
      )
      .mockImplementation(() => undefined);

    await expect(
      subscriber.onHitlRetroactiveCorrection(envelope()),
    ).resolves.toBeUndefined();

    // The handler progressed: GR was still recorded after the lot failures.
    expect(
      auditLog.record.mock.calls.filter(
        ([ch]) => ch === AuditEventType.GR_FLAGGED_FOR_REVIEW,
      ),
    ).toHaveLength(1);
    // Each failing lot call surfaced an ERROR log.
    const lotErrorLogs = errorSpy.mock.calls.filter(([msg]) =>
      typeof msg === 'string'
        ? msg.includes('audit-record.failed:') &&
          msg.includes(AuditEventType.LOT_FLAGGED_FOR_REVIEW)
        : false,
    );
    expect(lotErrorLogs.length).toBe(2);
  });
});
