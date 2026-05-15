import { randomUUID } from 'node:crypto';
import {
  AuditLogIntHarness,
  createAuditLogIntHarness,
} from './__helpers__/audit-log-int-harness';
import { AuditEventEnvelope, AuditEventType } from './types';

/**
 * INT spec — deferred-run-pending-docker. Verifies multi-tenant
 * isolation of the AuditLogSubscriber under concurrent emit.
 *
 * Covers AC-INT-2: events emitted for org A MUST never persist for org
 * B, even when concurrent emits fire on the same channel with
 * overlapping aggregate UUIDs.
 */
describe('AuditLogSubscriber multi-tenant isolation (integration)', () => {
  let harness: AuditLogIntHarness;

  beforeAll(async () => {
    harness = await createAuditLogIntHarness();
  });

  afterAll(async () => {
    await harness?.dataSource?.destroy();
    await harness?.app?.close();
  });

  beforeEach(async () => {
    await harness.truncate();
  });

  describe('two-org concurrent emit', () => {
    it('orgs A + B each emit RECIPE_INGREDIENT_UPDATED concurrently → rows are isolated', async () => {
      const orgA = await harness.seedOrg();
      const orgB = await harness.seedOrg();
      const envA: AuditEventEnvelope = {
        organizationId: orgA,
        aggregateType: 'recipe',
        aggregateId: randomUUID(),
        actorUserId: 'user-A',
        actorKind: 'user',
        payloadAfter: { side: 'A' },
      };
      const envB: AuditEventEnvelope = {
        organizationId: orgB,
        aggregateType: 'recipe',
        aggregateId: randomUUID(),
        actorUserId: 'user-B',
        actorKind: 'user',
        payloadAfter: { side: 'B' },
      };

      await Promise.all([
        harness.emitAndWait(AuditEventType.RECIPE_INGREDIENT_UPDATED, envA),
        harness.emitAndWait(AuditEventType.RECIPE_INGREDIENT_UPDATED, envB),
      ]);

      const rowsA = await harness.fetchRows(orgA);
      const rowsB = await harness.fetchRows(orgB);
      expect(rowsA).toHaveLength(1);
      expect(rowsB).toHaveLength(1);
      expect(rowsA[0].organizationId).toBe(orgA);
      expect(rowsB[0].organizationId).toBe(orgB);
      expect((rowsA[0].payloadAfter as { side: string }).side).toBe('A');
      expect((rowsB[0].payloadAfter as { side: string }).side).toBe('B');
    });

    it('same aggregateId UUID across orgs A + B → two distinct rows persist', async () => {
      const orgA = await harness.seedOrg();
      const orgB = await harness.seedOrg();
      const sharedAggregateId = randomUUID();
      const envA: AuditEventEnvelope = {
        organizationId: orgA,
        aggregateType: 'recipe',
        aggregateId: sharedAggregateId,
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { tenant: 'A' },
      };
      const envB: AuditEventEnvelope = {
        organizationId: orgB,
        aggregateType: 'recipe',
        aggregateId: sharedAggregateId,
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { tenant: 'B' },
      };

      await Promise.all([
        harness.emitAndWait(AuditEventType.RECIPE_INGREDIENT_UPDATED, envA),
        harness.emitAndWait(AuditEventType.RECIPE_INGREDIENT_UPDATED, envB),
      ]);

      const rowsA = await harness.fetchRows(orgA);
      const rowsB = await harness.fetchRows(orgB);
      expect(rowsA).toHaveLength(1);
      expect(rowsB).toHaveLength(1);
      // Aggregate id is shared but rows are isolated by organization_id.
      expect(rowsA[0].aggregateId).toBe(sharedAggregateId);
      expect(rowsB[0].aggregateId).toBe(sharedAggregateId);
      expect(rowsA[0].organizationId).not.toBe(rowsB[0].organizationId);
    });
  });

  describe('10-org concurrent fan-out', () => {
    it('10 orgs × 5 events concurrent → 50 rows total, 5 per org, no cross-leak', async () => {
      const ORG_COUNT = 10;
      const EVENTS_PER_ORG = 5;
      const orgs: string[] = [];
      for (let i = 0; i < ORG_COUNT; i++) {
        orgs.push(await harness.seedOrg());
      }

      const emits: Promise<void>[] = [];
      for (const org of orgs) {
        for (let i = 0; i < EVENTS_PER_ORG; i++) {
          const envelope: AuditEventEnvelope = {
            organizationId: org,
            aggregateType: 'recipe',
            aggregateId: randomUUID(),
            actorUserId: null,
            actorKind: 'system',
            payloadAfter: { org, index: i },
          };
          emits.push(
            harness.emitAndWait(
              AuditEventType.INGREDIENT_OVERRIDE_CHANGED,
              envelope,
            ),
          );
        }
      }

      await Promise.all(emits);

      // Total row count = 50.
      const total = await harness.dataSource.query(
        'SELECT count(*)::int AS c FROM "audit_log"',
      );
      expect(total[0].c).toBe(ORG_COUNT * EVENTS_PER_ORG);

      // Per-org partition: 5 rows each, no row carries the wrong org.
      for (const org of orgs) {
        const rows = await harness.fetchRows(org);
        expect(rows).toHaveLength(EVENTS_PER_ORG);
        for (const row of rows) {
          expect(row.organizationId).toBe(org);
        }
      }
    });
  });

  describe('cross-tenant read isolation', () => {
    it('a fetch scoped to one org does NOT return another org rows', async () => {
      const orgA = await harness.seedOrg();
      const orgB = await harness.seedOrg();

      for (let i = 0; i < 3; i++) {
        await harness.emitAndWait(AuditEventType.INGREDIENT_OVERRIDE_CHANGED, {
          organizationId: orgA,
          aggregateType: 'ingredient',
          aggregateId: randomUUID(),
          actorUserId: null,
          actorKind: 'system',
          payloadAfter: { idx: i, side: 'A' },
        } satisfies AuditEventEnvelope);
      }
      for (let i = 0; i < 2; i++) {
        await harness.emitAndWait(AuditEventType.INGREDIENT_OVERRIDE_CHANGED, {
          organizationId: orgB,
          aggregateType: 'ingredient',
          aggregateId: randomUUID(),
          actorUserId: null,
          actorKind: 'system',
          payloadAfter: { idx: i, side: 'B' },
        } satisfies AuditEventEnvelope);
      }

      const rowsA = await harness.fetchRows(orgA);
      const rowsB = await harness.fetchRows(orgB);
      expect(rowsA).toHaveLength(3);
      expect(rowsB).toHaveLength(2);
      for (const row of rowsA) {
        expect((row.payloadAfter as { side: string }).side).toBe('A');
      }
      for (const row of rowsB) {
        expect((row.payloadAfter as { side: string }).side).toBe('B');
      }
    });
  });
});
