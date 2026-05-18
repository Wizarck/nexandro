import type { DashboardMenuItem } from '@nexandro/ui-kit';

/**
 * Italian-trattoria-themed demo fixtures used to fill MenuItemRanker when the
 * org has no real menu items yet AND demo mode is active (`?demo=true` query
 * param or `VITE_DEMO_MODE=true` env). Audit 2026-05-18 v3 §Sprint-2 backlog:
 * the page MUST answer the §1.1 JTBD even on first contact — empty ranker
 * "Aún no hay platos…" is a dead end for the Sunday-night Owner.
 *
 * Each item carries a realistic UUID, EUR price/cost, and margin %. The
 * cards downstream render a "Datos de ejemplo" badge so the Owner cannot
 * mistake these for real numbers (the audit doc anchors this banner copy).
 */

const ORG_ID = '00000000-0000-4000-8000-000000000d3a';
const LOC_ID = '00000000-0000-4000-8000-000000000d3b';

interface DemoSeed {
  menuItemId: string;
  recipeId: string;
  displayLabel: string;
  cost: number;
  sellingPrice: number;
  /** Effective margin pct (0–1) — derived from cost & sellingPrice, kept explicit for legibility. */
  marginPct: number;
}

// Top-5 winners — comfortably above the 60 % target band.
const TOP_SEED: DemoSeed[] = [
  {
    menuItemId: 'demo-top-01',
    recipeId: '11111111-1111-4111-8111-111111111101',
    displayLabel: 'Pizza Margarita',
    cost: 2.4,
    sellingPrice: 11.0,
    marginPct: 0.7818,
  },
  {
    menuItemId: 'demo-top-02',
    recipeId: '11111111-1111-4111-8111-111111111102',
    displayLabel: 'Bruschetta al Pomodoro',
    cost: 1.8,
    sellingPrice: 7.5,
    marginPct: 0.76,
  },
  {
    menuItemId: 'demo-top-03',
    recipeId: '11111111-1111-4111-8111-111111111103',
    displayLabel: 'Tiramisú della Casa',
    cost: 2.1,
    sellingPrice: 8.0,
    marginPct: 0.7375,
  },
  {
    menuItemId: 'demo-top-04',
    recipeId: '11111111-1111-4111-8111-111111111104',
    displayLabel: 'Spaghetti alla Carbonara',
    cost: 3.9,
    sellingPrice: 14.5,
    marginPct: 0.731,
  },
  {
    menuItemId: 'demo-top-05',
    recipeId: '11111111-1111-4111-8111-111111111105',
    displayLabel: 'Insalata Caprese',
    cost: 3.2,
    sellingPrice: 11.5,
    marginPct: 0.7217,
  },
];

// Bottom-5 losers — below 60 % target, some near-discontinue.
const BOTTOM_SEED: DemoSeed[] = [
  {
    menuItemId: 'demo-bot-01',
    recipeId: '22222222-2222-4222-8222-222222222201',
    displayLabel: 'Risotto ai Funghi Porcini',
    cost: 9.8,
    sellingPrice: 18.5,
    marginPct: 0.4703,
  },
  {
    menuItemId: 'demo-bot-02',
    recipeId: '22222222-2222-4222-8222-222222222202',
    displayLabel: 'Branzino al Sale',
    cost: 11.6,
    sellingPrice: 24.0,
    marginPct: 0.5167,
  },
  {
    menuItemId: 'demo-bot-03',
    recipeId: '22222222-2222-4222-8222-222222222203',
    displayLabel: 'Vitello Tonnato',
    cost: 9.2,
    sellingPrice: 19.5,
    marginPct: 0.5282,
  },
  {
    menuItemId: 'demo-bot-04',
    recipeId: '22222222-2222-4222-8222-222222222204',
    displayLabel: 'Ossobuco alla Milanese',
    cost: 10.5,
    sellingPrice: 22.0,
    marginPct: 0.5227,
  },
  {
    menuItemId: 'demo-bot-05',
    recipeId: '22222222-2222-4222-8222-222222222205',
    displayLabel: 'Cannoli Siciliani',
    cost: 3.4,
    sellingPrice: 8.5,
    marginPct: 0.6, // borderline — exactly at target
  },
];

function toItem(s: DemoSeed, status: 'on_target' | 'below_target'): DashboardMenuItem {
  const marginAbsolute = s.sellingPrice - s.cost;
  const targetMargin = 0.6;
  return {
    menuItemId: s.menuItemId,
    recipeId: s.recipeId,
    locationId: LOC_ID,
    channel: 'DINE_IN',
    displayLabel: s.displayLabel,
    margin: {
      menuItemId: s.menuItemId,
      organizationId: ORG_ID,
      recipeId: s.recipeId,
      locationId: LOC_ID,
      channel: 'DINE_IN',
      cost: Number(s.cost.toFixed(2)),
      sellingPrice: Number(s.sellingPrice.toFixed(2)),
      targetMargin,
      marginAbsolute: Number(marginAbsolute.toFixed(2)),
      marginPercent: Number(s.marginPct.toFixed(4)),
      marginVsTargetPp: Number((s.marginPct - targetMargin).toFixed(4)),
      status,
      statusLabel: status === 'on_target' ? 'En objetivo' : 'Bajo el objetivo',
      warnings: [],
      recipeDiscontinued: false,
      currency: 'EUR',
    },
  };
}

export interface DemoMenuItems {
  top: DashboardMenuItem[];
  bottom: DashboardMenuItem[];
}

/**
 * Returns hardcoded Italian-trattoria menu items so the dashboard demonstrably
 * answers §1.1 JTBD even when the org has zero real data. Pure synchronous —
 * no fetch, no hook plumbing — so safe to call from any render path.
 */
export function getDemoMenuItems(): DemoMenuItems {
  return {
    top: TOP_SEED.map((s) => toItem(s, 'on_target')),
    bottom: BOTTOM_SEED.map((s) => toItem(s, 'below_target')),
  };
}

/**
 * Returns true when the surface should swap empty real-data lists for the
 * demo fixtures. Activated either by `?demo=true` on the URL (operator-led
 * preview) or by `VITE_DEMO_MODE=true` at build time (lighthouse deploys).
 */
export function isDemoModeActive(searchParams: URLSearchParams): boolean {
  if (searchParams.get('demo') === 'true') return true;
  const envFlag = String(import.meta.env.VITE_DEMO_MODE ?? '').toLowerCase();
  return envFlag === 'true' || envFlag === '1';
}
