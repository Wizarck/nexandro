import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SUPPLIER_PRICE_UPDATED } from '../../cost/application/cost.events';
import type { AuditEventEnvelope } from '../../audit-log/application/types';
import { MarginReport, MenuItemsService } from '../../menus/application/menu-items.service';

export type RankingDirection = 'top' | 'bottom';

export interface DashboardMenuItem {
  menuItemId: string;
  recipeId: string;
  locationId: string;
  channel: string;
  displayLabel: string;
  margin: MarginReport;
}

export interface KpiMoney {
  valueEur: number | null;
  note?: string;
}

export interface KpiPct {
  value: number | null;
}

export interface KpisResult {
  organizationId: string;
  windowDays: number;
  hasMenuItems: boolean;
  sales: KpiMoney;
  cost: KpiMoney;
  marginEur: KpiMoney;
  marginPct: KpiPct;
  /** Reserved for week-over-week comparison; null until margin time-series ships. */
  deltaVsPrev: null;
}

export interface RankingResult {
  organizationId: string;
  windowDays: number;
  direction: RankingDirection;
  /** When `available < requestedSize`, the response is incomplete (org has fewer MenuItems than requested). */
  incomplete: boolean;
  items: DashboardMenuItem[];
}

interface CacheEntry {
  result: RankingResult;
  expiresAt: number;
  /** Set of recipeIds appearing in the cached items — used by event-driven invalidation. */
  recipeIds: Set<string>;
}

const CACHE_TTL_MS = 60_000;

/**
 * Read-only Owner-dashboard service. Computes top/bottom-N MenuItems by
 * margin across all Locations + Channels for an organization, with a 60s
 * in-memory cache keyed `(orgId, windowDays, direction)`. Cache is
 * invalidated when a SupplierItem price affecting any cached recipe
 * changes.
 *
 * The "window" parameter is reserved for future per-window margin trend
 * scoring; today the live margin is always current (CostService computes
 * read-time). Default windowDays = 7 (Owner's "this week" mental model).
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly menuItems: MenuItemsService) {}

  async getTopBottomMenuItems(
    organizationId: string,
    direction: RankingDirection = 'top',
    windowDays = 7,
    n = 5,
  ): Promise<RankingResult> {
    const key = this.cacheKey(organizationId, windowDays, direction, n);
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      this.logger.debug(`dashboard cache HIT ${key}`);
      return cached.result;
    }
    this.logger.debug(`dashboard cache MISS ${key}`);

    const views = await this.menuItems.findAll(organizationId, { isActive: true });
    const margins: DashboardMenuItem[] = [];
    for (const view of views) {
      const margin = await this.menuItems.getMargin(organizationId, view.menuItem.id);
      margins.push({
        menuItemId: view.menuItem.id,
        recipeId: view.menuItem.recipeId,
        locationId: view.menuItem.locationId,
        channel: view.menuItem.channel,
        displayLabel: view.displayLabel,
        margin,
      });
    }

    // Order by marginPercent. `unknown` items sort last regardless of direction.
    const score = (m: DashboardMenuItem): number =>
      m.margin.marginPercent === null ? Number.NEGATIVE_INFINITY : m.margin.marginPercent;
    margins.sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      if (sa === sb) return 0;
      return direction === 'top' ? sb - sa : sa - sb;
    });
    // Push unknowns to the bottom regardless of direction.
    const known = margins.filter((m) => m.margin.marginPercent !== null);
    const unknown = margins.filter((m) => m.margin.marginPercent === null);
    const ordered = [...known, ...unknown];
    const slice = ordered.slice(0, n);

    const result: RankingResult = {
      organizationId,
      windowDays,
      direction,
      incomplete: ordered.length < n,
      items: slice,
    };
    const recipeIds = new Set<string>(slice.map((s) => s.recipeId));
    this.cache.set(key, {
      result,
      expiresAt: now + CACHE_TTL_MS,
      recipeIds,
    });
    return result;
  }

  /**
   * Invalidate any cached entry whose item set intersects the affected
   * recipe. Called via the existing SUPPLIER_PRICE_UPDATED event from #3.
   * The supplier->ingredient->recipe link isn't tracked in the event, so we
   * conservatively drop the org's entries.
   */
  @OnEvent(SUPPLIER_PRICE_UPDATED)
  handleSupplierPriceUpdated(event: AuditEventEnvelope): void {
    let invalidated = 0;
    for (const [key, entry] of this.cache) {
      if (key.startsWith(`${event.organizationId}|`)) {
        this.cache.delete(key);
        invalidated++;
      }
      void entry; // keep TS happy on the unused binding when condition is false
    }
    if (invalidated > 0) {
      this.logger.debug(
        `dashboard cache invalidated ${invalidated} entries for org ${event.organizationId} (supplier ${event.aggregateId})`,
      );
    }
  }

  /** Test helper — flush all cache entries (e.g., between unit tests). */
  flushCache(): void {
    this.cache.clear();
  }

  /**
   * KPI snapshot for the Owner Sunday-night header strip (audit 2026-05-18
   * L1-8). Aggregates per-MenuItem margins into 4 cards:
   *   - sales   : null today (no POS integration yet)
   *   - cost    : sum of plate-level costs across all active MenuItems
   *   - margin€ : sum of margins across MenuItems with known margins
   *   - margin% : weighted by sales price; fallback to mean when prices missing
   *
   * "Honest stub" approach per ADR-NULL-BUDGET-UNLIMITED precedent: when
   * the underlying data isn't there, return `null` + a `note` so the UI can
   * render "Pendiente · integrar POS" instead of a fake number.
   */
  async getKpis(
    organizationId: string,
    windowDays = 7,
  ): Promise<KpisResult> {
    const views = await this.menuItems.findAll(organizationId, { isActive: true });
    if (views.length === 0) {
      // Audit v3 P0-6: cost was 0 (rendering "0,00 €") next to em-dashes
      // for sales/margin — Owner read the asymmetry as "Coste connector
      // works, the rest is broken". Honest stub: when there are no
      // plates, NO KPI has data, so all four are null + note.
      const noPlatesNote = 'Aún no hay platos activos. Crea platos para ver KPIs.';
      return {
        organizationId,
        windowDays,
        hasMenuItems: false,
        sales: { valueEur: null, note: noPlatesNote },
        cost: { valueEur: null, note: noPlatesNote },
        marginEur: { valueEur: null, note: noPlatesNote },
        marginPct: { value: null },
        deltaVsPrev: null,
      };
    }

    let totalCost = 0;
    let totalMargin = 0;
    let totalSales = 0;
    let knownMarginCount = 0;
    let salesKnown = true;

    for (const view of views) {
      const margin = await this.menuItems.getMargin(organizationId, view.menuItem.id);
      if (margin.cost !== null) {
        totalCost += margin.cost;
      }
      if (margin.marginAbsolute !== null) {
        totalMargin += margin.marginAbsolute;
        knownMarginCount++;
      }
      // sellingPrice is non-nullable on the entity; if 0 we treat as "not configured".
      if (margin.sellingPrice > 0) {
        totalSales += margin.sellingPrice;
      } else {
        salesKnown = false;
      }
    }

    // Without POS we have at most "potential" sales (sum of prices × 1 plate).
    // Be honest: surface "potencial" rather than imply real sales.
    return {
      organizationId,
      windowDays,
      hasMenuItems: true,
      sales: salesKnown
        ? {
            valueEur: totalSales,
            note: 'Potencial · suma de precios de venta de platos activos (sin POS integrado).',
          }
        : { valueEur: null, note: 'Configura precios de venta para calcular ventas potenciales.' },
      cost: { valueEur: Math.round(totalCost * 100) / 100 },
      marginEur:
        knownMarginCount > 0
          ? { valueEur: Math.round(totalMargin * 100) / 100 }
          : { valueEur: null, note: 'Disponible cuando haya platos con margen calculado.' },
      marginPct:
        knownMarginCount > 0 && totalSales > 0
          ? { value: Math.round((totalMargin / totalSales) * 1000) / 10 }
          : { value: null },
      // Period-over-period delta deferred until we persist a margin time-series.
      deltaVsPrev: null,
    };
  }

  private cacheKey(
    organizationId: string,
    windowDays: number,
    direction: RankingDirection,
    n: number,
  ): string {
    return `${organizationId}|${windowDays}|${direction}|${n}`;
  }
}
