/**
 * Recall BC — module-level constants.
 *
 * Per architecture-m3.md line 397-398: the canonical depth cap for the
 * recall trace traversal lives here. The recursive CTE filter
 * (`WHERE depth < :maxDepth`) reads this constant unless the per-org
 * override (`organizations.recall_max_depth INT NULL`) is set.
 *
 * Per ADR-028: walking the consumption graph beyond depth 10 is unusual
 * even for multi-location chains; multi-location operators with
 * supplier-of-supplier graphs needing more depth set the per-org
 * override (capped at 30 by the migration CHECK constraint).
 *
 * NOTE on parallel slice #11 (m3-incident-search-multi-anchor):
 * if slice #11 lands first, this file is re-exported from there at
 * rebase time. The slice #12 worktree creates the file outright; the
 * value MUST stay identical across both slices.
 */
export const RECALL_TRACE_MAX_DEPTH = 10;

/**
 * Hard upper bound enforced both by the migration's CHECK constraint
 * (`recall_max_depth BETWEEN 1 AND 30`) and by `resolveMaxDepth()` in
 * `trace.service.ts`. Operators cannot exceed this without a code change.
 */
export const RECALL_TRACE_MAX_DEPTH_HARD_CAP = 30;
