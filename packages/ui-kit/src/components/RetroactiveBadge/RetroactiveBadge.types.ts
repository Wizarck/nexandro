/**
 * Primitive for the "Cambios retroactivos" affordance per
 * `docs/ux/j13.md` §5.2 (Master-approved 2026-05-18, decision #5).
 *
 * Two surface modes:
 *   - Always-on Dashboard / nav pill ("Cambios retroactivos · 3" or
 *     "Cambios retroactivos · 0 / N esta semana" zero-state).
 *   - Badge-driven count on downstream artefacts (Recetas, Etiquetas,
 *     HACCP) per §5.1 — not wired in this PR; primitive ready.
 */
export interface RetroactiveBadgeProps {
  /** Current count of pending retroactive changes. */
  count: number;
  /**
   * Optional venue label rendered next to the count for multi-venue
   * Owners. j13 §5 + Manager-persona note in
   * `docs/audit-2026-05-18-v3-detail-08-cola-revision.md` §3 require
   * venue-scoping on the Dashboard pill (not org-wide).
   */
  venue?: string;
  /**
   * Zero-state behaviour per Master decision #5:
   *   - 'show'  → render `0 / N esta semana` outline (default; teaches affordance).
   *   - 'hide'  → render `null` (use when the surface already says
   *               "todo al día" elsewhere, e.g. an empty-state card).
   */
  zeroState?: 'show' | 'hide';
  /**
   * Weekly total used in the zero-state phrasing (`0 / N esta semana`).
   * Falls back to `0` when omitted; renders as `0 / 0 esta semana`.
   */
  weeklyTotal?: number;
  /**
   * Optional href override. Defaults to `/m3/review-queue` per j13 §5.3
   * "Direct URL preserved for bookmarks + audit + integrations".
   */
  href?: string;
  /** Optional className for layout overrides. */
  className?: string;
}
