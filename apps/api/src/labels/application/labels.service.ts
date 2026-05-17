import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  PrintAdapterRegistry,
  renderLabelToPdf,
  type LabelData,
  type PrintJob,
  type PrintResult,
} from '@nexandro/label-renderer';
import {
  INGREDIENT_OVERRIDE_CHANGED,
  RECIPE_ALLERGENS_OVERRIDE_CHANGED,
} from '../../cost/application/cost.events';
import { Organization } from '../../iam/domain/organization.entity';
import { LabelDataResolver } from './label-data.resolver';
import {
  LabelOrganizationNotFoundError,
  PrintAdapterNotConfiguredError,
  PrintAdapterUnknownError,
} from './errors';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  pdf: Buffer;
  expiresAt: number;
}

export const LABEL_PRINT_ADAPTER_REGISTRY = Symbol('LABEL_PRINT_ADAPTER_REGISTRY');

/**
 * Orchestrates label rendering + caching + print dispatch. Reads label config
 * from `Org.labelFields`, walks the Recipe via `LabelDataResolver`, renders
 * the PDF via the label-renderer package, caches by `(orgId, recipeId, locale)`
 * for 5 min, dispatches to the configured `PrintAdapter` from the registry.
 *
 * Cache invalidation: any of `INGREDIENT_OVERRIDE_CHANGED` or
 * `RECIPE_ALLERGENS_OVERRIDE_CHANGED` flushes the cache wholesale (cheap +
 * 5-min TTL bounds drift; per-recipe invalidation is overkill at this scale).
 */
@Injectable()
export class LabelsService {
  private readonly logger = new Logger(LabelsService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly resolver: LabelDataResolver,
    @Inject(LABEL_PRINT_ADAPTER_REGISTRY)
    private readonly registry: PrintAdapterRegistry,
  ) {}

  /**
   * Renders the label PDF for `(orgId, recipeId, locale)`. Throws on missing
   * mandatory fields, unsupported locale, missing recipe/org. Server-side
   * cache returns the same buffer within TTL.
   */
  async renderLabel(
    organizationId: string,
    recipeId: string,
    locale: string | undefined,
  ): Promise<{ data: LabelData; pdf: Buffer }> {
    const data = await this.resolver.resolve(organizationId, recipeId, locale);
    const cacheKey = this.makeCacheKey(organizationId, recipeId, data.locale);
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return { data, pdf: cached.pdf };
    }
    const pdf = await renderLabelToPdf(data);
    this.cache.set(cacheKey, { pdf, expiresAt: now + CACHE_TTL_MS });
    return { data, pdf };
  }

  /**
   * Dispatches a print job for `(orgId, recipeId, locale)` via the org's
   * configured `printAdapter`. Renders (or reuses cached) PDF, builds the
   * `PrintJob`, invokes the adapter, returns its `PrintResult`.
   */
  async printLabel(
    organizationId: string,
    recipeId: string,
    options: { locale?: string; copies?: number; printerId?: string },
  ): Promise<PrintResult> {
    const { data, pdf } = await this.renderLabel(organizationId, recipeId, options.locale);

    const adapterConfig = await this.fetchAdapterFromOrg(organizationId);
    const adapter = this.registry.build(adapterConfig.id, adapterConfig.config);
    if (!adapter) throw new PrintAdapterUnknownError(adapterConfig.id);

    const job: PrintJob = {
      pdf,
      meta: {
        recipeId,
        organizationId,
        locale: data.locale,
        copies: options.copies ?? 1,
        pageSize: data.pageSize,
        printerId: options.printerId,
      },
    };
    return adapter.print(job);
  }

  private async fetchAdapterFromOrg(
    organizationId: string,
  ): Promise<{ id: string; config: Record<string, unknown> }> {
    const org = await this.dataSource
      .getRepository(Organization)
      .findOneBy({ id: organizationId });
    if (!org) throw new LabelOrganizationNotFoundError(organizationId);
    const cfg = org.labelFields.printAdapter;
    if (!cfg || typeof cfg.id !== 'string' || cfg.id.length === 0) {
      throw new PrintAdapterNotConfiguredError(organizationId);
    }
    return { id: cfg.id, config: cfg.config ?? {} };
  }

  // ----------------------------- cache management -----------------------------

  private makeCacheKey(
    organizationId: string,
    recipeId: string,
    locale: string,
  ): string {
    return `${organizationId}:${recipeId}:${locale}`;
  }

  /** Test helper — flushes the cache. */
  invalidateAll(): void {
    this.cache.clear();
  }

  /** Test helper — exposes the current cache size. */
  cacheSize(): number {
    return this.cache.size;
  }

  @OnEvent(INGREDIENT_OVERRIDE_CHANGED)
  onIngredientOverrideChanged(): void {
    this.logger.debug('Label cache flushed due to INGREDIENT_OVERRIDE_CHANGED');
    this.cache.clear();
  }

  @OnEvent(RECIPE_ALLERGENS_OVERRIDE_CHANGED)
  onRecipeAllergensOverrideChanged(): void {
    this.logger.debug('Label cache flushed due to RECIPE_ALLERGENS_OVERRIDE_CHANGED');
    this.cache.clear();
  }
}
