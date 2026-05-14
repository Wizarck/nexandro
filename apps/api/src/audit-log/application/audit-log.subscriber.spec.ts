import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { AuditLogSubscriber } from './audit-log.subscriber';
import { AuditEventTypeName } from './types';
import type { AuditEventEnvelope } from './types';
import type { AgentActionExecutedEvent } from '../../cost/application/cost.events';

const ORG = '00000000-0000-4000-8000-00000000aaaa';

describe('AuditLogSubscriber', () => {
  let subscriber: AuditLogSubscriber;
  let recordSpy: jest.Mock;

  beforeEach(async () => {
    recordSpy = jest.fn(async () => undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogSubscriber,
        { provide: AuditLogService, useValue: { record: recordSpy } },
      ],
    }).compile();
    subscriber = module.get(AuditLogSubscriber);
  });

  describe('cost-domain channels (envelope shape post-Wave-1.18)', () => {
    it('persists INGREDIENT_OVERRIDE_CHANGED envelope as-is', async () => {
      const event: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'ingredient',
        aggregateId: 'ing-1',
        actorUserId: 'user-1',
        actorKind: 'user',
        payloadAfter: { field: 'allergens' },
        reason: 'manager override',
      };
      await subscriber.onIngredientOverrideChanged(event);
      expect(recordSpy).toHaveBeenCalledTimes(1);
      const [eventType, envelope] = recordSpy.mock.calls[0];
      expect(eventType).toBe(AuditEventTypeName['cost.ingredient-override-changed']);
      expect(envelope).toEqual(event);
    });

    it('persists RECIPE_ALLERGENS_OVERRIDE_CHANGED envelope as-is', async () => {
      const event: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'recipe',
        aggregateId: 'rec-1',
        actorUserId: 'user-2',
        actorKind: 'user',
        payloadAfter: { kind: 'allergens-override' },
      };
      await subscriber.onRecipeAllergensOverrideChanged(event);
      expect(recordSpy).toHaveBeenCalledTimes(1);
      expect(recordSpy.mock.calls[0][1]).toEqual(event);
    });

    it('persists RECIPE_SOURCE_OVERRIDE_CHANGED envelope as-is (system actor)', async () => {
      const event: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'recipe',
        aggregateId: 'rec-1',
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { recipeIngredientId: 'rl-1', sourceOverrideRef: 'sup-1' },
      };
      await subscriber.onRecipeSourceOverrideChanged(event);
      const [, envelope] = recordSpy.mock.calls[0];
      expect(envelope.actorKind).toBe('system');
      expect(envelope.actorUserId).toBeNull();
    });

    it('persists RECIPE_INGREDIENT_UPDATED envelope as-is', async () => {
      const event: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'recipe',
        aggregateId: 'rec-1',
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { recipeIngredientId: 'rl-2' },
      };
      await subscriber.onRecipeIngredientUpdated(event);
      expect(recordSpy).toHaveBeenCalledTimes(1);
      expect(recordSpy.mock.calls[0][1].payloadAfter).toEqual({ recipeIngredientId: 'rl-2' });
    });

    it('persists SUPPLIER_PRICE_UPDATED envelope as-is', async () => {
      const event: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'supplier_item',
        aggregateId: 'si-1',
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { ingredientId: 'ing-1' },
      };
      await subscriber.onSupplierPriceUpdated(event);
      const [, envelope] = recordSpy.mock.calls[0];
      expect(envelope.aggregateType).toBe('supplier_item');
      expect(envelope.aggregateId).toBe('si-1');
      expect(envelope.actorKind).toBe('system');
    });

    it('translates AgentActionExecutedEvent (with org) — lean channel still uses translator', async () => {
      const event: AgentActionExecutedEvent = {
        executedBy: 'user-3',
        viaAgent: true,
        agentName: 'claude-desktop',
        capabilityName: 'recipes.read',
        organizationId: ORG,
        timestamp: '2026-05-06T11:42:08Z',
      };
      await subscriber.onAgentActionExecuted(event);
      const [, envelope] = recordSpy.mock.calls[0];
      expect(envelope.actorKind).toBe('agent');
      expect(envelope.agentName).toBe('claude-desktop');
      expect(envelope.aggregateType).toBe('organization');
      expect(envelope.aggregateId).toBe(ORG);
    });

    it('skips AgentActionExecutedEvent without organizationId', async () => {
      const event: AgentActionExecutedEvent = {
        executedBy: null,
        viaAgent: true,
        agentName: 'unknown',
        capabilityName: null,
        organizationId: null,
        timestamp: '2026-05-06T11:42:08Z',
      };
      await subscriber.onAgentActionExecuted(event);
      expect(recordSpy).not.toHaveBeenCalled();
    });
  });

  describe('new envelope-shaped events', () => {
    it('persists AI_SUGGESTION_ACCEPTED envelope as-is', async () => {
      const envelope: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'ai_suggestion',
        aggregateId: 'sug-1',
        actorUserId: 'user-1',
        actorKind: 'user',
        payloadAfter: { status: 'accepted' },
        citationUrl: 'https://fdc.nal.usda.gov/x',
        snippet: 'USDA: ...',
      };
      await subscriber.onAiSuggestionAccepted(envelope);
      expect(recordSpy).toHaveBeenCalledTimes(1);
      const [eventType, persisted] = recordSpy.mock.calls[0];
      expect(eventType).toBe('AI_SUGGESTION_ACCEPTED');
      expect(persisted).toEqual(envelope);
    });

    it('skips envelope-shaped event with missing required fields', async () => {
      const bad = { organizationId: ORG } as unknown as AuditEventEnvelope;
      await subscriber.onAiSuggestionAccepted(bad);
      expect(recordSpy).not.toHaveBeenCalled();
    });

    it('persists AI_SUGGESTION_REJECTED with reason', async () => {
      const envelope: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'ai_suggestion',
        aggregateId: 'sug-2',
        actorUserId: 'user-1',
        actorKind: 'user',
        reason: 'wrong region',
      };
      await subscriber.onAiSuggestionRejected(envelope);
      expect(recordSpy.mock.calls[0][1].reason).toBe('wrong region');
    });

    it('persists RECIPE_COST_REBUILT (system event)', async () => {
      const envelope: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'recipe',
        aggregateId: 'rec-1',
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: { reason: 'INITIAL', totalCost: 12.5, componentCount: 3 },
      };
      await subscriber.onRecipeCostRebuilt(envelope);
      expect(recordSpy).toHaveBeenCalledTimes(1);
    });

    it('persists AGENT_ACTION_FORENSIC envelope as-is (rich aggregate-anchored)', async () => {
      const envelope: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'recipe',
        aggregateId: '00000000-0000-4000-8000-00000000bbbb',
        actorUserId: 'user-9',
        actorKind: 'agent',
        agentName: 'claude-desktop',
        payloadBefore: { name: 'before' },
        payloadAfter: { name: 'after' },
        reason: 'recipes.update',
      };
      await subscriber.onAgentActionForensic(envelope);
      expect(recordSpy).toHaveBeenCalledTimes(1);
      const [eventType, persisted] = recordSpy.mock.calls[0];
      expect(eventType).toBe('AGENT_ACTION_FORENSIC');
      expect(persisted).toEqual(envelope);
    });

    it('skips AGENT_ACTION_FORENSIC payload missing envelope shape', async () => {
      const bad = { organizationId: ORG } as unknown as AuditEventEnvelope;
      await subscriber.onAgentActionForensic(bad);
      expect(recordSpy).not.toHaveBeenCalled();
    });

    it('AGENT_ACTION_FORENSIC swallows record() failure without re-throw', async () => {
      recordSpy.mockRejectedValueOnce(new Error('db down'));
      const envelope: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'menu_item',
        aggregateId: '00000000-0000-4000-8000-00000000cccc',
        actorUserId: null,
        actorKind: 'agent',
      };
      await expect(subscriber.onAgentActionForensic(envelope)).resolves.toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('catches record() errors without re-throwing', async () => {
      recordSpy.mockRejectedValueOnce(new Error('db down'));
      const event: AuditEventEnvelope = {
        organizationId: ORG,
        aggregateType: 'ingredient',
        aggregateId: 'ing-1',
        actorUserId: 'user-1',
        actorKind: 'user',
        payloadAfter: { field: 'allergens' },
        reason: 'x',
      };
      // Should NOT throw — the emitter must never see DB failures.
      await expect(subscriber.onIngredientOverrideChanged(event)).resolves.toBeUndefined();
    });

    it('skips a broken envelope payload without throwing', async () => {
      // Payload missing required envelope fields — validateEnvelope rejects.
      const broken = null as unknown as AuditEventEnvelope;
      await expect(subscriber.onIngredientOverrideChanged(broken)).resolves.toBeUndefined();
      expect(recordSpy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // M3 channels (slice #21 m3-audit-log-hash-chain-hardening)
  // ---------------------------------------------------------------

  describe('M3 event subscribers (slice #21)', () => {
    function envelope(
      aggregateType: string,
      aggregateId: string,
      payloadAfter: unknown = { ok: true },
    ): AuditEventEnvelope {
      return {
        organizationId: ORG,
        aggregateType,
        aggregateId,
        actorUserId: null,
        actorKind: 'system',
        payloadAfter,
      };
    }

    it('LOT_CREATED persists with persisted event_type=LOT_CREATED', async () => {
      await subscriber.onLotCreated(envelope('lot', 'lot-1'));
      expect(recordSpy).toHaveBeenCalledTimes(1);
      expect(recordSpy.mock.calls[0][0]).toBe('LOT_CREATED');
    });

    it('STOCK_MOVE_CREATED persists with persisted event_type=STOCK_MOVE_CREATED', async () => {
      await subscriber.onStockMoveCreated(envelope('stock_move', 'sm-1'));
      expect(recordSpy.mock.calls[0][0]).toBe('STOCK_MOVE_CREATED');
    });

    it('LOT_CONSUMED persists with persisted event_type=LOT_CONSUMED', async () => {
      await subscriber.onLotConsumed(
        envelope('lot', 'lot-1', { qty_consumed: 2.5, unit: 'kg' }),
      );
      expect(recordSpy.mock.calls[0][0]).toBe('LOT_CONSUMED');
      const env = recordSpy.mock.calls[0][1];
      expect(env.aggregateType).toBe('lot');
    });

    it('LOT_EXPIRY_NEAR (audit.event channel) pins persisted event_type=LOT_EXPIRY_NEAR', async () => {
      await subscriber.onLotExpiryNear(
        envelope('lot', 'lot-7', { alert_band: 't-72h' }),
      );
      expect(recordSpy.mock.calls[0][0]).toBe('LOT_EXPIRY_NEAR');
    });

    it('COST_SNAPSHOT_RECORDED persists envelope as-is', async () => {
      await subscriber.onCostSnapshotRecorded(
        envelope('cost_snapshot', 'cs-1', { total_cost: 12.34 }),
      );
      expect(recordSpy.mock.calls[0][0]).toBe('COST_SNAPSHOT_RECORDED');
    });

    it('PO_CREATED handler is wired (subscriber side; emit-side TBD)', async () => {
      await subscriber.onPoCreated(envelope('purchase_order', 'po-1'));
      expect(recordSpy.mock.calls[0][0]).toBe('PO_CREATED');
    });

    it('PO_SENT handler is wired', async () => {
      await subscriber.onPoSent(envelope('purchase_order', 'po-1'));
      expect(recordSpy.mock.calls[0][0]).toBe('PO_SENT');
    });

    it('PO_RECEIVED_PARTIAL handler is wired', async () => {
      await subscriber.onPoReceivedPartial(envelope('purchase_order', 'po-1'));
      expect(recordSpy.mock.calls[0][0]).toBe('PO_RECEIVED_PARTIAL');
    });

    it('PO_RECEIVED_FULL handler is wired', async () => {
      await subscriber.onPoReceivedFull(envelope('purchase_order', 'po-1'));
      expect(recordSpy.mock.calls[0][0]).toBe('PO_RECEIVED_FULL');
    });

    it('PO_CANCELLED handler is wired', async () => {
      await subscriber.onPoCancelled(envelope('purchase_order', 'po-1'));
      expect(recordSpy.mock.calls[0][0]).toBe('PO_CANCELLED');
    });

    it('PO_CLOSED handler is wired', async () => {
      await subscriber.onPoClosed(envelope('purchase_order', 'po-1'));
      expect(recordSpy.mock.calls[0][0]).toBe('PO_CLOSED');
    });

    it('GR_CONFIRMED translates slice-#7 payload to canonical envelope', async () => {
      // Slice #7's GrConfirmedEventPayload uses snake-case style shape.
      const grPayload = {
        grId: 'gr-1',
        organizationId: ORG,
        poId: 'po-1',
        supplierId: 'sup-1',
        receivedAt: new Date(),
        lines: [],
      };
      await subscriber.onGrConfirmed(grPayload);
      expect(recordSpy.mock.calls[0][0]).toBe('GR_CONFIRMED');
      const env = recordSpy.mock.calls[0][1];
      expect(env.aggregateType).toBe('goods_receipt');
      expect(env.aggregateId).toBe('gr-1');
      expect(env.actorKind).toBe('system');
    });

    it('GR_LINE_QTY_VARIANCE translates to goods_receipt_line aggregate', async () => {
      const grLinePayload = {
        grId: 'gr-1',
        grLineId: 'grl-1',
        organizationId: ORG,
        poLineId: 'pol-1',
        qtyOrdered: 10,
        qtyReceivedActual: 11,
        deltaPct: 0.1,
        thresholdPct: 0.01,
      };
      await subscriber.onGrLineQtyVariance(grLinePayload);
      expect(recordSpy.mock.calls[0][0]).toBe('GR_LINE_QTY_VARIANCE');
      expect(recordSpy.mock.calls[0][1].aggregateId).toBe('grl-1');
      expect(recordSpy.mock.calls[0][1].aggregateType).toBe('goods_receipt_line');
    });

    it('GR_LINE_PRICE_VARIANCE translates similarly', async () => {
      const grLinePayload = {
        grId: 'gr-1',
        grLineId: 'grl-2',
        organizationId: ORG,
        poLineId: 'pol-2',
        unitPriceOrdered: 5,
        unitPriceActual: 5.5,
        deltaPct: 0.1,
        thresholdPct: 0.01,
      };
      await subscriber.onGrLinePriceVariance(grLinePayload);
      expect(recordSpy.mock.calls[0][0]).toBe('GR_LINE_PRICE_VARIANCE');
      expect(recordSpy.mock.calls[0][1].aggregateId).toBe('grl-2');
    });

    it('EMAIL_DISPATCHED handler is wired', async () => {
      await subscriber.onEmailDispatched(envelope('email_dispatch', 'msg-1'));
      expect(recordSpy.mock.calls[0][0]).toBe('EMAIL_DISPATCHED');
    });

    it('EMAIL_FAILED handler is wired', async () => {
      await subscriber.onEmailFailed(envelope('email_dispatch', 'msg-2'));
      expect(recordSpy.mock.calls[0][0]).toBe('EMAIL_FAILED');
    });

    // ---- Slice #19 m3-ai-obs-budget-tier-emitter (Wave 2.4) ----

    it('AI_BUDGET_TIER_CROSSED handler is wired', async () => {
      const aggId = `${ORG}:2026-05`;
      await subscriber.onAiBudgetTierCrossed(envelope('ai_usage_rollup', aggId));
      expect(recordSpy.mock.calls[0][0]).toBe('AI_BUDGET_TIER_CROSSED');
      expect(recordSpy.mock.calls[0][1].aggregateId).toBe(aggId);
    });

    it('GR_CONFIRMED with missing required fields is logged + skipped (no throw)', async () => {
      const grPayload = { lines: [] }; // missing grId + organizationId
      await expect(subscriber.onGrConfirmed(grPayload)).resolves.toBeUndefined();
      expect(recordSpy).not.toHaveBeenCalled();
    });

    // ---- Slice #18 m3-photo-storage-lifecycle ----

    it('PHOTO_UPLOADED persists with persisted event_type=PHOTO_UPLOADED', async () => {
      await subscriber.onPhotoUploaded(
        envelope('photo', 'photo-1', {
          photo_id: 'photo-1',
          organization_id: ORG,
          s3_key: 'org/x/photos/photo-1.jpg',
          mime_type: 'image/jpeg',
          byte_size: 1024,
          retention_class: 'full_res_90d',
          uploaded_by_user_id: 'user-1',
        }),
      );
      expect(recordSpy).toHaveBeenCalledTimes(1);
      expect(recordSpy.mock.calls[0][0]).toBe('PHOTO_UPLOADED');
      const env = recordSpy.mock.calls[0][1];
      expect(env.aggregateType).toBe('photo');
      expect(env.aggregateId).toBe('photo-1');
    });

    it('PHOTO_DELETED persists with persisted event_type=PHOTO_DELETED', async () => {
      await subscriber.onPhotoDeleted(
        envelope('photo', 'photo-2', {
          photo_id: 'photo-2',
          organization_id: ORG,
          deleted_at: new Date().toISOString(),
          reason: 'retention_90d',
        }),
      );
      expect(recordSpy).toHaveBeenCalledTimes(1);
      expect(recordSpy.mock.calls[0][0]).toBe('PHOTO_DELETED');
    });

    it('PHOTO_UPLOADED skips persistence when envelope is malformed', async () => {
      const broken = { foo: 'bar' } as unknown as AuditEventEnvelope;
      await expect(subscriber.onPhotoUploaded(broken)).resolves.toBeUndefined();
      expect(recordSpy).not.toHaveBeenCalled();
    });

    // ---- Slice #13 m3-recall-86-flag-dispatch (Wave 2.5) ----

    it('RECALL_INVESTIGATION_OPENED persists with the canonical event_type', async () => {
      await subscriber.onRecallInvestigationOpened(
        envelope('recall_incident', 'inc-1', {
          incidentCode: 'IR-2026-0007',
          lotIds: ['lot-1'],
          locationIds: ['loc-1'],
        }),
      );
      expect(recordSpy).toHaveBeenCalledTimes(1);
      expect(recordSpy.mock.calls[0][0]).toBe('RECALL_INVESTIGATION_OPENED');
      expect(recordSpy.mock.calls[0][1].aggregateType).toBe('recall_incident');
    });

    it('RECALL_86_FLAG_DISPATCHED persists with the canonical event_type', async () => {
      await subscriber.onRecall86FlagDispatched(
        envelope('recall_incident', 'inc-1', {
          lotIds: ['lot-1'],
          locationIds: ['loc-1'],
        }),
      );
      expect(recordSpy.mock.calls[0][0]).toBe('RECALL_86_FLAG_DISPATCHED');
    });

    it('RECALL_DOSSIER_GENERATED persists per-recipient envelope', async () => {
      await subscriber.onRecallDossierGenerated(
        envelope('recall_incident', 'inc-1', {
          recipient: 'aseguradora@example.org',
          deliveryStatus: 'delivered',
          providerMessageId: 'msg-1',
          attempt: 1,
          dossierHash: 'abc',
          chainBroken: false,
        }),
      );
      expect(recordSpy.mock.calls[0][0]).toBe('RECALL_DOSSIER_GENERATED');
    });

    it('RECALL_DOSSIER_REDISPATCHED persists per re-send', async () => {
      await subscriber.onRecallDossierRedispatched(
        envelope('recall_incident', 'inc-1', {
          recipient: 'aseguradora@example.org',
          deliveryStatus: 'delivered',
          attempt: 2,
          dossierHash: 'abc',
          chainBroken: false,
          originalDispatchedAt: '2026-05-13T02:21:00Z',
        }),
      );
      expect(recordSpy.mock.calls[0][0]).toBe('RECALL_DOSSIER_REDISPATCHED');
    });

    it('RECALL_ADDENDUM_ATTACHED persists once per addendum', async () => {
      await subscriber.onRecallAddendumAttached(
        envelope('recall_incident', 'inc-1', {
          addendumId: 'add-1',
          text: 'Inspector regional visited, no further action requested.',
          attachmentMetadata: [],
          attachedAt: new Date().toISOString(),
        }),
      );
      expect(recordSpy.mock.calls[0][0]).toBe('RECALL_ADDENDUM_ATTACHED');
    });
  });
});
