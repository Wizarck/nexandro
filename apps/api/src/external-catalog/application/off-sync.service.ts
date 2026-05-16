import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExternalFoodCatalog } from '../domain/external-food-catalog.entity';
import { ExternalFoodCatalogRepository } from '../infrastructure/external-food-catalog.repository';
import {
  FetchLike,
  OffApiOutageError,
  OffSearchResponse,
  OffSyncInProgressError,
} from './off-api.types';
import { mapOffProductToCreateProps } from './off-product-mapper';

export interface SyncRunResult {
  region: string;
  pagesFetched: number;
  rowsUpserted: number;
  rowsSkipped: number;
  cursorBefore: Date | null;
  cursorAfter: Date | null;
  durationMs: number;
}

export interface SyncOptions {
  /** Override default regions (ES + IT). Useful for tests / manual ops. */
  regions?: readonly string[];
  /** Override default page size. OFF caps the v2 search at 100 per page. */
  pageSize?: number;
  /** Optional ceiling so tests / dry-runs do not loop forever. */
  maxPages?: number;
}

const DEFAULT_REGIONS: readonly string[] = ['ES', 'IT'];
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 1000;
const OFF_API_BASE = 'https://world.openfoodfacts.org';

/**
 * Fetcher contract: lets unit tests inject a stubbed `fetch`. The default
 * implementation uses Node 18+'s global `fetch`.
 */
export const DEFAULT_OFF_FETCH: FetchLike = (input, init) => fetch(input, init);

@Injectable()
export class OffSyncService {
  private readonly logger = new Logger(OffSyncService.name);
  private inFlight = false;

  constructor(
    private readonly catalog: ExternalFoodCatalogRepository,
    // FetchLike is a function-type alias — TS emits `Function` for
    // design:paramtypes which NestJS DI can't resolve. @Optional()
    // lets the default kick in. Same pattern as ExternalCatalogService.
    @Optional() private readonly fetcher: FetchLike = DEFAULT_OFF_FETCH,
  ) {}

  /**
   * Weekly cron — Sunday 02:00 UTC per design.md §Migration Plan. NestJS
   * schedule ticks against the host timezone unless we pin UTC explicitly.
   */
  @Cron('0 2 * * 0', { name: 'off-weekly-sync', timeZone: 'UTC' })
  async runScheduledSync(): Promise<void> {
    try {
      await this.syncAll();
    } catch (err) {
      // Cron must never throw — silent failure is what the health-check is for.
      this.logger.error(
        `Scheduled OFF sync failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Run a sync over every default region (ES + IT) sequentially. Returns the
   * per-region results so the admin endpoint can echo them.
   */
  async syncAll(options?: SyncOptions): Promise<SyncRunResult[]> {
    if (this.inFlight) {
      throw new OffSyncInProgressError();
    }
    this.inFlight = true;
    try {
      const regions = options?.regions ?? DEFAULT_REGIONS;
      const out: SyncRunResult[] = [];
      for (const region of regions) {
        const result = await this.syncRegion(region, options);
        out.push(result);
      }
      return out;
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Cursor-based incremental pull for a single region. Pages forward by OFF's
   * `last_modified_t > cursor` until either the API returns an empty page,
   * `maxPages` is reached, or the API hard-fails. Each page is upserted one
   * row at a time so a single bad row does not poison the whole page.
   */
  async syncRegion(region: string, options?: SyncOptions): Promise<SyncRunResult> {
    const start = Date.now();
    const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
    const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;

    const cursorBefore = await this.catalog.getSyncCursor(region);
    let cursorAfter = cursorBefore;
    let rowsUpserted = 0;
    let rowsSkipped = 0;
    let pagesFetched = 0;

    for (let page = 1; page <= maxPages; page++) {
      const url = buildSearchUrl(region, cursorBefore, page, pageSize);
      let response: Response;
      try {
        response = await this.fetcher(url);
      } catch (err) {
        throw new OffApiOutageError(
          `OFF search fetch failed (region=${region}, page=${page}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      if (!response.ok) {
        throw new OffApiOutageError(
          `OFF search returned HTTP ${response.status} (region=${region}, page=${page})`,
        );
      }

      const body = (await response.json()) as OffSearchResponse;
      const products = Array.isArray(body.products) ? body.products : [];
      pagesFetched++;
      if (products.length === 0) {
        break;
      }

      for (const product of products) {
        try {
          const props = mapOffProductToCreateProps(product, region);
          const existing = await this.catalog.findByBarcode(props.barcode);
          if (existing) {
            existing.applyUpdate({
              name: props.name,
              brand: props.brand,
              nutrition: props.nutrition,
              allergens: props.allergens,
              dietFlags: props.dietFlags,
              lastModifiedAt: props.lastModifiedAt,
              licenseAttribution: props.licenseAttribution,
            });
            await this.catalog.save(existing);
          } else {
            const row = ExternalFoodCatalog.create(props);
            await this.catalog.save(row);
          }
          rowsUpserted++;
          if (props.lastModifiedAt && (!cursorAfter || props.lastModifiedAt > cursorAfter)) {
            cursorAfter = props.lastModifiedAt;
          }
        } catch (err) {
          rowsSkipped++;
          this.logger.warn(
            `OFF row skipped (region=${region}): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    const durationMs = Date.now() - start;
    this.logger.log(
      `OFF sync complete region=${region} pages=${pagesFetched} upserted=${rowsUpserted} skipped=${rowsSkipped} durationMs=${durationMs}`,
    );
    return {
      region,
      pagesFetched,
      rowsUpserted,
      rowsSkipped,
      cursorBefore,
      cursorAfter,
      durationMs,
    };
  }
}

function buildSearchUrl(
  region: string,
  cursor: Date | null,
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams({
    countries_tags_en: region.toLowerCase(),
    page_size: pageSize.toString(),
    page: page.toString(),
    sort_by: 'last_modified_t',
    json: '1',
  });
  if (cursor) {
    // OFF's v1 search supports last_modified_t > cursor via "last_modified_t" filter on /api/v0/search;
    // the reference recipe in design.md is best-effort — the API filters fields it understands and
    // ignores the rest, so unsupported filters degrade to "fetch latest by sort order".
    params.set('last_modified_t', `>${Math.floor(cursor.getTime() / 1000)}`);
  }
  return `${OFF_API_BASE}/cgi/search.pl?${params.toString()}`;
}
