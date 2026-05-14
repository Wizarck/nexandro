import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { PoCounterService } from '../infrastructure/po-counter.service';

const PO_NUMBER_RX = /^PO-(\d{4})-(\d{4,})$/;

/**
 * Allocates and parses PO numbers in the canonical `PO-{YYYY}-{nnnn}`
 * format per ADR-PO-NUMBER-FORMAT.
 *
 * Padding: 4-digit minimum. Numbers above 9999 expand naturally
 * (`PO-2026-12345`); the regex parser accepts 4-or-more digits.
 *
 * Year derivation: the calendar year of the `asOf` Date in UTC. Using
 * UTC keeps counter rollover deterministic across deployments in different
 * timezones.
 */
@Injectable()
export class PoNumberService {
  constructor(private readonly counterService: PoCounterService) {}

  /**
   * Allocate the next PO number for `organizationId` as of the supplied
   * date. Calls into `PoCounterService.allocateNext` which row-locks the
   * `po_counters` row.
   *
   * If `manager` is supplied, the allocation runs inside the caller's
   * transaction (used by `PoFactory.create` so counter + PO insert commit
   * together).
   */
  async allocate(
    organizationId: string,
    asOf: Date,
    manager?: EntityManager,
  ): Promise<string> {
    const year = asOf.getUTCFullYear();
    const sequence = await this.counterService.allocateNext(
      organizationId,
      year,
      manager,
    );
    return PoNumberService.format(year, sequence);
  }

  /**
   * Defensive parser for legacy lookups. Returns null on malformed input.
   */
  parse(poNumber: string): { year: number; sequence: number } | null {
    const match = PO_NUMBER_RX.exec(poNumber);
    if (match === null) return null;
    const year = Number.parseInt(match[1], 10);
    const sequence = Number.parseInt(match[2], 10);
    if (!Number.isFinite(year) || !Number.isFinite(sequence)) return null;
    return { year, sequence };
  }

  /**
   * Format a (year, sequence) pair as `PO-{YYYY}-{nnnn}`. Public so tests
   * and downstream consumers (slice #8 UI) can reuse the canonical form.
   */
  static format(year: number, sequence: number): string {
    return `PO-${year}-${String(sequence).padStart(4, '0')}`;
  }
}
