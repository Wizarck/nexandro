import 'reflect-metadata';
import { UnprocessableEntityException } from '@nestjs/common';
import { ROLES_METADATA_KEY } from '../../shared/decorators/roles.decorator';
import { AiObsQueryService } from './ai-obs-query.service';
import { DashboardController } from './dashboard.controller';

const ORG = '11111111-1111-4111-8111-111111111111';

function emptyOverviewFor(period: 'this_month' = 'this_month') {
  return {
    status: 'empty' as const,
    period,
    errorRate: { value: 0, series: [], peak: null },
    costTotal: { value: 0, monthlyBudgetEur: null, pctConsumed: null },
    budgetStatus: {
      tier: null,
      pctConsumed: null,
      daysUntilEmpty: null,
      avg7dDaily: 0,
    },
    costByCapability: [],
    costByModel: [],
    heatmap: {
      cells: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
      max: 0,
    },
    anomalies: [],
    savingsOpportunities: [],
    blastRadius: [],
    otlpExporter: { endpoint: 'http://localhost:4318', status: 'active' as const },
  };
}

describe('DashboardController', () => {
  let controller: DashboardController;
  let getOverview: jest.Mock;
  let getCostByTag: jest.Mock;
  let getFailures: jest.Mock;

  beforeEach(() => {
    getOverview = jest.fn();
    getCostByTag = jest.fn();
    getFailures = jest.fn();
    const service = {
      getOverview,
      getCostByTag,
      getFailures,
    } as unknown as AiObsQueryService;
    controller = new DashboardController(service);
  });

  describe('GET /m3/ai-obs/overview', () => {
    it('returns the service payload on a valid query', async () => {
      const payload = emptyOverviewFor('this_month');
      getOverview.mockResolvedValue(payload);
      const result = await controller.getOverview({
        organizationId: ORG,
        period: 'this_month',
      });
      expect(result).toBe(payload);
      expect(getOverview).toHaveBeenCalledWith(ORG, 'this_month');
    });

    it('throws 422 on a non-UUID organizationId', async () => {
      await expect(
        controller.getOverview({ organizationId: 'not-a-uuid', period: '24h' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws 422 on an unknown period', async () => {
      await expect(
        controller.getOverview({ organizationId: ORG, period: 'forever' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('GET /m3/ai-obs/cost-by-tag', () => {
    it('returns the service payload on a valid query', async () => {
      const payload = { status: 'empty' as const, period: 'this_month' as const, tags: [] };
      getCostByTag.mockResolvedValue(payload);
      const result = await controller.getCostByTag({
        organizationId: ORG,
        period: 'this_month',
      });
      expect(result).toBe(payload);
      expect(getCostByTag).toHaveBeenCalledWith(ORG, 'this_month');
    });

    it('throws 422 on missing organizationId', async () => {
      await expect(
        controller.getCostByTag({ period: 'this_month' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('GET /m3/ai-obs/failures', () => {
    it('returns the service payload on a valid query', async () => {
      const payload = { status: 'empty' as const, range: '24h' as const, failures: [] };
      getFailures.mockResolvedValue(payload);
      const result = await controller.getFailures({
        organizationId: ORG,
        range: '24h',
      });
      expect(result).toBe(payload);
      expect(getFailures).toHaveBeenCalledWith(ORG, '24h');
    });

    it('throws 422 on an unknown range', async () => {
      await expect(
        controller.getFailures({ organizationId: ORG, range: '90d' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('RBAC meta-test', () => {
    /**
     * Per ADR-OWNER-RBAC + tasks.md §3.5, every controller method
     * decorated with `@Get` MUST also carry `@Roles('OWNER','MANAGER')`.
     * This test introspects the decorator metadata via `Reflect.getMetadata`
     * so an un-decorated `@Get` added in a future commit fails CI.
     */
    it('every @Get carries @Roles(OWNER, MANAGER)', () => {
      const proto = DashboardController.prototype;
      const methods = Object.getOwnPropertyNames(proto).filter(
        (name) => name !== 'constructor' && typeof (proto as unknown as Record<string, unknown>)[name] === 'function',
      );
      expect(methods.length).toBeGreaterThan(0);
      for (const name of methods) {
        // NestJS SetMetadata stores method metadata on the function value
        // (descriptor.value), not on (target, propertyKey). Pull the fn
        // out of the prototype and introspect it directly.
        const fn = (proto as unknown as Record<string, (...args: unknown[]) => unknown>)[name];
        const roles = Reflect.getMetadata(ROLES_METADATA_KEY, fn) as
          | string[]
          | undefined;
        expect(roles).toBeDefined();
        expect(roles).toEqual(expect.arrayContaining(['OWNER', 'MANAGER']));
      }
    });
  });
});
