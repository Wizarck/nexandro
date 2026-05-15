import { randomUUID } from 'node:crypto';
import {
  AuditLogIntHarness,
  createAuditLogIntHarness,
} from './__helpers__/audit-log-int-harness';
import { AuditEventEnvelope, AuditEventType } from './types';

/**
 * INT spec — deferred-run-pending-docker. Verifies the LRU idempotency
 * dedup behaviour wired into AuditLogService.record() against a real
 * Postgres + EventEmitter2.
 *
 * Covers AC-INT-4: emitting the same envelope twice within the TTL
 * window results in ONE row, not two; payload divergence or
 * correlation_id divergence breaks dedup; capacity stays bounded under
 * a > 10K-emit smoke run.
 */
describe('AuditLogSubscriber idempotency LRU dedup (integration)', () => {
  let harness: AuditLogIntHarness;
  let orgId: string;

  beforeAll(async () => {
    harness = await createAuditLogIntHarness();
  });

  afterAll(async () => {
    await harness?.dataSource?.destroy();
    await harness?.app?.close();
  });

  beforeEach(async () => {
    await harness.truncate();
    orgId = await harness.seedOrg();
  });

  describe('dedup of identical envelope', () => {
    it('same envelope emitted twice → one row persists', async () => {
      const aggregateId = randomUUID();
      const envelope: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId,
        actorUserId: 'user-1',
        actorKind: 'user',
        payloadAfter: { allergens: ['gluten'], correlation_id: 'fixed-corr-1' },
      };

      await harness.emitAndWait(
        AuditEventType.INGREDIENT_OVERRIDE_CHANGED,
        envelope,
      );
      await harness.emitAndWait(
        AuditEventType.INGREDIENT_OVERRIDE_CHANGED,
        envelope,
      );

      const rows = await harness.fetchRows(orgId);
      expect(rows).toHaveLength(1);
    });
  });

  describe('dedup-break on payload divergence', () => {
    it('same eventType + aggregateId but different payload_after → two rows', async () => {
      const aggregateId = randomUUID();
      const envA: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId,
        actorUserId: 'user-1',
        actorKind: 'user',
        payloadAfter: { allergens: ['gluten'] },
      };
      const envB: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId,
        actorUserId: 'user-1',
        actorKind: 'user',
        payloadAfter: { allergens: ['lactose'] },
      };

      await harness.emitAndWait(
        AuditEventType.INGREDIENT_OVERRIDE_CHANGED,
        envA,
      );
      await harness.emitAndWait(
        AuditEventType.INGREDIENT_OVERRIDE_CHANGED,
        envB,
      );

      const rows = await harness.fetchRows(orgId);
      expect(rows).toHaveLength(2);
    });
  });

  describe('dedup-break on correlation_id divergence', () => {
    it('same envelope content but different correlation_id → two rows', async () => {
      const aggregateId = randomUUID();
      const basePayload = { allergens: ['gluten'] };
      const envA: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId,
        actorUserId: 'user-1',
        actorKind: 'user',
        payloadAfter: { ...basePayload, correlation_id: 'corr-A' },
      };
      const envB: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId,
        actorUserId: 'user-1',
        actorKind: 'user',
        payloadAfter: { ...basePayload, correlation_id: 'corr-B' },
      };

      await harness.emitAndWait(
        AuditEventType.INGREDIENT_OVERRIDE_CHANGED,
        envA,
      );
      await harness.emitAndWait(
        AuditEventType.INGREDIENT_OVERRIDE_CHANGED,
        envB,
      );

      const rows = await harness.fetchRows(orgId);
      expect(rows).toHaveLength(2);
    });
  });

  describe('capacity bound (LRU eviction smoke)', () => {
    it(
      'emitting > 10K distinct envelopes keeps cache size ≤ 10K but persists every row',
      async () => {
        const CAPACITY = 10_000;
        const EXTRA = 5;
        for (let i = 0; i < CAPACITY + EXTRA; i++) {
          await harness.emitAndWait(
            AuditEventType.INGREDIENT_OVERRIDE_CHANGED,
            {
              organizationId: orgId,
              aggregateType: 'recipe',
              aggregateId: randomUUID(),
              actorUserId: null,
              actorKind: 'system',
              payloadAfter: { idx: i },
            } satisfies AuditEventEnvelope,
          );
        }

        expect(harness.cache.size()).toBeLessThanOrEqual(CAPACITY);
        const total = await harness.dataSource.query(
          'SELECT count(*)::int AS c FROM "audit_log"',
        );
        expect(total[0].c).toBe(CAPACITY + EXTRA);
      },
      300_000,
    );
  });
});
