import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import {
  PrintAdapterRegistry,
  type LabelData,
  type PrintAdapter,
  type PrintJob,
  type PrintResult,
} from '@nexandro/label-renderer';
import {
  INGREDIENT_OVERRIDE_CHANGED,
  RECIPE_ALLERGENS_OVERRIDE_CHANGED,
} from '../../cost/application/cost.events';
import { Organization } from '../../iam/domain/organization.entity';
import { LabelsService } from './labels.service';
import {
  LabelOrganizationNotFoundError,
  PrintAdapterNotConfiguredError,
  PrintAdapterUnknownError,
} from './errors';

// Mock the renderer at module load — apps/api unit tests never invoke the
// real @react-pdf renderer (its transitive dependency tree is ESM-only).
jest.mock('@nexandro/label-renderer', () => {
  const actual = jest.requireActual('@nexandro/label-renderer');
  return {
    ...actual,
    renderLabelToPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-mock-render')),
  };
});

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const RECIPE_ID = '22222222-2222-4222-8222-222222222222';

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  const org = new Organization();
  org.id = ORG_ID;
  org.name = 'Org';
  org.currencyCode = 'EUR';
  org.defaultLocale = 'es';
  org.timezone = 'Europe/Madrid';
  org.labelFields = {};
  return Object.assign(org, overrides);
}

function makeFakeDataSource(orgs: Map<string, Organization>): DataSource {
  return {
    getRepository: (entity: unknown) => {
      if (entity === Organization) {
        return {
          findOneBy: async (where: { id: string }) => orgs.get(where.id) ?? null,
        };
      }
      return { findOneBy: async () => null, findBy: async () => [] };
    },
  } as unknown as DataSource;
}

function makeResolverStub(data: LabelData) {
  return {
    resolve: jest.fn().mockResolvedValue(data),
  };
}

function makeStubAdapter(behavior: 'success' | 'fail'): {
  adapter: PrintAdapter;
  received: PrintJob[];
} {
  const received: PrintJob[] = [];
  const adapter: PrintAdapter = {
    id: 'stub',
    accepts: ['pdf'],
    async print(job: PrintJob): Promise<PrintResult> {
      received.push(job);
      if (behavior === 'success') return { ok: true, jobId: 'job-42' };
      return {
        ok: false,
        error: { code: 'PRINTER_UNREACHABLE', message: 'stub failure' },
      };
    },
  };
  return { adapter, received };
}

const baseLabelData: LabelData = {
  locale: 'es',
  pageSize: 'a4',
  recipe: {
    id: RECIPE_ID,
    name: 'Recipe',
    portions: 1,
    totalNetMassG: 100,
    ingredientList: [],
    allergens: [],
    macros: {
      kcalPer100g: 100,
      fatPer100g: 1,
      saturatedFatPer100g: 0.5,
      carbohydratesPer100g: 10,
      sugarsPer100g: 1,
      proteinPer100g: 5,
      saltPer100g: 0.1,
    },
  },
  org: {
    businessName: 'Org',
    postalAddress: { street: 's', city: 'c', postalCode: 'p', country: 'C' },
  },
};

describe('LabelsService', () => {
  function buildService(opts: {
    org?: Organization;
    adapterId?: string;
    adapterBehavior?: 'success' | 'fail' | 'unregistered';
  } = {}): {
    service: LabelsService;
    adapterReceived: PrintJob[];
  } {
    const org = opts.org ?? makeOrg();
    const dataSource = makeFakeDataSource(new Map([[ORG_ID, org]]));
    const resolver = makeResolverStub(baseLabelData);
    const registry = new PrintAdapterRegistry();
    const { adapter, received } = makeStubAdapter(
      opts.adapterBehavior === 'fail' ? 'fail' : 'success',
    );
    if (opts.adapterBehavior !== 'unregistered') {
      registry.register(opts.adapterId ?? 'stub', () => adapter);
    }
    const service = new LabelsService(dataSource, resolver as never, registry);
    return { service, adapterReceived: received };
  }

  it('renderLabel calls resolver + caches the buffer for 5 min', async () => {
    const { service } = buildService();
    const { pdf } = await service.renderLabel(ORG_ID, RECIPE_ID, undefined);
    expect(pdf.toString('ascii')).toMatch(/%PDF/);
    expect(service.cacheSize()).toBe(1);

    // Second call hits the cache (renderer mock invoked only once).
    await service.renderLabel(ORG_ID, RECIPE_ID, undefined);
    expect(service.cacheSize()).toBe(1);
  });

  it('printLabel dispatches via the configured adapter and returns ok+jobId', async () => {
    const org = makeOrg({
      labelFields: {
        printAdapter: { id: 'stub', config: { url: 'http://printer.local' } },
      },
    });
    const { service, adapterReceived } = buildService({ org });
    const result = await service.printLabel(ORG_ID, RECIPE_ID, { locale: 'es' });
    expect(result.ok).toBe(true);
    expect(result.jobId).toBe('job-42');
    expect(adapterReceived).toHaveLength(1);
    expect(adapterReceived[0].pdf?.toString('ascii')).toMatch(/%PDF/);
    expect(adapterReceived[0].meta).toMatchObject({
      recipeId: RECIPE_ID,
      organizationId: ORG_ID,
      locale: 'es',
      pageSize: 'a4',
      copies: 1,
    });
  });

  it('printLabel surfaces adapter failure as PrintResult.ok=false', async () => {
    const org = makeOrg({
      labelFields: {
        printAdapter: { id: 'stub', config: { url: 'http://printer.local' } },
      },
    });
    const { service } = buildService({ org, adapterBehavior: 'fail' });
    const result = await service.printLabel(ORG_ID, RECIPE_ID, {});
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PRINTER_UNREACHABLE');
  });

  it('printLabel throws PrintAdapterNotConfiguredError when org has no adapter', async () => {
    const org = makeOrg({ labelFields: {} });
    const { service } = buildService({ org });
    await expect(service.printLabel(ORG_ID, RECIPE_ID, {})).rejects.toBeInstanceOf(
      PrintAdapterNotConfiguredError,
    );
  });

  it('printLabel throws PrintAdapterUnknownError when adapter id not in registry', async () => {
    const org = makeOrg({
      labelFields: { printAdapter: { id: 'nonexistent', config: {} } },
    });
    const { service } = buildService({ org, adapterBehavior: 'unregistered' });
    await expect(service.printLabel(ORG_ID, RECIPE_ID, {})).rejects.toBeInstanceOf(
      PrintAdapterUnknownError,
    );
  });

  it('printLabel throws LabelOrganizationNotFoundError when org missing entirely', async () => {
    const dataSource = makeFakeDataSource(new Map());
    const resolver = makeResolverStub(baseLabelData);
    const registry = new PrintAdapterRegistry();
    const service = new LabelsService(dataSource, resolver as never, registry);
    await expect(service.printLabel(ORG_ID, RECIPE_ID, {})).rejects.toBeInstanceOf(
      LabelOrganizationNotFoundError,
    );
  });

  it('forwards copies + printerId in PrintJob.meta', async () => {
    const org = makeOrg({
      labelFields: { printAdapter: { id: 'stub', config: { url: 'x' } } },
    });
    const { service, adapterReceived } = buildService({ org });
    await service.printLabel(ORG_ID, RECIPE_ID, {
      copies: 5,
      printerId: 'printer-2',
    });
    expect(adapterReceived[0].meta.copies).toBe(5);
    expect(adapterReceived[0].meta.printerId).toBe('printer-2');
  });

  it('flushes cache on INGREDIENT_OVERRIDE_CHANGED event', async () => {
    const { service } = buildService();
    const events = new EventEmitter2();
    events.on(INGREDIENT_OVERRIDE_CHANGED, () => service.onIngredientOverrideChanged());

    await service.renderLabel(ORG_ID, RECIPE_ID, undefined);
    expect(service.cacheSize()).toBe(1);
    events.emit(INGREDIENT_OVERRIDE_CHANGED, {});
    expect(service.cacheSize()).toBe(0);
  });

  it('flushes cache on RECIPE_ALLERGENS_OVERRIDE_CHANGED event', async () => {
    const { service } = buildService();
    const events = new EventEmitter2();
    events.on(RECIPE_ALLERGENS_OVERRIDE_CHANGED, () =>
      service.onRecipeAllergensOverrideChanged(),
    );

    await service.renderLabel(ORG_ID, RECIPE_ID, undefined);
    expect(service.cacheSize()).toBe(1);
    events.emit(RECIPE_ALLERGENS_OVERRIDE_CHANGED, {});
    expect(service.cacheSize()).toBe(0);
  });
});
