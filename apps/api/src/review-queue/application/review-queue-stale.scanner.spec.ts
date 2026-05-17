import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReviewQueueRepository } from './review-queue.repository';
import { ReviewQueueStaleScanner } from './review-queue-stale.scanner';
import { AuditEventType } from '../../audit-log/application/types';
import {
  REVIEW_QUEUE_STALE_DEFAULT_THRESHOLD_DAYS,
  REVIEW_QUEUE_STALE_MAX_ROWS_PER_ORG,
} from './types';

const ORG_A = '55555555-5555-4555-8555-555555555555';
const ORG_B = '66666666-6666-4666-8666-666666666666';

interface ScannerHarness {
  scanner: ReviewQueueStaleScanner;
  repo: jest.Mocked<Pick<ReviewQueueRepository, 'findStaleAggregatesGroupedByOrg'>>;
  emitter: jest.Mocked<Pick<EventEmitter2, 'emitAsync'>>;
}

function buildScanner(): ScannerHarness {
  const repo = {
    findStaleAggregatesGroupedByOrg: jest.fn(),
  };
  const emitter = {
    emitAsync: jest.fn().mockResolvedValue([]),
  };
  const scanner = new ReviewQueueStaleScanner(
    repo as unknown as ReviewQueueRepository,
    emitter as unknown as EventEmitter2,
  );
  return {
    scanner,
    repo: repo as ScannerHarness['repo'],
    emitter: emitter as ScannerHarness['emitter'],
  };
}

describe('ReviewQueueStaleScanner.runTick', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.clearAllMocks();
  });

  it('short-circuits when NEXANDRO_REVIEW_QUEUE_STALE_NOTIFIER_ENABLED !== "true"', async () => {
    const { scanner, repo, emitter } = buildScanner();
    delete process.env.NEXANDRO_REVIEW_QUEUE_STALE_NOTIFIER_ENABLED;
    await scanner.runTick();
    expect(repo.findStaleAggregatesGroupedByOrg).not.toHaveBeenCalled();
    expect(emitter.emitAsync).not.toHaveBeenCalled();
  });

  it('reads REVIEW_QUEUE_STALE_THRESHOLD_DAYS from env when set to a valid positive integer', async () => {
    const { scanner, repo } = buildScanner();
    process.env.NEXANDRO_REVIEW_QUEUE_STALE_NOTIFIER_ENABLED = 'true';
    process.env.REVIEW_QUEUE_STALE_THRESHOLD_DAYS = '14';
    repo.findStaleAggregatesGroupedByOrg.mockResolvedValueOnce([]);
    await scanner.runTick();
    expect(repo.findStaleAggregatesGroupedByOrg).toHaveBeenCalledWith(14);
  });

  it('falls back to the default threshold when the env var is malformed', async () => {
    const { scanner, repo } = buildScanner();
    process.env.NEXANDRO_REVIEW_QUEUE_STALE_NOTIFIER_ENABLED = 'true';
    process.env.REVIEW_QUEUE_STALE_THRESHOLD_DAYS = 'abc';
    repo.findStaleAggregatesGroupedByOrg.mockResolvedValueOnce([]);
    await scanner.runTick();
    expect(repo.findStaleAggregatesGroupedByOrg).toHaveBeenCalledWith(
      REVIEW_QUEUE_STALE_DEFAULT_THRESHOLD_DAYS,
    );
  });

  it('swallows + logs when the repository throws so the next tick re-runs', async () => {
    const { scanner, repo, emitter } = buildScanner();
    process.env.NEXANDRO_REVIEW_QUEUE_STALE_NOTIFIER_ENABLED = 'true';
    repo.findStaleAggregatesGroupedByOrg.mockRejectedValueOnce(
      new Error('DB outage'),
    );
    // Should NOT throw — the scheduler's tick handler swallows logged errors.
    await expect(scanner.runTick()).resolves.toBeUndefined();
    expect(emitter.emitAsync).not.toHaveBeenCalled();
  });
});

describe('ReviewQueueStaleScanner.scanAndEmit', () => {
  afterEach(() => jest.clearAllMocks());

  it('emits one REVIEW_QUEUE_STALE_AGGREGATES envelope per organization with the expected shape', async () => {
    const { scanner, repo, emitter } = buildScanner();
    repo.findStaleAggregatesGroupedByOrg.mockResolvedValueOnce([
      {
        organizationId: ORG_A,
        rows: [
          {
            aggregateType: 'lot',
            aggregateId: 'lot-a-1',
            sourcePhotoIngestionId: 'phx-1',
            flaggedAt: '2026-05-01T08:00:00.000Z',
          },
          {
            aggregateType: 'goods_receipt',
            aggregateId: 'gr-a-1',
            sourcePhotoIngestionId: 'phx-2',
            flaggedAt: '2026-05-02T08:00:00.000Z',
          },
        ],
      },
      {
        organizationId: ORG_B,
        rows: [
          {
            aggregateType: 'lot',
            aggregateId: 'lot-b-1',
            sourcePhotoIngestionId: null,
            flaggedAt: '2026-05-03T08:00:00.000Z',
          },
        ],
      },
    ]);

    const grouped = await scanner.scanAndEmit(7);

    expect(grouped).toHaveLength(2);
    expect(emitter.emitAsync).toHaveBeenCalledTimes(2);
    // First call → ORG_A.
    const [channelA, envelopeA] = emitter.emitAsync.mock.calls[0]!;
    expect(channelA).toBe(AuditEventType.REVIEW_QUEUE_STALE_AGGREGATES);
    expect(envelopeA).toMatchObject({
      organizationId: ORG_A,
      aggregateType: 'organization',
      aggregateId: ORG_A,
      actorUserId: null,
      actorKind: 'system',
      payloadAfter: {
        thresholdDays: 7,
        staleCount: 2,
        truncated: false,
      },
    });
    // Second call → ORG_B with only 1 row.
    const [, envelopeB] = emitter.emitAsync.mock.calls[1]!;
    expect((envelopeB as { payloadAfter: { staleCount: number } }).payloadAfter.staleCount).toBe(1);
  });

  it('sets payload_after.truncated=true when the org has REVIEW_QUEUE_STALE_MAX_ROWS_PER_ORG rows', async () => {
    const { scanner, repo, emitter } = buildScanner();
    const rows = Array.from(
      { length: REVIEW_QUEUE_STALE_MAX_ROWS_PER_ORG },
      (_, i) => ({
        aggregateType: 'lot' as const,
        aggregateId: `lot-${i}`,
        sourcePhotoIngestionId: null,
        flaggedAt: `2026-05-0${(i % 9) + 1}T08:00:00.000Z`,
      }),
    );
    repo.findStaleAggregatesGroupedByOrg.mockResolvedValueOnce([
      { organizationId: ORG_A, rows },
    ]);

    await scanner.scanAndEmit(7);

    expect(emitter.emitAsync).toHaveBeenCalledTimes(1);
    const [, envelope] = emitter.emitAsync.mock.calls[0]!;
    const payload = (envelope as { payloadAfter: { truncated: boolean } })
      .payloadAfter;
    expect(payload.truncated).toBe(true);
  });

  it('continues to the next org when one emit throws (per-org resilience)', async () => {
    const { scanner, repo, emitter } = buildScanner();
    repo.findStaleAggregatesGroupedByOrg.mockResolvedValueOnce([
      {
        organizationId: ORG_A,
        rows: [
          {
            aggregateType: 'lot',
            aggregateId: 'lot-a',
            sourcePhotoIngestionId: null,
            flaggedAt: '2026-05-01T00:00:00.000Z',
          },
        ],
      },
      {
        organizationId: ORG_B,
        rows: [
          {
            aggregateType: 'lot',
            aggregateId: 'lot-b',
            sourcePhotoIngestionId: null,
            flaggedAt: '2026-05-01T00:00:00.000Z',
          },
        ],
      },
    ]);
    emitter.emitAsync
      .mockRejectedValueOnce(new Error('bus down for org A'))
      .mockResolvedValueOnce([]);

    await scanner.scanAndEmit(7);

    expect(emitter.emitAsync).toHaveBeenCalledTimes(2);
  });

  it('emits nothing when no organizations have stale rows', async () => {
    const { scanner, repo, emitter } = buildScanner();
    repo.findStaleAggregatesGroupedByOrg.mockResolvedValueOnce([]);
    const grouped = await scanner.scanAndEmit(7);
    expect(grouped).toEqual([]);
    expect(emitter.emitAsync).not.toHaveBeenCalled();
  });
});
