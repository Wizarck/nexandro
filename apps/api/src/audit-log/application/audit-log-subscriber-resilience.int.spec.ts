import { randomUUID } from 'node:crypto';
import {
  AuditLogIntHarness,
  createAuditLogIntHarness,
} from './__helpers__/audit-log-int-harness';
import { AuditEventEnvelope, AuditEventType } from './types';

/**
 * INT spec — deferred-run-pending-docker. Verifies handler-level
 * try/catch swallowing per ADR-AUDIT-WRITER: a transient failure in
 * one handler MUST NOT propagate to the emitter or block subsequent
 * emissions.
 *
 * Covers AC-INT-5: translator throw is swallowed; DB write failure is
 * swallowed; validateEnvelope null skip is non-fatal.
 */
describe('AuditLogSubscriber resilience (integration)', () => {
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

  describe('translator throw scenario', () => {
    it('malformed GR_CONFIRMED payload → translator throws, emit resolves, no row, subsequent emit still succeeds', async () => {
      // First emit: malformed (missing organizationId AND grId — translator
      // throws).
      const malformedEmit = harness.emitAndWait(
        AuditEventType.GR_CONFIRMED,
        {},
      );
      // The emitter's promise MUST resolve (not reject) per ADR-AUDIT-WRITER.
      await expect(malformedEmit).resolves.toBeUndefined();

      // No row should have persisted from the malformed emit.
      let total = await harness.dataSource.query(
        'SELECT count(*)::int AS c FROM "audit_log"',
      );
      expect(total[0].c).toBe(0);

      // Second emit: well-formed → must succeed normally.
      const grId = randomUUID();
      await harness.emitAndWait(AuditEventType.GR_CONFIRMED, {
        grId,
        organizationId: orgId,
        receivedAt: new Date().toISOString(),
        lines: [],
      });
      const rows = await harness.fetchRows(orgId);
      expect(rows).toHaveLength(1);
      expect(rows[0].eventType).toBe('GR_CONFIRMED');
      expect(rows[0].aggregateId).toBe(grId);
    });
  });

  describe('DB write failure scenario (one-shot record throw)', () => {
    it('AuditLogService.record() throw is swallowed; subsequent emits succeed', async () => {
      // Replace `record` with a one-shot throw, then restore.
      const originalRecord = harness.service.record.bind(harness.service);
      let firstCallSeen = false;
      const recordSpy = jest
        .spyOn(harness.service, 'record')
        .mockImplementationOnce(async () => {
          firstCallSeen = true;
          throw new Error('SIMULATED_TRANSIENT_DB_FAILURE');
        });

      // First emit: record throws inside the subscriber's try/catch.
      const envelope1: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId: randomUUID(),
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { round: 1 },
      };
      const failingEmit = harness.emitAndWait(
        AuditEventType.INGREDIENT_OVERRIDE_CHANGED,
        envelope1,
      );
      await expect(failingEmit).resolves.toBeUndefined();
      expect(firstCallSeen).toBe(true);

      // No row from the throwing emit.
      let total = await harness.dataSource.query(
        'SELECT count(*)::int AS c FROM "audit_log"',
      );
      expect(total[0].c).toBe(0);

      // Restore + emit a fresh envelope — must persist.
      recordSpy.mockRestore();
      // Sanity that the restore points back at the original implementation.
      expect(harness.service.record).not.toBe(undefined);
      const envelope2: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId: randomUUID(),
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { round: 2 },
      };
      await harness.emitAndWait(
        AuditEventType.INGREDIENT_OVERRIDE_CHANGED,
        envelope2,
      );
      const rows = await harness.fetchRows(orgId);
      expect(rows).toHaveLength(1);
      expect((rows[0].payloadAfter as { round: number }).round).toBe(2);

      // Defensive: ensure originalRecord ref didn't drift; smoke-test the
      // service directly to confirm it persists a row.
      const directRow = await originalRecord('INGREDIENT_OVERRIDE_CHANGED', {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId: randomUUID(),
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { round: 'direct' },
      });
      expect(directRow.id).toBeDefined();
    });
  });

  describe('envelope validation null-skip scenario', () => {
    it('envelope missing actorKind → validateEnvelope returns null, emit resolves, no row, subsequent emit succeeds', async () => {
      // Missing actorKind sentinel — validateEnvelope returns null.
      const badEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId: randomUUID(),
        actorUserId: null,
        // actorKind: deliberately absent.
        payloadAfter: { tag: 'missing-actorKind' },
      };
      const skippedEmit = harness.emitAndWait(
        AuditEventType.INGREDIENT_OVERRIDE_CHANGED,
        badEnvelope,
      );
      await expect(skippedEmit).resolves.toBeUndefined();

      let total = await harness.dataSource.query(
        'SELECT count(*)::int AS c FROM "audit_log"',
      );
      expect(total[0].c).toBe(0);

      // Subsequent well-formed emit → row persists.
      await harness.emitAndWait(AuditEventType.INGREDIENT_OVERRIDE_CHANGED, {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId: randomUUID(),
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { tag: 'recovered' },
      } satisfies AuditEventEnvelope);
      const rows = await harness.fetchRows(orgId);
      expect(rows).toHaveLength(1);
      expect((rows[0].payloadAfter as { tag: string }).tag).toBe('recovered');
    });
  });
});
