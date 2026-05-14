import { TraceService, TraceFlatRow } from './trace.service';
import {
  RecallAnchorNotFoundError,
  RecallInvalidAnchorKindError,
} from './trace.errors';
import {
  RECALL_TRACE_MAX_DEPTH,
  RECALL_TRACE_MAX_DEPTH_HARD_CAP,
} from '../domain/constants';

/**
 * `TraceService` unit tests (Jest, per apps/api convention).
 *
 * Coverage:
 *  - `buildTree()` pure tree-build pass (static method, no DB)
 *  - `resolveMaxDepth()` clamping (constant default, per-org override, opts override, hard cap, floor)
 *  - `traceForward()` error paths (anchor not found, empty consumption)
 *  - `traceReverse()` kind validation (symptom + unknown → RecallInvalidAnchorKindError; absent → RecallAnchorNotFoundError)
 *
 * SQL execution is verified in the deferred INT test
 * (`apps/api/test/int/recall-traversal-depth.int-spec.ts`).
 */

const ORG_A = '11111111-1111-4111-8111-111111111111';
const LOT_X = '22222222-2222-4222-8222-222222222222';
const RECIPE_R = '33333333-3333-4333-8333-333333333333';
const MENU_M = '44444444-4444-4444-8444-444444444444';

interface FakeDataSource {
  query: jest.Mock;
}

function buildService(ds: FakeDataSource): TraceService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new TraceService(ds as any);
}

describe('TraceService.buildTree', () => {
  it('builds a 3-level tree from a flat row-set in a single pass', () => {
    const rows: TraceFlatRow[] = [
      {
        node_id: LOT_X,
        node_kind: 'lot',
        parent_id: null,
        depth: 0,
        label: 'Lote ABC123',
        quantity_badge: null,
      },
      {
        node_id: RECIPE_R,
        node_kind: 'recipe',
        parent_id: LOT_X,
        depth: 1,
        label: 'Receta 33333333',
        quantity_badge: null,
      },
      {
        node_id: MENU_M,
        node_kind: 'menu-item',
        parent_id: RECIPE_R,
        depth: 2,
        label: 'Plato 44444444',
        quantity_badge: null,
      },
    ];

    const tree = TraceService.buildTree(rows, LOT_X, 10, new Set());

    expect(tree.id).toBe(LOT_X);
    expect(tree.kind).toBe('lot');
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]?.kind).toBe('recipe');
    expect(tree.children[0]?.children).toHaveLength(1);
    expect(tree.children[0]?.children[0]?.kind).toBe('menu-item');
    expect(tree.children[0]?.children[0]?.children).toHaveLength(0);
  });

  it('marks depthExceeded=true on leaves at maxDepth-1 when would-have-children probe says so', () => {
    const rows: TraceFlatRow[] = [
      {
        node_id: LOT_X,
        node_kind: 'lot',
        parent_id: null,
        depth: 0,
        label: 'Lote',
        quantity_badge: null,
      },
      {
        node_id: RECIPE_R,
        node_kind: 'recipe',
        parent_id: LOT_X,
        depth: 1,
        label: 'Receta',
        quantity_badge: null,
      },
    ];

    const tree = TraceService.buildTree(rows, LOT_X, 2, new Set([RECIPE_R]));

    expect(tree.children[0]?.depthExceeded).toBe(true);
  });

  it('does NOT mark depthExceeded when the probe set is empty', () => {
    const rows: TraceFlatRow[] = [
      {
        node_id: LOT_X,
        node_kind: 'lot',
        parent_id: null,
        depth: 0,
        label: 'Lote',
        quantity_badge: null,
      },
      {
        node_id: RECIPE_R,
        node_kind: 'recipe',
        parent_id: LOT_X,
        depth: 1,
        label: 'Receta',
        quantity_badge: null,
      },
    ];

    const tree = TraceService.buildTree(rows, LOT_X, 2, new Set());

    expect(tree.children[0]?.depthExceeded).toBeUndefined();
  });

  it('returns the empty-root shape when the root id is not in the row-set', () => {
    const tree = TraceService.buildTree([], LOT_X, 10, new Set());

    expect(tree.id).toBe(LOT_X);
    expect(tree.kind).toBe('lot');
    expect(tree.children).toHaveLength(0);
  });

  it('preserves quantityBadge when present in the row', () => {
    const rows: TraceFlatRow[] = [
      {
        node_id: LOT_X,
        node_kind: 'lot',
        parent_id: null,
        depth: 0,
        label: 'Lote',
        quantity_badge: '2.4 kg',
      },
    ];

    const tree = TraceService.buildTree(rows, LOT_X, 10, new Set());

    expect(tree.quantityBadge).toBe('2.4 kg');
  });
});

describe('TraceService.resolveMaxDepth', () => {
  it('returns RECALL_TRACE_MAX_DEPTH when org override is NULL and no opts passed', async () => {
    const ds: FakeDataSource = {
      query: jest.fn().mockResolvedValueOnce([{ recall_max_depth: null }]),
    };
    const svc = buildService(ds);

    const max = await svc.resolveMaxDepth(ORG_A);

    expect(max).toBe(RECALL_TRACE_MAX_DEPTH);
  });

  it('honours the per-org override', async () => {
    const ds: FakeDataSource = {
      query: jest.fn().mockResolvedValueOnce([{ recall_max_depth: 5 }]),
    };
    const svc = buildService(ds);

    const max = await svc.resolveMaxDepth(ORG_A);

    expect(max).toBe(5);
  });

  it('clamps opts.maxDepth to the org-level cap', async () => {
    const ds: FakeDataSource = {
      query: jest.fn().mockResolvedValueOnce([{ recall_max_depth: 5 }]),
    };
    const svc = buildService(ds);

    const max = await svc.resolveMaxDepth(ORG_A, 999);

    expect(max).toBe(5);
  });

  it('never exceeds the hard cap regardless of org override', async () => {
    const ds: FakeDataSource = {
      query: jest.fn().mockResolvedValueOnce([{ recall_max_depth: 50 }]),
    };
    const svc = buildService(ds);

    const max = await svc.resolveMaxDepth(ORG_A, 999);

    expect(max).toBe(RECALL_TRACE_MAX_DEPTH_HARD_CAP);
  });

  it('floors at 1 if a zero somehow slipped through', async () => {
    const ds: FakeDataSource = {
      query: jest.fn().mockResolvedValueOnce([{ recall_max_depth: null }]),
    };
    const svc = buildService(ds);

    const max = await svc.resolveMaxDepth(ORG_A, 0);

    expect(max).toBe(1);
  });

  it('falls back to the constant when the column SELECT errors (e.g. migration not yet applied)', async () => {
    const ds: FakeDataSource = {
      query: jest
        .fn()
        .mockRejectedValueOnce(new Error('column does not exist')),
    };
    const svc = buildService(ds);

    const max = await svc.resolveMaxDepth(ORG_A);

    expect(max).toBe(RECALL_TRACE_MAX_DEPTH);
  });
});

describe('TraceService.traceForward', () => {
  it('throws RecallAnchorNotFoundError when the lot does not exist in the org', async () => {
    const ds: FakeDataSource = {
      query: jest
        .fn()
        // 1: probeLotExists
        .mockResolvedValueOnce([]),
    };
    const svc = buildService(ds);

    await expect(svc.traceForward(ORG_A, LOT_X)).rejects.toBeInstanceOf(
      RecallAnchorNotFoundError,
    );
  });

  it('returns the empty-root tree when no consumption rows reference the lot', async () => {
    const ds: FakeDataSource = {
      query: jest
        .fn()
        // 1: probeLotExists
        .mockResolvedValueOnce([{ id: LOT_X, supplier_lot_code: 'ABC' }])
        // 2: readOrgDepthOverride
        .mockResolvedValueOnce([{ recall_max_depth: null }])
        // 3: runForwardCte (only the root row)
        .mockResolvedValueOnce([
          {
            node_id: LOT_X,
            node_kind: 'lot',
            parent_id: null,
            depth: 0,
            label: 'Lote ABC',
            quantity_badge: null,
          },
        ]),
    };
    // probeWouldHaveChildren is NOT called when leafIdsAtCap is empty
    // (root-only result-set at depth 0 has no row at depth = max - 1
    // for max > 1).
    const svc = buildService(ds);

    const tree = await svc.traceForward(ORG_A, LOT_X);

    expect(tree.id).toBe(LOT_X);
    expect(tree.kind).toBe('lot');
    expect(tree.children).toHaveLength(0);
  });
});

describe('TraceService.traceReverse', () => {
  it('throws RecallInvalidAnchorKindError for symptom anchors (slice #11 resolver not yet wired)', async () => {
    const ds: FakeDataSource = { query: jest.fn() };
    const svc = buildService(ds);

    await expect(
      svc.traceReverse(ORG_A, { id: MENU_M, kind: 'symptom' }),
    ).rejects.toBeInstanceOf(RecallInvalidAnchorKindError);
  });

  it('throws RecallInvalidAnchorKindError for unknown anchor kinds', async () => {
    const ds: FakeDataSource = { query: jest.fn() };
    const svc = buildService(ds);

    await expect(
      svc.traceReverse(ORG_A, {
        id: MENU_M,
        kind: 'unknown' as unknown as 'recipe',
      }),
    ).rejects.toBeInstanceOf(RecallInvalidAnchorKindError);
  });

  it('throws RecallAnchorNotFoundError when the anchor has never appeared in audit_log for the org', async () => {
    const ds: FakeDataSource = {
      query: jest
        .fn()
        // probeAnchorEverConsumed → false
        .mockResolvedValueOnce([{ exists: false }]),
    };
    const svc = buildService(ds);

    await expect(
      svc.traceReverse(ORG_A, { id: MENU_M, kind: 'menu-item' }),
    ).rejects.toBeInstanceOf(RecallAnchorNotFoundError);
  });
});
