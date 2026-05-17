/**
 * Frontend mirror of the `TraceNode` shape defined in
 * `apps/api/src/recall/types.ts`.
 *
 * Duplicated per ADR-TRACE-NODE-SHAPE (design.md, m3-trace-tree-forward-
 * reverse, Wave 2.5 slice #12) — Wave 2.1 hard constraint bans
 * `@nexandro/contracts` imports in apps/api (TS6059 `rootDir`
 * cascade). The two copies are structurally identical; the controller
 * serialises to JSON and the frontend deserialises into the local
 * shape. A future slice promotes the shape to `packages/contracts/`
 * once the workspace rootDir story is resolved.
 */

export type TraceNodeKind = 'lot' | 'recipe' | 'menu-item' | 'service-window';

export type ReverseAnchorKind = 'symptom' | 'menu-item' | 'recipe';

export interface ReverseAnchor {
  id: string;
  kind: ReverseAnchorKind;
}

export interface TraceNode {
  id: string;
  kind: TraceNodeKind;
  label: string;
  quantityBadge?: string;
  children: TraceNode[];
  depthExceeded?: boolean;
}

/** Mode chip state in the tree component. */
export type TraceMode = 'forward' | 'reverse';

export interface RecallTraceTreeProps {
  /** Tree to render. Pass `null` while loading; the component renders a skeleton. */
  tree: TraceNode | null;

  /** Current mode chip selection. */
  mode: TraceMode;

  /** Invoked when the operator clicks the inactive mode chip. */
  onModeChange: (next: TraceMode) => void;

  /** Loading flag for the skeleton state. Defaults to false. */
  loading?: boolean;

  /** Optional override for the root region's accessible label. */
  'aria-label'?: string;

  className?: string;
}
