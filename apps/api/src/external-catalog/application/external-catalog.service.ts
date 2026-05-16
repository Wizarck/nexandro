import { Injectable, Logger, Optional } from '@nestjs/common';
import { ExternalFoodCatalog } from '../domain/external-food-catalog.entity';
import { ExternalFoodCatalogRepository } from '../infrastructure/external-food-catalog.repository';
import {
  FetchLike,
  OffApiOutageError,
  OffProductResponse,
} from './off-api.types';
import { DEFAULT_OFF_FETCH } from './off-sync.service';
import { mapOffProductToCreateProps } from './off-product-mapper';

const OFF_API_BASE = 'https://world.openfoodfacts.org';

export interface SearchByBarcodeOptions {
  /** Region attached to a cache-miss-then-persist row. */
  region: string;
}

/**
 * Read-side facade over the local mirror with a REST-fallback path. Per
 * design.md §Decisions: cache hit always serves; cache miss falls through to
 * the OFF REST API, persists the row on success, returns null on outage.
 *
 * Callers that need to distinguish "outage" from "not found" can branch on
 * the typed `OffApiOutageError` re-thrown from `searchByBarcodeStrict`.
 */
@Injectable()
export class ExternalCatalogService {
  private readonly logger = new Logger(ExternalCatalogService.name);

  constructor(
    private readonly catalog: ExternalFoodCatalogRepository,
    // FetchLike is a type alias for a function — TS emits `Function` as
    // design:paramtypes, which NestJS DI cannot resolve to a registered
    // provider. @Optional() lets the default kick in. Same class of bug
    // as memory feedback_di_nullable_union_inject.
    @Optional() private readonly fetcher: FetchLike = DEFAULT_OFF_FETCH,
  ) {}

  /**
   * Cache-first barcode lookup. On miss, falls through to OFF; on a
   * successful OFF hit, persists the row and returns it; on OFF outage logs
   * a warning and returns null (degradation per spec scenario "OFF API
   * outage degrades gracefully").
   */
  async searchByBarcode(
    barcode: string,
    options: SearchByBarcodeOptions,
  ): Promise<ExternalFoodCatalog | null> {
    const cached = await this.catalog.findByBarcode(barcode);
    if (cached) {
      return cached;
    }
    try {
      return await this.fetchAndPersist(barcode, options.region);
    } catch (err) {
      if (err instanceof OffApiOutageError) {
        this.logger.warn(`OFF outage on barcode ${barcode}: ${err.message}`);
        return null;
      }
      throw err;
    }
  }

  /**
   * Strict variant that surfaces outage as a typed exception so the caller
   * can map it to HTTP 503. Use this for endpoints where the kitchen UX
   * expects a distinct degradation signal.
   */
  async searchByBarcodeStrict(
    barcode: string,
    options: SearchByBarcodeOptions,
  ): Promise<ExternalFoodCatalog | null> {
    const cached = await this.catalog.findByBarcode(barcode);
    if (cached) {
      return cached;
    }
    return this.fetchAndPersist(barcode, options.region);
  }

  async searchByName(
    query: string,
    region: string,
    limit?: number,
  ): Promise<ExternalFoodCatalog[]> {
    return this.catalog.searchByName(query, region, limit);
  }

  async searchByBrand(
    brand: string,
    region: string,
    limit?: number,
  ): Promise<ExternalFoodCatalog[]> {
    return this.catalog.searchByBrand(brand, region, limit);
  }

  private async fetchAndPersist(
    barcode: string,
    region: string,
  ): Promise<ExternalFoodCatalog | null> {
    const url = `${OFF_API_BASE}/api/v0/product/${encodeURIComponent(barcode)}.json`;
    let response: Response;
    try {
      response = await this.fetcher(url);
    } catch (err) {
      throw new OffApiOutageError(
        `OFF product fetch failed for ${barcode}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (response.status >= 500) {
      throw new OffApiOutageError(`OFF product API returned HTTP ${response.status} for ${barcode}`);
    }
    if (!response.ok) {
      // 4xx other than 404 still counts as a soft miss — OFF v0 returns 200
      // with status:0 for not-found, so any other 4xx is a malformed request
      // we treat as not-found rather than outage.
      return null;
    }

    const body = (await response.json()) as OffProductResponse;
    if (body.status !== 1 || !body.product) {
      return null;
    }

    let props;
    try {
      props = mapOffProductToCreateProps(body.product, region);
    } catch (err) {
      this.logger.warn(
        `OFF product ${barcode} unmappable: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }

    const row = ExternalFoodCatalog.create(props);
    return this.catalog.save(row);
  }
}
