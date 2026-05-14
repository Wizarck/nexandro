import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  RECALL_TRACE_MAX_DEPTH,
  RECALL_TRACE_MAX_DEPTH_HARD_CAP,
} from '../domain/constants';
import {
  ReverseAnchor,
  TraceNode,
  TraceNodeKind,
  TraceOptions,
} from '../types';
import {
  RecallAnchorNotFoundError,
  RecallInvalidAnchorKindError,
} from './trace.errors';

/**
 * Audit-log event-type names this BC reads. Slice #2 + slice #21 produce
 * the `LOT_CONSUMED` rows; this slice walks them.
 */
const EVENT_LOT_CONSUMED = 'LOT_CONSUMED';

/**
 * Shape of a row returned by the recursive CTE before tree-build. The
 * `would_have_children` flag is filled in by the secondary aggregation
 * probe (see {@link TraceService.probeWouldHaveChildren}).
 */
interface FlatRow {
  node_id: string;
  node_kind: TraceNodeKind;
  parent_id: string | null;
  depth: number;
  label: string;
  quantity_badge: string | null;
}

@Injectable()
export class TraceService {
  private readonly logger = new Logger(TraceService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Walk the consumption graph forward from a suspect lot.
   *
   * @returns a TraceNode rooted at the lot whose children are recipes,
   *          then menu-items, then service-window leaves.
   *
   * Throws {@link RecallAnchorNotFoundError} when the lot does not exist
   * in the supplied organisation.
   */
  async traceForward(
    organizationId: string,
    rootLotId: string,
    opts: TraceOptions = {},
  ): Promise<TraceNode> {
    const rootRow = await this.probeLotExists(organizationId, rootLotId);
    if (rootRow === null) {
      throw new RecallAnchorNotFoundError(rootLotId, 'lot');
    }

    const maxDepth = await this.resolveMaxDepth(organizationId, opts.maxDepth);

    const flatRows = await this.runForwardCte(
      organizationId,
      rootLotId,
      maxDepth,
    );

    const leafIdsAtCap = flatRows
      .filter((r) => r.depth === maxDepth - 1)
      .map((r) => r.node_id);
    const withChildren = await this.probeWouldHaveChildren(
      organizationId,
      leafIdsAtCap,
      'forward',
    );

    return TraceService.buildTree(flatRows, rootLotId, maxDepth, withChildren);
  }

  /**
   * Walk the consumption graph backward from an anchor (menu-item /
   * recipe / symptom) to the lots that fed it.
   *
   * `symptom` anchors require slice #11's incident-search resolver; the
   * service throws {@link RecallInvalidAnchorKindError} for that kind
   * until the resolver is wired.
   */
  async traceReverse(
    organizationId: string,
    anchor: ReverseAnchor,
    opts: TraceOptions = {},
  ): Promise<TraceNode> {
    if (anchor.kind === 'symptom') {
      throw new RecallInvalidAnchorKindError(
        'symptom',
        'symptom-anchor resolution requires slice #11 (m3-incident-search-' +
          'multi-anchor); resolver not yet wired into the Recall BC',
      );
    }
    if (anchor.kind !== 'menu-item' && anchor.kind !== 'recipe') {
      // Defensive — DTO validation rejects malformed values; this guard
      // keeps the contract honest at the service boundary.
      throw new RecallInvalidAnchorKindError(
        String(anchor.kind),
        'unknown reverse-anchor kind',
      );
    }

    const anchorExists = await this.probeAnchorEverConsumed(
      organizationId,
      anchor,
    );
    if (!anchorExists) {
      throw new RecallAnchorNotFoundError(anchor.id, anchor.kind);
    }

    const maxDepth = await this.resolveMaxDepth(organizationId, opts.maxDepth);

    const flatRows = await this.runReverseCte(
      organizationId,
      anchor,
      maxDepth,
    );

    const leafIdsAtCap = flatRows
      .filter((r) => r.depth === maxDepth - 1)
      .map((r) => r.node_id);
    const withChildren = await this.probeWouldHaveChildren(
      organizationId,
      leafIdsAtCap,
      'reverse',
    );

    return TraceService.buildTree(flatRows, anchor.id, maxDepth, withChildren);
  }

  /**
   * Resolve the effective depth cap honouring the per-org override.
   *
   * Returns `min(opts, org.recall_max_depth ?? RECALL_TRACE_MAX_DEPTH)`,
   * never exceeding {@link RECALL_TRACE_MAX_DEPTH_HARD_CAP}.
   */
  async resolveMaxDepth(
    organizationId: string,
    optsMaxDepth?: number,
  ): Promise<number> {
    const orgOverride = await this.readOrgDepthOverride(organizationId);
    const orgCap = orgOverride ?? RECALL_TRACE_MAX_DEPTH;
    const requested = optsMaxDepth ?? orgCap;
    const effective = Math.min(requested, orgCap, RECALL_TRACE_MAX_DEPTH_HARD_CAP);
    return Math.max(1, effective);
  }

  /**
   * Single-pass flat-row → tree builder. Exported as a static method so
   * it is unit-testable in isolation without spinning up a DataSource.
   */
  static buildTree(
    rows: FlatRow[],
    rootId: string,
    maxDepth: number,
    withChildrenIds: Set<string>,
  ): TraceNode {
    const byId = new Map<string, TraceNode>();
    for (const row of rows) {
      byId.set(row.node_id, {
        id: row.node_id,
        kind: row.node_kind,
        label: row.label,
        children: [],
        ...(row.quantity_badge != null
          ? { quantityBadge: row.quantity_badge }
          : {}),
      });
    }
    for (const row of rows) {
      if (row.parent_id == null) continue;
      const parent = byId.get(row.parent_id);
      const child = byId.get(row.node_id);
      if (parent && child) parent.children.push(child);
    }
    for (const row of rows) {
      if (row.depth === maxDepth - 1 && withChildrenIds.has(row.node_id)) {
        const node = byId.get(row.node_id);
        if (node) node.depthExceeded = true;
      }
    }
    return (
      byId.get(rootId) ?? {
        id: rootId,
        kind: 'lot',
        label: `Lote ${rootId.slice(0, 8)}`,
        children: [],
      }
    );
  }

  // ---------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------

  private async readOrgDepthOverride(
    organizationId: string,
  ): Promise<number | null> {
    try {
      const rows: Array<{ recall_max_depth: number | null }> =
        await this.dataSource.query(
          `SELECT "recall_max_depth"
             FROM "organizations"
            WHERE "id" = $1
            LIMIT 1`,
          [organizationId],
        );
      if (rows.length === 0) return null;
      const v = rows[0]?.recall_max_depth;
      return v == null ? null : Number(v);
    } catch (err) {
      // Migration 0036 introduces the column; before it runs (e.g. in
      // older test fixtures), the SELECT will fail. Log and fall back to
      // null so the constant default applies.
      this.logger.debug(
        `readOrgDepthOverride fallback: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async probeLotExists(
    organizationId: string,
    lotId: string,
  ): Promise<{ id: string; label: string } | null> {
    const rows: Array<{ id: string; supplier_lot_code: string | null }> =
      await this.dataSource.query(
        `SELECT "id",
                ("metadata"->>'supplier_lot_code') AS "supplier_lot_code"
           FROM "lots"
          WHERE "id" = $1 AND "organization_id" = $2
          LIMIT 1`,
        [lotId, organizationId],
      );
    if (rows.length === 0) return null;
    const r = rows[0];
    if (!r) return null;
    const label =
      r.supplier_lot_code != null && r.supplier_lot_code.length > 0
        ? `Lote ${r.supplier_lot_code}`
        : `Lote ${r.id.slice(0, 8)}`;
    return { id: r.id, label };
  }

  private async probeAnchorEverConsumed(
    organizationId: string,
    anchor: ReverseAnchor,
  ): Promise<boolean> {
    const pathField =
      anchor.kind === 'menu-item' ? 'menu_item_id' : 'recipe_id';
    const rows: Array<{ exists: boolean }> = await this.dataSource.query(
      `SELECT EXISTS (
         SELECT 1 FROM "audit_log"
          WHERE "organization_id" = $1
            AND "event_type" = $2
            AND ("payload_after"->>'${pathField}') = $3
       ) AS "exists"`,
      [organizationId, EVENT_LOT_CONSUMED, anchor.id],
    );
    return rows[0]?.exists === true;
  }

  /**
   * Forward CTE. Anchored on the root lot; each recursive step joins
   * `audit_log` rows that link the frontier node to the next level.
   *
   * Returns rows ordered by `(depth, node_id)`.
   */
  private async runForwardCte(
    organizationId: string,
    rootLotId: string,
    maxDepth: number,
  ): Promise<FlatRow[]> {
    const sql = `
      WITH RECURSIVE forward_trace AS (
        -- depth 0: the root lot itself
        SELECT
          l."id"::text                  AS node_id,
          'lot'::text                    AS node_kind,
          NULL::text                     AS parent_id,
          0::int                         AS depth,
          ('Lote ' || COALESCE(l."metadata"->>'supplier_lot_code', substr(l."id"::text, 1, 8))) AS label,
          NULL::text                     AS quantity_badge
          FROM "lots" l
         WHERE l."id" = $1::uuid
           AND l."organization_id" = $2::uuid

        UNION ALL

        -- depth 1: recipes that consumed FROM the lot
        SELECT
          DISTINCT ON (recipe_node_id)
          recipe_node_id                 AS node_id,
          'recipe'::text                  AS node_kind,
          parent_lot_id                  AS parent_id,
          1                              AS depth,
          ('Receta ' || substr(recipe_node_id, 1, 8)) AS label,
          NULL::text                     AS quantity_badge
        FROM (
          SELECT
            ft."node_id"                                   AS parent_lot_id,
            (a."payload_after"->>'recipe_id')              AS recipe_node_id
          FROM forward_trace ft
          JOIN "audit_log" a
            ON a."organization_id" = $2::uuid
           AND a."event_type" = $3
           AND (a."payload_after"->>'lot_id') = ft."node_id"
           AND (a."payload_after"->>'recipe_id') IS NOT NULL
          WHERE ft."node_kind" = 'lot'
            AND ft."depth" < $4::int
        ) recipe_step

        UNION ALL

        -- depth 2+: menu-items that referenced consumed recipes
        SELECT
          DISTINCT ON (mi_node_id)
          mi_node_id                     AS node_id,
          'menu-item'::text              AS node_kind,
          parent_recipe_id               AS parent_id,
          2                              AS depth,
          ('Plato ' || substr(mi_node_id, 1, 8)) AS label,
          NULL::text                     AS quantity_badge
        FROM (
          SELECT
            ft."node_id"                                   AS parent_recipe_id,
            (a."payload_after"->>'menu_item_id')           AS mi_node_id
          FROM forward_trace ft
          JOIN "audit_log" a
            ON a."organization_id" = $2::uuid
           AND a."event_type" = $3
           AND (a."payload_after"->>'recipe_id') = ft."node_id"
           AND (a."payload_after"->>'menu_item_id') IS NOT NULL
          WHERE ft."node_kind" = 'recipe'
            AND ft."depth" < $4::int
        ) menu_step

        UNION ALL

        -- depth 3+: service-window leaves (per consumption-row date)
        SELECT
          sw_node_id                     AS node_id,
          'service-window'::text         AS node_kind,
          parent_menu_id                 AS parent_id,
          3                              AS depth,
          sw_label                       AS label,
          NULL::text                     AS quantity_badge
        FROM (
          SELECT
            ft."node_id"                                   AS parent_menu_id,
            (a."id"::text)                                 AS sw_node_id,
            ('Servicio ' || to_char((a."payload_after"->>'consumed_at')::timestamptz, 'YYYY-MM-DD HH24:MI')) AS sw_label
          FROM forward_trace ft
          JOIN "audit_log" a
            ON a."organization_id" = $2::uuid
           AND a."event_type" = $3
           AND (a."payload_after"->>'menu_item_id') = ft."node_id"
          WHERE ft."node_kind" = 'menu-item'
            AND ft."depth" < $4::int
        ) sw_step
      )
      SELECT node_id, node_kind, parent_id, depth, label, quantity_badge
        FROM forward_trace
       ORDER BY depth ASC, node_id ASC;
    `;
    const rows: FlatRow[] = await this.dataSource.query(sql, [
      rootLotId,
      organizationId,
      EVENT_LOT_CONSUMED,
      maxDepth,
    ]);
    return rows;
  }

  /**
   * Reverse CTE. Anchored on a menu-item or recipe; walks backward to
   * the lots that fed it.
   */
  private async runReverseCte(
    organizationId: string,
    anchor: ReverseAnchor,
    maxDepth: number,
  ): Promise<FlatRow[]> {
    // Anchor kind dispatches which initial-frontier path the CTE seeds.
    const anchorKind = anchor.kind;
    const anchorLabel =
      anchorKind === 'menu-item'
        ? `Plato ${anchor.id.slice(0, 8)}`
        : `Receta ${anchor.id.slice(0, 8)}`;

    if (anchorKind === 'menu-item') {
      const sql = `
        WITH RECURSIVE reverse_trace AS (
          SELECT
            $1::text                       AS node_id,
            'menu-item'::text              AS node_kind,
            NULL::text                     AS parent_id,
            0::int                         AS depth,
            $4::text                       AS label,
            NULL::text                     AS quantity_badge

          UNION ALL

          -- depth 1: recipes that fed the menu-item
          SELECT
            DISTINCT ON (recipe_node_id)
            recipe_node_id                AS node_id,
            'recipe'::text                AS node_kind,
            parent_mi_id                  AS parent_id,
            1                             AS depth,
            ('Receta ' || substr(recipe_node_id, 1, 8)) AS label,
            NULL::text                    AS quantity_badge
          FROM (
            SELECT
              rt."node_id"                                AS parent_mi_id,
              (a."payload_after"->>'recipe_id')           AS recipe_node_id
            FROM reverse_trace rt
            JOIN "audit_log" a
              ON a."organization_id" = $2::uuid
             AND a."event_type" = $3
             AND (a."payload_after"->>'menu_item_id') = rt."node_id"
             AND (a."payload_after"->>'recipe_id') IS NOT NULL
            WHERE rt."node_kind" = 'menu-item'
              AND rt."depth" < $5::int
          ) recipe_step

          UNION ALL

          -- depth 2+: lots that fed the recipes
          SELECT
            DISTINCT ON (lot_node_id)
            lot_node_id                   AS node_id,
            'lot'::text                   AS node_kind,
            parent_recipe_id              AS parent_id,
            2                             AS depth,
            ('Lote ' || COALESCE(l."metadata"->>'supplier_lot_code', substr(lot_node_id, 1, 8))) AS label,
            NULL::text                    AS quantity_badge
          FROM (
            SELECT
              rt."node_id"                                AS parent_recipe_id,
              (a."payload_after"->>'lot_id')              AS lot_node_id
            FROM reverse_trace rt
            JOIN "audit_log" a
              ON a."organization_id" = $2::uuid
             AND a."event_type" = $3
             AND (a."payload_after"->>'recipe_id') = rt."node_id"
             AND (a."payload_after"->>'lot_id') IS NOT NULL
            WHERE rt."node_kind" = 'recipe'
              AND rt."depth" < $5::int
          ) lot_step
          LEFT JOIN "lots" l ON l."id"::text = lot_step.lot_node_id
        )
        SELECT node_id, node_kind, parent_id, depth, label, quantity_badge
          FROM reverse_trace
         ORDER BY depth ASC, node_id ASC;
      `;
      const rows: FlatRow[] = await this.dataSource.query(sql, [
        anchor.id,
        organizationId,
        EVENT_LOT_CONSUMED,
        anchorLabel,
        maxDepth,
      ]);
      return rows;
    }

    // anchorKind === 'recipe'
    const sql = `
      WITH RECURSIVE reverse_trace AS (
        SELECT
          $1::text                         AS node_id,
          'recipe'::text                  AS node_kind,
          NULL::text                       AS parent_id,
          0::int                           AS depth,
          $4::text                         AS label,
          NULL::text                       AS quantity_badge

        UNION ALL

        -- depth 1: lots that fed the recipe
        SELECT
          DISTINCT ON (lot_node_id)
          lot_node_id                     AS node_id,
          'lot'::text                     AS node_kind,
          parent_recipe_id                AS parent_id,
          1                               AS depth,
          ('Lote ' || COALESCE(l."metadata"->>'supplier_lot_code', substr(lot_node_id, 1, 8))) AS label,
          NULL::text                      AS quantity_badge
        FROM (
          SELECT
            rt."node_id"                                  AS parent_recipe_id,
            (a."payload_after"->>'lot_id')                AS lot_node_id
          FROM reverse_trace rt
          JOIN "audit_log" a
            ON a."organization_id" = $2::uuid
           AND a."event_type" = $3
           AND (a."payload_after"->>'recipe_id') = rt."node_id"
           AND (a."payload_after"->>'lot_id') IS NOT NULL
          WHERE rt."node_kind" = 'recipe'
            AND rt."depth" < $5::int
        ) lot_step
        LEFT JOIN "lots" l ON l."id"::text = lot_step.lot_node_id
      )
      SELECT node_id, node_kind, parent_id, depth, label, quantity_badge
        FROM reverse_trace
       ORDER BY depth ASC, node_id ASC;
    `;
    const rows: FlatRow[] = await this.dataSource.query(sql, [
      anchor.id,
      organizationId,
      EVENT_LOT_CONSUMED,
      anchorLabel,
      maxDepth,
    ]);
    return rows;
  }

  /**
   * Secondary aggregation probe. For each candidate leaf id at
   * `depth = maxDepth - 1`, check whether the audit log would have
   * yielded children if the CTE recursion had not been capped.
   *
   * Returns the set of leaf node ids that DO have would-be children.
   * Empty set when `leafIds` is empty (avoids issuing a no-op query).
   */
  private async probeWouldHaveChildren(
    organizationId: string,
    leafIds: string[],
    direction: 'forward' | 'reverse',
  ): Promise<Set<string>> {
    if (leafIds.length === 0) return new Set();
    // Forward direction: parents are at maxDepth-1; we look for any
    // child-side audit row referring to them. Reverse: symmetric.
    // For simplicity we check both `lot_id` and `recipe_id` and
    // `menu_item_id` referring positions; the index on each path keeps
    // this bounded.
    const sql = `
      SELECT DISTINCT t.parent_node_id AS node_id
        FROM (
          SELECT (a."payload_after"->>'lot_id') AS parent_node_id
            FROM "audit_log" a
           WHERE a."organization_id" = $1::uuid
             AND a."event_type" = $2
             AND (a."payload_after"->>'lot_id') = ANY($3::text[])
          UNION ALL
          SELECT (a."payload_after"->>'recipe_id')
            FROM "audit_log" a
           WHERE a."organization_id" = $1::uuid
             AND a."event_type" = $2
             AND (a."payload_after"->>'recipe_id') = ANY($3::text[])
          UNION ALL
          SELECT (a."payload_after"->>'menu_item_id')
            FROM "audit_log" a
           WHERE a."organization_id" = $1::uuid
             AND a."event_type" = $2
             AND (a."payload_after"->>'menu_item_id') = ANY($3::text[])
        ) t
       WHERE t.parent_node_id IS NOT NULL;
    `;
    // direction is currently a hint; the query is symmetric. Reserved
    // for future fine-tuning when the index plan differs by direction.
    void direction;
    const rows: Array<{ node_id: string }> = await this.dataSource.query(sql, [
      organizationId,
      EVENT_LOT_CONSUMED,
      leafIds,
    ]);
    return new Set(rows.map((r) => r.node_id));
  }
}

export { FlatRow as TraceFlatRow };
