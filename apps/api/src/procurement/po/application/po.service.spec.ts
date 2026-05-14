import { NotFoundException } from '@nestjs/common';
import { IllegalStateTransitionError } from '../domain/errors';
import { PurchaseOrder } from '../domain/purchase-order.entity';
import type { PoState } from '../domain/types';
import { PurchaseOrderRepository } from '../infrastructure/purchase-order.repository';
import { PoService } from './po.service';

function buildPo(state: PoState): PurchaseOrder {
  const po = new PurchaseOrder();
  po.id = 'po-id';
  po.organizationId = 'org-id';
  po.supplierId = 'supplier-id';
  po.poNumber = 'PO-2026-0001';
  po.state = state;
  po.currency = 'EUR';
  po.subtotal = 0;
  po.vatTotal = 0;
  po.total = 0;
  po.expectedDeliveryDate = null;
  po.notes = null;
  po.createdByUserId = 'user-id';
  po.sentAt = null;
  po.closedAt = null;
  po.createdAt = new Date();
  po.updatedAt = new Date();
  return po;
}

function buildService(po: PurchaseOrder | null): {
  svc: PoService;
  repo: { findById: jest.Mock; save: jest.Mock };
} {
  const repo = {
    findById: jest.fn().mockResolvedValue(po),
    save: jest.fn().mockImplementation(async (p: PurchaseOrder) => p),
  };
  return { svc: new PoService(repo as unknown as PurchaseOrderRepository), repo };
}

describe('PoService', () => {
  describe('send', () => {
    it('transitions draft -> sent and sets sent_at', async () => {
      const po = buildPo('draft');
      const { svc, repo } = buildService(po);
      const result = await svc.send('org-id', 'po-id', 'user-id');
      expect(result.state).toBe('sent');
      expect(result.sentAt).not.toBeNull();
      expect(repo.save).toHaveBeenCalledWith(result);
    });

    it('throws on sent -> sent (no transition)', async () => {
      const { svc } = buildService(buildPo('sent'));
      await expect(svc.send('org-id', 'po-id', 'user-id')).rejects.toBeInstanceOf(
        IllegalStateTransitionError,
      );
    });

    it('throws NotFoundException when PO does not exist', async () => {
      const { svc } = buildService(null);
      await expect(svc.send('org-id', 'po-id', 'user-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('cancel', () => {
    it.each<PoState>(['draft', 'sent', 'partially_received'])(
      'allows cancel from %s',
      async (state) => {
        const po = buildPo(state);
        const { svc } = buildService(po);
        const result = await svc.cancel('org-id', 'po-id', 'user-id', 'reason');
        expect(result.state).toBe('cancelled');
      },
    );

    it.each<PoState>(['received', 'closed', 'cancelled'])(
      'rejects cancel from %s',
      async (state) => {
        const { svc } = buildService(buildPo(state));
        await expect(
          svc.cancel('org-id', 'po-id', 'user-id', 'reason'),
        ).rejects.toBeInstanceOf(IllegalStateTransitionError);
      },
    );
  });

  describe('close', () => {
    it('transitions received -> closed and sets closed_at', async () => {
      const po = buildPo('received');
      const { svc } = buildService(po);
      const result = await svc.close('org-id', 'po-id', 'user-id');
      expect(result.state).toBe('closed');
      expect(result.closedAt).not.toBeNull();
    });

    it.each<PoState>(['draft', 'sent', 'partially_received', 'cancelled'])(
      'rejects close from %s',
      async (state) => {
        const { svc } = buildService(buildPo(state));
        await expect(svc.close('org-id', 'po-id', 'user-id')).rejects.toBeInstanceOf(
          IllegalStateTransitionError,
        );
      },
    );
  });
});
