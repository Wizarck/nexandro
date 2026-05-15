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
/**
 * Root cause of the original H2a skip: actor_user_id is a UUID-typed
 * column; the test fixture passed `'user-1'` (a non-UUID string) which
 * Postgres rejects, and the subscriber's try/catch silently swallowed the
 * error per ADR-AUDIT-WRITER, producing 0 persisted rows. Fixed by using
 * UUID literals for all actor identifiers.
 */
const TEST_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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
    // Un-skipped by `m3.x-audit-log-idempotency-cache-injection`. The original
    // skip-comment correctly identified `@Optional()` resolving to null but
    // attributed it to a TestingModule isolation quirk. Real cause was the
    // missing explicit `@Inject(AuditLogIdempotencyCache)` on the union-typed
    // parameter — TypeScript emits `design:paramtypes` as `Object` for
    // nullable unions, so DI never looked up the cache token. Fix in
    // audit-log.service.ts.
    it('same envelope emitted twice → one row persists', async () => {
      const aggregateId = randomUUID();
      const envelope: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId,
        actorUserId: TEST_USER_ID,
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
        actorUserId: TEST_USER_ID,
        actorKind: 'user',
        payloadAfter: { allergens: ['gluten'] },
      };
      const envB: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId,
        actorUserId: TEST_USER_ID,
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
        actorUserId: TEST_USER_ID,
        actorKind: 'user',
        payloadAfter: { ...basePayload, correlation_id: 'corr-A' },
      };
      const envB: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId,
        actorUserId: TEST_USER_ID,
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
