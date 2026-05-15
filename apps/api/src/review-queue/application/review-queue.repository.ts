import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  ListFlaggedOptions,
  ListFlaggedResult,
  ReviewQueueGrDetails,
  ReviewQueueLotDetails,
  ReviewQueueRow,
} from './types';
import { REVIEW_QUEUE_DEFAULT_LIMIT, REVIEW_QUEUE_MAX_LIMIT } from './types';

/**
 * Raw-SQL repository for the review-queue BC
 * (`m3.x-review-queue-backend`). Lives in its own BC per
 * ADR-CROSS-BC-SUBSCRIBER-LOCATION (slice #21) to avoid coupling
 * inventory + procurement to a cross-aggregate read concern.
 *
 * `flaggedAt` is derived from the most-recent `LOT_FLAGGED_FOR_REVIEW`
 * / `GR_FLAGGED_FOR_REVIEW` audit envelope for the row. TypeORM's
 * `@UpdateDateColumn` is unreliable here because the listener slice
 * (#157) flips `requires_review=true` via raw SQL UPDATE, which does
 * NOT trigger TypeORM's auto-update. The audit-log envelope is the
 * canonical signal. The partial index
 * `ix_audit_log_aggregate(organization_id, aggregate_type, aggregate_id,
 * created_at)` makes the correlated lookup cheap.
 *
 * The graceful 42703 probe catches deployments that have not yet
 * applied migration 0041 (which brings the `requires_review` column
 * into `lots` + `goods_receipts`). Mirrors the
 * `DownstreamRevocationRepository` pattern.
 */
interface LotQueueRowRaw {
  aggregate_id: string;
  organization_id: string;
  source_photo_ingestion_id: string | null;
  received_at: Date;
  location_id: string;
  supplier_id: string | null;
  unit: string;
  flagged_at: Date | null;
}

interface GrQueueRowRaw {
  aggregate_id: string;
  organization_id: string;
  source_photo_ingestion_id: string | null;
  received_at: Date;
  supplier_id: string;
  supplier_invoice_ref: string | null;
  received_at_location_id: string;
  flagged_at: Date | null;
}

interface ClearRawRow {
  was_flagged: boolean;
  source_photo_ingestion_id: string | null;
}

@Injectable()
export class ReviewQueueRepository {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async listFlagged(
    organizationId: string,
    opts: ListFlaggedOptions = {},
  ): Promise<ListFlaggedResult> {
    const limit = this.clampLimit(opts.limit);
    // Fetch one extra row per aggregate type so we can detect truncation
    // without an extra COUNT roundtrip. After merging + sorting we slice
    // back to `limit`.
    const probeLimit = limit + 1;

    let lotRows: LotQueueRowRaw[] = [];
    let grRows: GrQueueRowRaw[] = [];

    if (opts.aggregateType !== 'goods_receipt') {
      lotRows = await this.queryFlaggedLots(organizationId, probeLimit);
    }
    if (opts.aggregateType !== 'lot') {
      grRows = await this.queryFlaggedGrs(organizationId, probeLimit);
    }

    const merged: ReviewQueueRow[] = [
      ...lotRows.map(toLotRow),
      ...grRows.map(toGrRow),
    ];
    // Newest-first by flagged_at. Null flagged_at (no audit envelope yet,
    // unlikely but possible if the row was hand-flagged) sinks to the
    // bottom.
    merged.sort((a, b) => {
      if (a.flaggedAt === b.flaggedAt) return 0;
      if (!a.flaggedAt) return 1;
      if (!b.flaggedAt) return -1;
      return b.flaggedAt.localeCompare(a.flaggedAt);
    });

    const truncated = merged.length > limit;
    return {
      rows: truncated ? merged.slice(0, limit) : merged,
      truncated,
    };
  }

  async clearLotReview(
    organizationId: string,
    lotId: string,
  ): Promise<{ cleared: boolean; alreadyClear: boolean; sourcePhotoIngestionId: string | null }> {
    try {
      const result: ClearRawRow[] = await this.dataSource.query(
        `WITH prior AS (
          SELECT "id", "source_photo_ingestion_id", "requires_review" AS was_flagged
          FROM "lots"
          WHERE "id" = $1 AND "organization_id" = $2
        ),
        upd AS (
          UPDATE "lots"
            SET "requires_review" = false
          WHERE "id" = $1 AND "organization_id" = $2 AND "requires_review" = true
          RETURNING "id"
        )
        SELECT prior.was_flagged, prior.source_photo_ingestion_id
        FROM prior`,
        [lotId, organizationId],
      );
      return this.interpretClearResult(result);
    } catch (err) {
      if (this.isUndefinedColumn(err)) {
        // Migration 0041 not applied on this deployment; treat as
        // already-clear so callers don't see a 500.
        return { cleared: true, alreadyClear: true, sourcePhotoIngestionId: null };
      }
      throw err;
    }
  }

  async clearGrReview(
    organizationId: string,
    grId: string,
  ): Promise<{ cleared: boolean; alreadyClear: boolean; sourcePhotoIngestionId: string | null }> {
    try {
      const result: ClearRawRow[] = await this.dataSource.query(
        `WITH prior AS (
          SELECT "id", "source_photo_ingestion_id", "requires_review" AS was_flagged
          FROM "goods_receipts"
          WHERE "id" = $1 AND "organization_id" = $2
        ),
        upd AS (
          UPDATE "goods_receipts"
            SET "requires_review" = false
          WHERE "id" = $1 AND "organization_id" = $2 AND "requires_review" = true
          RETURNING "id"
        )
        SELECT prior.was_flagged, prior.source_photo_ingestion_id
        FROM prior`,
        [grId, organizationId],
      );
      return this.interpretClearResult(result);
    } catch (err) {
      if (this.isUndefinedColumn(err)) {
        return { cleared: true, alreadyClear: true, sourcePhotoIngestionId: null };
      }
      throw err;
    }
  }

  private interpretClearResult(result: ClearRawRow[]): {
    cleared: boolean;
    alreadyClear: boolean;
    sourcePhotoIngestionId: string | null;
  } {
    if (result.length === 0) {
      // Cross-tenant lookup OR unknown id — same shape as already-clear
      // per ADR-NO-EXISTENCE-DISCLOSURE. Caller treats as no-op.
      return { cleared: true, alreadyClear: true, sourcePhotoIngestionId: null };
    }
    const row = result[0];
    return {
      cleared: true,
      alreadyClear: !row.was_flagged,
      sourcePhotoIngestionId: row.source_photo_ingestion_id,
    };
  }

  private async queryFlaggedLots(
    organizationId: string,
    limit: number,
  ): Promise<LotQueueRowRaw[]> {
    try {
      return await this.dataSource.query(
        `SELECT l."id" AS aggregate_id,
                l."organization_id",
                l."source_photo_ingestion_id",
                l."received_at",
                l."location_id",
                l."supplier_id",
                l."unit",
                (SELECT al."created_at"
                   FROM "audit_log" al
                  WHERE al."organization_id" = l."organization_id"
                    AND al."aggregate_type" = 'lot'
                    AND al."aggregate_id" = l."id"
                    AND al."event_type" = 'LOT_FLAGGED_FOR_REVIEW'
                  ORDER BY al."created_at" DESC
                  LIMIT 1) AS flagged_at
           FROM "lots" l
          WHERE l."organization_id" = $1
            AND l."requires_review" = true
          ORDER BY flagged_at DESC NULLS LAST
          LIMIT $2`,
        [organizationId, limit],
      );
    } catch (err) {
      if (this.isUndefinedColumn(err)) return [];
      throw err;
    }
  }

  private async queryFlaggedGrs(
    organizationId: string,
    limit: number,
  ): Promise<GrQueueRowRaw[]> {
    try {
      return await this.dataSource.query(
        `SELECT gr."id" AS aggregate_id,
                gr."organization_id",
                gr."source_photo_ingestion_id",
                gr."received_at",
                gr."supplier_id",
                gr."supplier_invoice_ref",
                gr."received_at_location_id",
                (SELECT al."created_at"
                   FROM "audit_log" al
                  WHERE al."organization_id" = gr."organization_id"
                    AND al."aggregate_type" = 'goods_receipt'
                    AND al."aggregate_id" = gr."id"
                    AND al."event_type" = 'GR_FLAGGED_FOR_REVIEW'
                  ORDER BY al."created_at" DESC
                  LIMIT 1) AS flagged_at
           FROM "goods_receipts" gr
          WHERE gr."organization_id" = $1
            AND gr."requires_review" = true
          ORDER BY flagged_at DESC NULLS LAST
          LIMIT $2`,
        [organizationId, limit],
      );
    } catch (err) {
      if (this.isUndefinedColumn(err)) return [];
      throw err;
    }
  }

  private clampLimit(raw: number | undefined): number {
    if (raw === undefined) return REVIEW_QUEUE_DEFAULT_LIMIT;
    if (!Number.isInteger(raw) || raw < 1) return REVIEW_QUEUE_DEFAULT_LIMIT;
    return Math.min(raw, REVIEW_QUEUE_MAX_LIMIT);
  }

  /**
   * Postgres error code `42703` (`undefined_column`). TypeORM surfaces
   * this either at the top level or nested in `driverError`, depending
   * on whether the connection pool wrapped it. Same probe pattern as
   * `DownstreamRevocationRepository`.
   */
  private isUndefinedColumn(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { code?: unknown; driverError?: { code?: unknown } };
    if (e.code === '42703') return true;
    if (
      e.driverError &&
      typeof e.driverError === 'object' &&
      (e.driverError as { code?: unknown }).code === '42703'
    ) {
      return true;
    }
    return false;
  }
}

function toLotRow(r: LotQueueRowRaw): ReviewQueueRow {
  const details: ReviewQueueLotDetails = {
    aggregateType: 'lot',
    receivedAt: r.received_at.toISOString(),
    locationId: r.location_id,
    supplierId: r.supplier_id,
    unit: r.unit,
  };
  return {
    aggregateType: 'lot',
    aggregateId: r.aggregate_id,
    organizationId: r.organization_id,
    sourcePhotoIngestionId: r.source_photo_ingestion_id,
    details,
    flaggedAt: r.flagged_at
      ? r.flagged_at.toISOString()
      : '1970-01-01T00:00:00.000Z',
  };
}

function toGrRow(r: GrQueueRowRaw): ReviewQueueRow {
  const details: ReviewQueueGrDetails = {
    aggregateType: 'goods_receipt',
    receivedAt: r.received_at.toISOString(),
    supplierId: r.supplier_id,
    supplierInvoiceRef: r.supplier_invoice_ref,
    receivedAtLocationId: r.received_at_location_id,
  };
  return {
    aggregateType: 'goods_receipt',
    aggregateId: r.aggregate_id,
    organizationId: r.organization_id,
    sourcePhotoIngestionId: r.source_photo_ingestion_id,
    details,
    flaggedAt: r.flagged_at
      ? r.flagged_at.toISOString()
      : '1970-01-01T00:00:00.000Z',
  };
}
