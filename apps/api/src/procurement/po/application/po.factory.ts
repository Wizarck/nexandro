import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SupplierRepository } from '../../../suppliers/infrastructure/supplier.repository';
import { PurchaseOrder } from '../domain/purchase-order.entity';
import { PurchaseOrderLine } from '../domain/purchase-order-line.entity';
import {
  InvalidCurrencyCodeError,
  InvalidPoInputError,
  PoMustHaveAtLeastOneLineError,
  SupplierNotFoundError,
} from '../domain/errors';
import {
  CreatePoInput,
  CreatePoLineInput,
  MONEY_UNITS,
  MoneyUnit,
} from '../domain/types';
import { computeLineVat, roundHalfEven } from './po-vat';
import { PoNumberService } from './po-number.service';

const ISO_4217_RX = /^[A-Z]{3}$/;

export interface PoFactoryCreateResult {
  po: PurchaseOrder;
  lines: PurchaseOrderLine[];
}

/**
 * Factory for creating a `PurchaseOrder` aggregate transactionally.
 *
 * Responsibilities per design.md:
 *  - Validate input (non-empty lines, valid currency, valid supplier).
 *  - Allocate PO number via `PoNumberService` (counter increment inside the
 *    transaction).
 *  - Compute per-line VAT (both inclusive + exclusive paths per
 *    ADR-PO-VAT-MONEY-FIELDS) with half-even rounding.
 *  - Compute header subtotal / vat_total / total from the line sums.
 *  - Persist PO header + lines atomically in a single transaction.
 *
 * Does NOT emit audit events; see ADR-PO-NO-AUDIT-EMIT-HERE.
 */
@Injectable()
export class PoFactory {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly poNumberService: PoNumberService,
    private readonly supplierRepo: SupplierRepository,
  ) {}

  async create(input: CreatePoInput): Promise<PoFactoryCreateResult> {
    PoFactory.validateInput(input);
    await this.assertSupplierExists(input.organizationId, input.supplierId);

    return this.dataSource.transaction(async (manager) => {
      const poNumber = await this.poNumberService.allocate(
        input.organizationId,
        new Date(),
        manager,
      );

      const poId = randomUUID();
      const computedLines = input.lines.map((line, idx) =>
        PoFactory.computeLine(line, idx + 1, poId, input.organizationId),
      );

      const subtotal = roundHalfEven(
        computedLines.reduce((acc, l) => acc + l.lineSubtotal, 0),
      );
      const vatTotal = roundHalfEven(
        computedLines.reduce((acc, l) => acc + l.lineVat, 0),
      );
      const total = roundHalfEven(
        computedLines.reduce((acc, l) => acc + l.lineTotal, 0),
      );

      const po = new PurchaseOrder();
      po.id = poId;
      po.organizationId = input.organizationId;
      po.supplierId = input.supplierId;
      po.poNumber = poNumber;
      po.state = 'draft';
      po.currency = input.currency;
      po.subtotal = subtotal;
      po.vatTotal = vatTotal;
      po.total = total;
      po.expectedDeliveryDate = input.expectedDeliveryDate ?? null;
      po.notes = input.notes ?? null;
      po.createdByUserId = input.createdByUserId;
      po.sentAt = null;
      po.closedAt = null;

      const savedPo = await manager.save(PurchaseOrder, po);
      const savedLines =
        computedLines.length > 0
          ? await manager.save(PurchaseOrderLine, computedLines)
          : [];
      return { po: savedPo, lines: savedLines };
    });
  }

  private static validateInput(input: CreatePoInput): void {
    if (input.lines.length === 0) {
      throw new PoMustHaveAtLeastOneLineError();
    }
    if (!ISO_4217_RX.test(input.currency)) {
      throw new InvalidCurrencyCodeError(input.currency);
    }
    input.lines.forEach((line, idx) => PoFactory.validateLine(line, idx));
  }

  private static validateLine(line: CreatePoLineInput, idx: number): void {
    if (!MONEY_UNITS.includes(line.unit as MoneyUnit)) {
      throw new InvalidPoInputError(
        `Line ${idx + 1}: invalid unit "${line.unit}". Allowed: ${MONEY_UNITS.join(', ')}.`,
      );
    }
    if (!Number.isFinite(line.quantityOrdered) || line.quantityOrdered <= 0) {
      throw new InvalidPoInputError(
        `Line ${idx + 1}: quantityOrdered must be a positive finite number; got ${line.quantityOrdered}.`,
      );
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      throw new InvalidPoInputError(
        `Line ${idx + 1}: unitPrice must be a non-negative finite number; got ${line.unitPrice}.`,
      );
    }
    if (!Number.isFinite(line.vatRate) || line.vatRate < 0 || line.vatRate > 1) {
      throw new InvalidPoInputError(
        `Line ${idx + 1}: vatRate must be a finite number in [0, 1] (e.g. 0.21 for 21%); got ${line.vatRate}.`,
      );
    }
  }

  private async assertSupplierExists(
    organizationId: string,
    supplierId: string,
  ): Promise<void> {
    const supplier = await this.supplierRepo.findOneBy({
      id: supplierId,
      organizationId,
    });
    if (supplier === null) {
      throw new SupplierNotFoundError(supplierId, organizationId);
    }
  }

  private static computeLine(
    input: CreatePoLineInput,
    lineNumber: number,
    purchaseOrderId: string,
    organizationId: string,
  ): PurchaseOrderLine {
    const { lineSubtotal, lineVat, lineTotal } = computeLineVat(input);
    const line = new PurchaseOrderLine();
    line.id = randomUUID();
    line.purchaseOrderId = purchaseOrderId;
    line.organizationId = organizationId;
    line.lineNumber = lineNumber;
    line.ingredientId = input.ingredientId;
    line.quantityOrdered = input.quantityOrdered;
    line.unit = input.unit;
    line.unitPrice = input.unitPrice;
    line.vatRate = input.vatRate;
    line.vatInclusive = input.vatInclusive;
    line.lineSubtotal = lineSubtotal;
    line.lineVat = lineVat;
    line.lineTotal = lineTotal;
    return line;
  }
}
