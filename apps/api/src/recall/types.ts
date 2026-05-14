/**
 * Recall BC — inline trace shape.
 *
 * Per ADR-TRACE-NODE-SHAPE (design.md, m3-trace-tree-forward-reverse,
 * Wave 2.5 slice #12): the `TraceNode` shape is declared inline in
 * `apps/api/` and re-declared in `packages/ui-kit/` per the Wave 2.1
 * hard constraint banning `@opentrattos/contracts` imports in apps/api
 * (TS6059 `rootDir` cascade — see feedback_subagent_apply_typing_fix_cascade).
 *
 * The frontend's copy lives at
 * `packages/ui-kit/src/components/RecallTraceTree/types.ts`. The two
 * shapes are structurally identical; the wire format is JSON and the
 * controller serialises this type directly.
 */

/** Tree-node kind, mirrors the j6 recall-investigate visual hierarchy. */
export type TraceNodeKind = 'lot' | 'recipe' | 'menu-item' | 'service-window';

/** Reverse-anchor kinds the service can resolve TODAY. Slice #11 will widen this. */
export type ReverseAnchorKind = 'symptom' | 'menu-item' | 'recipe';

/**
 * Reverse-trace anchor input. `'symptom'` requires slice #11's
 * incident-search resolver — until that lands, the service throws
 * `RecallInvalidAnchorKindError` for symptom anchors.
 */
export interface ReverseAnchor {
  id: string;
  kind: ReverseAnchorKind;
}

/**
 * Canonical recursive trace node.
 *
 * `quantityBadge` is pre-rendered as a human string (e.g. "2.4 kg") at
 * the service boundary so the frontend doesn't need to know per-unit
 * formatting. Reserved for nodes where the parent → child edge carries
 * a quantity (lot → recipe and recipe → menu-item edges; the service-
 * window leaf nodes omit it).
 *
 * `depthExceeded` is set on leaves where the traversal would have
 * continued past `RECALL_TRACE_MAX_DEPTH` (or the per-org override).
 * The frontend renders these with a muted `…profundidad excedida`
 * eyebrow.
 */
export interface TraceNode {
  id: string;
  kind: TraceNodeKind;
  label: string;
  quantityBadge?: string;
  children: TraceNode[];
  depthExceeded?: boolean;
}

/** Optional caller overrides for traceForward / traceReverse. */
export interface TraceOptions {
  /**
   * Caller-supplied depth cap. The service clamps to
   * `min(opts.maxDepth, org.recall_max_depth ?? RECALL_TRACE_MAX_DEPTH)`
   * before issuing the SQL. Never exceeds the hard cap.
   */
  maxDepth?: number;
}
