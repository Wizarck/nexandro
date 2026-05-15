import { randomUUID } from 'node:crypto';
import {
  AuditLogIntHarness,
  createAuditLogIntHarness,
} from './__helpers__/audit-log-int-harness';
import {
  AUDIT_EVENT_TYPES,
  AuditEventEnvelope,
  AuditEventType,
  AuditEventTypeName,
  LOT_EXPIRY_NEAR_CHANNEL_NAME,
  LOT_EXPIRY_NEAR_EVENT_TYPE_NAME,
  computeRetentionClass,
} from './types';

/**
 * INT spec — deferred-run-pending-docker. Verifies the AuditLogSubscriber
 * fan-out matrix: emit a representative envelope on each of the 30+
 * channels wired in the subscriber, assert exactly one audit_log row
 * lands with the correct event_type, retention_class, and envelope fields
 * preserved.
 *
 * Covers AC-INT-1 (fan-out matrix), AC-INT-3 (retention class
 * enforcement), and AC-INT-6 (translator paths for AGENT_ACTION_EXECUTED
 * + GR_CONFIRMED + LOT_EXPIRY_NEAR shared channel).
 */
describe('AuditLogSubscriber fan-out matrix (integration)', () => {
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

  /**
   * Channels that take the canonical envelope shape (`persistEnvelope`).
   * Each entry is `[bus channel string, persistedEventTypeName]`.
   */
  const ENVELOPE_CHANNELS: ReadonlyArray<[string, string]> = AUDIT_EVENT_TYPES
    .filter(
      (ch) =>
        // Translator-path channels — exercised in dedicated tests below.
        ch !== AuditEventType.AGENT_ACTION_EXECUTED &&
        ch !== AuditEventType.GR_CONFIRMED &&
        ch !== AuditEventType.GR_LINE_QTY_VARIANCE &&
        ch !== AuditEventType.GR_LINE_PRICE_VARIANCE,
    )
    .map((ch) => [ch, AuditEventTypeName[ch as AuditEventType]] as [string, string]);

  describe('envelope-shape channels', () => {
    it.each(ENVELOPE_CHANNELS)(
      'channel %s persists exactly one row with event_type %s',
      async (channel, persistedName) => {
        const aggregateId = randomUUID();
        const envelope: AuditEventEnvelope = {
          organizationId: orgId,
          aggregateType: aggregateTypeFor(persistedName),
          aggregateId,
          actorUserId: null,
          actorKind: 'system',
          payloadAfter: { test: `fan-out-${persistedName}`, ts: Date.now() },
        };

        await harness.emitAndWait(channel, envelope);

        const rows = await harness.fetchRows(orgId);
        expect(rows).toHaveLength(1);
        expect(rows[0].eventType).toBe(persistedName);
        expect(rows[0].organizationId).toBe(orgId);
        expect(rows[0].aggregateId).toBe(aggregateId);
        expect(rows[0].retentionClass).toBe(
          computeRetentionClass(persistedName),
        );
      },
    );
  });

  describe('shared-channel LOT_EXPIRY_NEAR (persistDirect path)', () => {
    it('persists with event_type=LOT_EXPIRY_NEAR even though the channel is the generic audit.event', async () => {
      const aggregateId = randomUUID();
      const envelope: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'lot',
        aggregateId,
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { alert_band: 'within_24h', lot_code: 'LOT-1' },
      };

      await harness.emitAndWait(LOT_EXPIRY_NEAR_CHANNEL_NAME, envelope);

      const rows = await harness.fetchRows(orgId);
      expect(rows).toHaveLength(1);
      expect(rows[0].eventType).toBe(LOT_EXPIRY_NEAR_EVENT_TYPE_NAME);
      expect(rows[0].retentionClass).toBe('regulatory');
    });
  });

  describe('translator path: AGENT_ACTION_EXECUTED (lean shape)', () => {
    it('with organizationId → row persists with aggregate_type=organization + actor_kind=agent', async () => {
      await harness.emitAndWait(AuditEventType.AGENT_ACTION_EXECUTED, {
        executedBy: 'user-1',
        viaAgent: true,
        agentName: 'claude-desktop',
        capabilityName: 'recipes.read',
        organizationId: orgId,
        timestamp: new Date().toISOString(),
      });

      const rows = await harness.fetchRows(orgId);
      expect(rows).toHaveLength(1);
      expect(rows[0].eventType).toBe('AGENT_ACTION_EXECUTED');
      expect(rows[0].aggregateType).toBe('organization');
      expect(rows[0].aggregateId).toBe(orgId);
      expect(rows[0].actorKind).toBe('agent');
      expect(rows[0].agentName).toBe('claude-desktop');
      expect(rows[0].retentionClass).toBe('ephemeral');
    });

    it('without organizationId → no row persists (pre-auth probe)', async () => {
      await harness.emitAndWait(AuditEventType.AGENT_ACTION_EXECUTED, {
        executedBy: null,
        viaAgent: true,
        agentName: 'claude-desktop',
        capabilityName: null,
        organizationId: null,
        timestamp: new Date().toISOString(),
      });

      const allRows = await harness.dataSource.query(
        'SELECT count(*) AS c FROM "audit_log"',
      );
      expect(Number.parseInt(allRows[0].c, 10)).toBe(0);
    });
  });

  describe('translator path: GR_CONFIRMED (producer shape with grId)', () => {
    it('translates grId → aggregate_id and goods_receipt → aggregate_type', async () => {
      const grId = randomUUID();
      await harness.emitAndWait(AuditEventType.GR_CONFIRMED, {
        grId,
        organizationId: orgId,
        poId: randomUUID(),
        supplierId: randomUUID(),
        receivedAt: new Date().toISOString(),
        lines: [{ grLineId: randomUUID(), receivedQty: 5 }],
      });

      const rows = await harness.fetchRows(orgId);
      expect(rows).toHaveLength(1);
      expect(rows[0].eventType).toBe('GR_CONFIRMED');
      expect(rows[0].aggregateType).toBe('goods_receipt');
      expect(rows[0].aggregateId).toBe(grId);
      expect(rows[0].actorKind).toBe('system');
      expect(rows[0].retentionClass).toBe('regulatory');
    });

    it('GR_LINE_QTY_VARIANCE translates to goods_receipt_line', async () => {
      const grId = randomUUID();
      const grLineId = randomUUID();
      await harness.emitAndWait(AuditEventType.GR_LINE_QTY_VARIANCE, {
        grId,
        grLineId,
        organizationId: orgId,
        receivedQty: 5,
        orderedQty: 10,
      });

      const rows = await harness.fetchRows(orgId);
      expect(rows).toHaveLength(1);
      expect(rows[0].aggregateType).toBe('goods_receipt_line');
      expect(rows[0].aggregateId).toBe(grLineId);
    });

    it('GR_LINE_PRICE_VARIANCE translates to goods_receipt_line', async () => {
      const grId = randomUUID();
      const grLineId = randomUUID();
      await harness.emitAndWait(AuditEventType.GR_LINE_PRICE_VARIANCE, {
        grId,
        grLineId,
        organizationId: orgId,
        receivedUnitPrice: '1.20',
        orderedUnitPrice: '1.00',
      });

      const rows = await harness.fetchRows(orgId);
      expect(rows).toHaveLength(1);
      expect(rows[0].aggregateType).toBe('goods_receipt_line');
      expect(rows[0].aggregateId).toBe(grLineId);
    });
  });

  describe('retention class enforcement (DB CHECK)', () => {
    it('regulatory event types persist with retention_class=regulatory', async () => {
      const orgA = await harness.seedOrg();
      const regulatoryNames = [
        'AGENT_ACTION_FORENSIC',
        'LOT_CONSUMED',
        'COST_SNAPSHOT_RECORDED',
        'PO_RECEIVED_FULL',
        'PO_RECEIVED_PARTIAL',
        'LOT_CREATED',
        'STOCK_MOVE_CREATED',
        'RECALL_INVESTIGATION_OPENED',
        'CCP_READING_RECORDED',
        'EXPORT_BUNDLE_GENERATED',
        'PHOTO_INGESTION_AUTO_FILLED',
        'HITL_RETROACTIVE_CORRECTION',
      ];
      for (const name of regulatoryNames) {
        expect(computeRetentionClass(name)).toBe('regulatory');
      }

      // Spot-check by emitting one regulatory channel and reading the row.
      await harness.emitAndWait(AuditEventType.CCP_READING_RECORDED, {
        organizationId: orgA,
        aggregateType: 'haccp_record',
        aggregateId: randomUUID(),
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { reading: 4.2, ccp: 'walk-in-cooler' },
      });
      const rows = await harness.fetchRows(orgA);
      expect(rows[0].retentionClass).toBe('regulatory');
    });

    it('AGENT_ACTION_EXECUTED maps to retention_class=ephemeral', async () => {
      expect(computeRetentionClass('AGENT_ACTION_EXECUTED')).toBe('ephemeral');
      await harness.emitAndWait(AuditEventType.AGENT_ACTION_EXECUTED, {
        executedBy: 'user-1',
        viaAgent: true,
        agentName: 'claude-desktop',
        capabilityName: 'recipes.read',
        organizationId: orgId,
        timestamp: new Date().toISOString(),
      });
      const rows = await harness.fetchRows(orgId);
      expect(rows[0].retentionClass).toBe('ephemeral');
    });

    it('default channels (e.g. AI_SUGGESTION_*) map to retention_class=operational', async () => {
      expect(computeRetentionClass('AI_SUGGESTION_ACCEPTED')).toBe(
        'operational',
      );
      await harness.emitAndWait(AuditEventType.AI_SUGGESTION_ACCEPTED, {
        organizationId: orgId,
        aggregateType: 'ai_suggestion',
        aggregateId: randomUUID(),
        actorUserId: 'user-1',
        actorKind: 'user',
        payloadAfter: { acceptedField: 'allergens' },
      } satisfies AuditEventEnvelope);
      const rows = await harness.fetchRows(orgId);
      expect(rows[0].retentionClass).toBe('operational');
    });

    it('DB CHECK constraint rejects an unknown retention_class on raw INSERT', async () => {
      const insert = harness.dataSource.query(
        `INSERT INTO "audit_log"
           ("id", "organization_id", "event_type", "aggregate_type",
            "aggregate_id", "actor_kind", "retention_class", "created_at")
         VALUES ($1, $2, 'TEST', 'recipe', $3, 'system', 'unknown', NOW())`,
        [randomUUID(), orgId, randomUUID()],
      );
      await expect(insert).rejects.toThrow(/retention_class/i);
    });
  });

  describe('fan-out matrix coverage assertion', () => {
    it('every AuditEventType has a handler that produces an audit row (envelope-shape sanity)', async () => {
      // This is a coarse smoke test: emit a generic envelope on every
      // channel and require at least one of: (a) a row appears, (b) the
      // channel is in the known-translator-skip list (covered separately).
      const TRANSLATOR_CHANNELS = new Set<string>([
        AuditEventType.AGENT_ACTION_EXECUTED,
        AuditEventType.GR_CONFIRMED,
        AuditEventType.GR_LINE_QTY_VARIANCE,
        AuditEventType.GR_LINE_PRICE_VARIANCE,
      ]);
      const observed = new Set<string>();
      for (const ch of AUDIT_EVENT_TYPES) {
        if (TRANSLATOR_CHANNELS.has(ch)) continue;
        await harness.truncate();
        const org = await harness.seedOrg();
        const envelope: AuditEventEnvelope = {
          organizationId: org,
          aggregateType: aggregateTypeFor(AuditEventTypeName[ch as AuditEventType]),
          aggregateId: randomUUID(),
          actorUserId: null,
          actorKind: 'system',
          payloadAfter: { sentinel: AuditEventTypeName[ch as AuditEventType] },
        };
        await harness.emitAndWait(ch, envelope);
        const rows = await harness.fetchRows(org);
        if (rows.length === 1) observed.add(ch);
      }
      // Every non-translator channel MUST have produced a row.
      const missing = AUDIT_EVENT_TYPES.filter(
        (ch) => !TRANSLATOR_CHANNELS.has(ch) && !observed.has(ch),
      );
      expect(missing).toEqual([]);
    });
  });
});

/**
 * Pick a plausible aggregate_type for a given event_type name. The
 * audit_log column is `text` so we have freedom here; we just want a
 * non-empty string that maps to the domain category for readability.
 */
function aggregateTypeFor(eventTypeName: string): string {
  if (eventTypeName.startsWith('LOT_') || eventTypeName === 'STOCK_MOVE_CREATED') {
    return 'lot';
  }
  if (eventTypeName.startsWith('PO_')) return 'purchase_order';
  if (eventTypeName.startsWith('GR_')) return 'goods_receipt';
  if (eventTypeName.startsWith('RECALL_')) return 'recall_incident';
  if (eventTypeName.startsWith('CCP_') || eventTypeName === 'FSMS_STANDARD_CONFIGURED') {
    return 'haccp_record';
  }
  if (eventTypeName.startsWith('EXPORT_BUNDLE_')) return 'compliance_export';
  if (eventTypeName.startsWith('PHOTO_INGESTION_') ||
      eventTypeName === 'PHOTO_EXTRACTION_FAILED' ||
      eventTypeName === 'HITL_RETROACTIVE_CORRECTION') {
    return 'photo_ingestion_item';
  }
  if (eventTypeName.startsWith('PHOTO_')) return 'photo_storage_object';
  if (eventTypeName === 'AI_BUDGET_TIER_CROSSED') return 'ai_budget';
  if (eventTypeName === 'COST_SNAPSHOT_RECORDED') return 'cost_snapshot';
  if (eventTypeName.startsWith('EMAIL_')) return 'email_dispatch';
  if (eventTypeName.startsWith('AGENT_ACTION_FORENSIC')) return 'recipe';
  if (eventTypeName.startsWith('AI_SUGGESTION_')) return 'ai_suggestion';
  if (eventTypeName.startsWith('RECIPE_')) return 'recipe';
  if (eventTypeName === 'INGREDIENT_OVERRIDE_CHANGED') return 'ingredient';
  if (eventTypeName === 'SUPPLIER_PRICE_UPDATED') return 'supplier_item';
  return 'recipe';
}
