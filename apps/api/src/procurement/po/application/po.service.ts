import { Injectable, NotFoundException } from '@nestjs/common';
import { PurchaseOrder } from '../domain/purchase-order.entity';
import { PurchaseOrderRepository } from '../infrastructure/purchase-order.repository';
import { assertTransition } from '../domain/state-machine';

/**
 * Application service exposing the small set of lifecycle transitions
 * owned by this slice:
 *  - `send` — draft -> sent (sets sent_at)
 *  - `cancel` — gated by ADR-PO-STATE-MACHINE (only from draft/sent/partially_received)
 *  - `close` — received -> closed (sets closed_at)
 *
 * GR-driven transitions (`markPartiallyReceived`, `markReceived`) are
 * DELIBERATELY NOT in this slice; they are claimed by slice #7
 * `m3-gr-aggregate-reconciliation` which wires the goods-receipt flow.
 *
 * Audit-log emission for state transitions is claimed by slice #21
 * `m3-audit-log-hash-chain-hardening`. This service is the seam — once
 * #21 lands, it injects an EventEmitter via DI and emits PO_SENT,
 * PO_CANCELLED, PO_CLOSED at the natural call sites below.
 */
@Injectable()
export class PoService {
  constructor(private readonly poRepo: PurchaseOrderRepository) {}

  async send(
    organizationId: string,
    poId: string,
    _userId: string,
  ): Promise<PurchaseOrder> {
    const po = await this.requirePo(organizationId, poId);
    assertTransition(po.state, 'sent');
    po.state = 'sent';
    po.sentAt = new Date();
    return this.poRepo.save(po);
  }

  async cancel(
    organizationId: string,
    poId: string,
    _userId: string,
    _reason: string,
  ): Promise<PurchaseOrder> {
    const po = await this.requirePo(organizationId, poId);
    assertTransition(po.state, 'cancelled');
    po.state = 'cancelled';
    return this.poRepo.save(po);
  }

  async close(
    organizationId: string,
    poId: string,
    _userId: string,
  ): Promise<PurchaseOrder> {
    const po = await this.requirePo(organizationId, poId);
    assertTransition(po.state, 'closed');
    po.state = 'closed';
    po.closedAt = new Date();
    return this.poRepo.save(po);
  }

  private async requirePo(
    organizationId: string,
    poId: string,
  ): Promise<PurchaseOrder> {
    const po = await this.poRepo.findById(organizationId, poId);
    if (po === null) {
      throw new NotFoundException(
        `PurchaseOrder ${poId} not found for organization ${organizationId}.`,
      );
    }
    return po;
  }
}
