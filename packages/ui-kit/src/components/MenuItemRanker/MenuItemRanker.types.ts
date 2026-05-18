/**
 * Mirrors apps/api/src/dashboard/interface/dto/dashboard.dto.ts (subset).
 * Hand-mirrored per #12 + #13 retro tech-debt note (codegen pipeline filed).
 */

import type { MarginReport } from '../MarginPanel';

export interface DashboardMenuItem {
  menuItemId: string;
  recipeId: string;
  locationId: string;
  channel: string;
  displayLabel: string;
  margin: MarginReport;
}

export interface MenuItemRankerProps {
  /** Top-N items (e.g. top-5 by margin descending). Empty when not yet loaded. */
  top: DashboardMenuItem[];
  /** Bottom-N items (e.g. bottom-5 by margin ascending). Empty when not yet loaded. */
  bottom: DashboardMenuItem[];
  loading?: boolean;
  /** Empty-state copy when both top and bottom are []. */
  emptyStateCopy?: string;
  /** Currency formatting locale. Defaults to en-EU. */
  locale?: string;
  /** When provided, renders a "View details" affordance on each card; the consumer handles routing. */
  onViewDetails?: (item: DashboardMenuItem) => void;
  /**
   * When `true`, each card carries a muted "Datos de ejemplo" chip and the
   * top of the region renders an explanatory banner. Used by the OwnerDashboard
   * demo fallback when the org has no real menu items yet (audit 2026-05-18 v3
   * §Sprint-2 backlog — surface must answer §1.1 JTBD on first contact).
   */
  demoMode?: boolean;
  className?: string;
}
