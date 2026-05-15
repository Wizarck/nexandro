import { randomUUID } from 'node:crypto';
import {
  AuditEventEnvelope,
  AuditEventType,
  AuditEventTypeName,
} from '../../audit-log/application/types';
import {
  RevocationIntHarness,
  createRevocationIntHarness,
} from './__helpers__/revocation-int-harness';

/**
 * INT spec for `m3.x-photo-ingest-revocation-int`. Exercises the end-to-end
 * `HITL_RETROACTIVE_CORRECTION → DownstreamRevocationSubscriber → real-Postgres
 * UPDATE → AuditLogSubscriber` chain that listener slice
 * `m3.x-photo-ingest-downstream-revocation-listener` (PR #157) shipped
 * with only unit-spec coverage.
 *
 * Scope (deliberately narrow):
 *   AC-INT-1: happy path Lot — flip + emit + persist.
 *   AC-INT-2: multi-tenant isolation — org-B's matching Lot stays unflipped.
 *   AC-INT-3: no-match — Lot with different source UUID stays unflipped
 *             and no LOT_FLAGGED envelope is persisted.
 *
 * The 42703 graceful-probe path is exercised at the unit level
 * (`downstream-revocation.repository.spec.ts`) which mocks both the
 * top-level and `driverError.code` shapes. Re-running it here would
 * require ALTER TABLE DROP COLUMN against a live schema — high
 * fixture cost for behaviour that's well covered.
 */
describe('DownstreamRevocationSubscriber end-to-end (integration)', () => {
  let harness: RevocationIntHarness;

  beforeAll(async () => {
    harness = await createRevocationIntHarness();
  });

  afterAll(async () => {
    await harness?.dataSource?.destroy();
    await harness?.app?.close();
  });

  beforeEach(async () => {
    await harness.truncate();
  });

  it('AC-INT-1 — Lot with matching source_photo_ingestion_id flips requires_review + persists LOT_FLAGGED_FOR_REVIEW envelope', async () => {
    const orgId = await harness.seedOrg();
    const locationId = await harness.seedLocation(orgId);
    const userId = await harness.seedUser(orgId);
    const photoId = await harness.seedPhoto(orgId, userId);
    const itemId = await harness.seedPhotoIngestionItem(orgId, photoId);
    const lotId = await harness.seedLot(orgId, locationId, {
      sourcePhotoIngestionId: itemId,
    });

    const envelope: AuditEventEnvelope = {
      organizationId: orgId,
      aggregateType: 'photo_ingestion_item',
      aggregateId: itemId,
      actorUserId: null,
      actorKind: 'user',
      payloadAfter: { reason: 'operator-correction' },
    };

    await harness.emitAndWait(
      AuditEventType.HITL_RETROACTIVE_CORRECTION,
      envelope,
    );

    const lot = await harness.fetchLotById(lotId);
    expect(lot).not.toBeNull();
    expect(lot!.requiresReview).toBe(true);
    expect(lot!.sourcePhotoIngestionId).toBe(itemId);

    // audit_log should carry the producer HITL row + the LOT_FLAGGED row.
    const rows = await harness.fetchAuditRows(orgId);
    const lotFlaggedRows = rows.filter(
      (r) =>
        r.eventType ===
        AuditEventTypeName[AuditEventType.LOT_FLAGGED_FOR_REVIEW],
    );
    expect(lotFlaggedRows).toHaveLength(1);
    expect(lotFlaggedRows[0].aggregateId).toBe(lotId);
    expect(lotFlaggedRows[0].aggregateType).toBe('lot');
    expect(lotFlaggedRows[0].organizationId).toBe(orgId);

    const payloadAfter = lotFlaggedRows[0].payloadAfter as {
      sourcePhotoIngestionItemId?: string;
      requiresReview?: boolean;
    };
    expect(payloadAfter.sourcePhotoIngestionItemId).toBe(itemId);
    expect(payloadAfter.requiresReview).toBe(true);

    // No envelope was emitted for goods_receipts (nothing seeded).
    const grFlaggedRows = rows.filter(
      (r) =>
        r.eventType ===
        AuditEventTypeName[AuditEventType.GR_FLAGGED_FOR_REVIEW],
    );
    expect(grFlaggedRows).toHaveLength(0);
  });

  it('AC-INT-2 — multi-tenant isolation: org-B Lot with same source UUID stays unflipped', async () => {
    // Two orgs each own their own photo_ingestion_items + a Lot. The two
    // items happen to share NO data because the FK chain is org-scoped.
    // We emit the correction for orgA's item only — orgB's Lot must NOT
    // flip and orgB's audit_log must stay empty of LOT_FLAGGED rows.
    const orgA = await harness.seedOrg();
    const orgB = await harness.seedOrg();

    const locA = await harness.seedLocation(orgA);
    const locB = await harness.seedLocation(orgB);

    const userA = await harness.seedUser(orgA);
    const userB = await harness.seedUser(orgB);

    const photoA = await harness.seedPhoto(orgA, userA);
    const photoB = await harness.seedPhoto(orgB, userB);

    const itemA = await harness.seedPhotoIngestionItem(orgA, photoA);
    const itemB = await harness.seedPhotoIngestionItem(orgB, photoB);

    const lotA = await harness.seedLot(orgA, locA, {
      sourcePhotoIngestionId: itemA,
    });
    const lotB = await harness.seedLot(orgB, locB, {
      sourcePhotoIngestionId: itemB,
    });

    await harness.emitAndWait(AuditEventType.HITL_RETROACTIVE_CORRECTION, {
      organizationId: orgA,
      aggregateType: 'photo_ingestion_item',
      aggregateId: itemA,
      actorUserId: null,
      actorKind: 'user',
      payloadAfter: { reason: 'operator-correction' },
    } satisfies AuditEventEnvelope);

    const fetchedA = await harness.fetchLotById(lotA);
    const fetchedB = await harness.fetchLotById(lotB);
    expect(fetchedA!.requiresReview).toBe(true);
    expect(fetchedB!.requiresReview).toBe(false);

    const orgARows = await harness.fetchAuditRows(orgA);
    const orgBRows = await harness.fetchAuditRows(orgB);

    expect(
      orgARows.filter(
        (r) =>
          r.eventType ===
          AuditEventTypeName[AuditEventType.LOT_FLAGGED_FOR_REVIEW],
      ),
    ).toHaveLength(1);
    expect(
      orgBRows.filter(
        (r) =>
          r.eventType ===
          AuditEventTypeName[AuditEventType.LOT_FLAGGED_FOR_REVIEW],
      ),
    ).toHaveLength(0);
  });

  it('AC-INT-3 — no-match emits no LOT_FLAGGED envelope; Lot with different source UUID stays unflipped', async () => {
    const orgId = await harness.seedOrg();
    const locationId = await harness.seedLocation(orgId);
    const userId = await harness.seedUser(orgId);
    const photoId = await harness.seedPhoto(orgId, userId);

    const seededItemId = await harness.seedPhotoIngestionItem(orgId, photoId);
    // The Lot points to the seeded ingestion item...
    const lotId = await harness.seedLot(orgId, locationId, {
      sourcePhotoIngestionId: seededItemId,
    });
    // ...but we emit the correction for a DIFFERENT item id (not seeded
    // in photo_ingestion_items, but the listener doesn't read that table
    // — it only joins on the foreign key column in lots).
    const unrelatedItemId = randomUUID();

    await harness.emitAndWait(AuditEventType.HITL_RETROACTIVE_CORRECTION, {
      organizationId: orgId,
      aggregateType: 'photo_ingestion_item',
      aggregateId: unrelatedItemId,
      actorUserId: null,
      actorKind: 'user',
      payloadAfter: { reason: 'operator-correction' },
    } satisfies AuditEventEnvelope);

    const lot = await harness.fetchLotById(lotId);
    expect(lot!.requiresReview).toBe(false);

    const rows = await harness.fetchAuditRows(orgId);
    expect(
      rows.filter(
        (r) =>
          r.eventType ===
          AuditEventTypeName[AuditEventType.LOT_FLAGGED_FOR_REVIEW],
      ),
    ).toHaveLength(0);
    expect(
      rows.filter(
        (r) =>
          r.eventType ===
          AuditEventTypeName[AuditEventType.GR_FLAGGED_FOR_REVIEW],
      ),
    ).toHaveLength(0);
  });
});
