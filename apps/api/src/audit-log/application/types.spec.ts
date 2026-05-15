import { computeRetentionClass } from './types';

describe('computeRetentionClass', () => {
  it('classifies AGENT_ACTION_FORENSIC as regulatory', () => {
    expect(computeRetentionClass('AGENT_ACTION_FORENSIC')).toBe('regulatory');
  });

  it.each([
    'LOT_CONSUMED',
    'LOT_EXPIRY_NEAR',
    'GR_CONFIRMED',
    'COST_SNAPSHOT_RECORDED',
    'PO_RECEIVED_FULL',
    'PO_RECEIVED_PARTIAL',
    'LOT_CREATED',
    'STOCK_MOVE_CREATED',
    'RECALL_INVESTIGATION_OPENED',
    'RECALL_86_FLAG_DISPATCHED',
    'RECALL_DOSSIER_GENERATED',
    'RECALL_DOSSIER_REDISPATCHED',
    'RECALL_ADDENDUM_ATTACHED',
    'CCP_READING_RECORDED',
    'CCP_CORRECTIVE_ACTION_RECORDED',
    'FSMS_STANDARD_CONFIGURED',
    'EXPORT_BUNDLE_GENERATED',
    'EXPORT_BUNDLE_DISPATCHED',
    'PHOTO_INGESTION_AUTO_FILLED',
    'PHOTO_INGESTION_AWAITING_REVIEW',
    'PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE',
    'PHOTO_EXTRACTION_FAILED',
    'PHOTO_INGESTION_SIGNED',
    'PHOTO_INGESTION_RECLASSIFIED',
    'HITL_RETROACTIVE_CORRECTION',
    'PHOTO_INGESTION_DOWNSTREAM_ROUTED',
    'PHOTO_INGESTION_ROUTING_SKIPPED',
  ])('classifies %s as regulatory (HACCP / EU 178/2002 footprint)', (eventType) => {
    expect(computeRetentionClass(eventType)).toBe('regulatory');
  });

  it('classifies AGENT_ACTION_EXECUTED as ephemeral (90-day rolling)', () => {
    expect(computeRetentionClass('AGENT_ACTION_EXECUTED')).toBe('ephemeral');
  });

  it.each([
    'AI_SUGGESTION_ACCEPTED',
    'AI_SUGGESTION_REJECTED',
    'INGREDIENT_OVERRIDE_CHANGED',
    'RECIPE_COST_REBUILT',
    'PO_CREATED',
    'PO_SENT',
    'PO_CANCELLED',
    'PO_CLOSED',
    'GR_LINE_QTY_VARIANCE',
    'GR_LINE_PRICE_VARIANCE',
    'EMAIL_DISPATCHED',
    'EMAIL_FAILED',
  ])('classifies %s as operational (default 7-year hot)', (eventType) => {
    expect(computeRetentionClass(eventType)).toBe('operational');
  });

  it('returns operational for unknown event types (no throw)', () => {
    expect(computeRetentionClass('NEVER_SEEN_BEFORE')).toBe('operational');
    expect(computeRetentionClass('')).toBe('operational');
  });
});
