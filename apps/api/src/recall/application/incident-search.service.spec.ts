import type { Repository } from 'typeorm';
import { AuditLog } from '../../audit-log/domain/audit-log.entity';
import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { Lot } from '../../inventory/lot/domain/lot.entity';
import { Supplier } from '../../suppliers/domain/supplier.entity';
import { IncidentSearchService } from './incident-search.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';

/**
 * Builds a fake TypeORM QueryBuilder that records the WHERE params it
 * receives + returns a configured row set. Sufficient for the service-
 * level unit tests below; a real INT spec would use a Postgres container
 * (deferred per tasks.md §Deferred).
 */
function makeFakeQb<T>(rowsByCall: T[]) {
  const calls: Array<{ where: string; params: Record<string, unknown> }> = [];
  let limitValue: number | undefined;
  const qb: Record<string, unknown> & {
    where: (sql: string, p: Record<string, unknown>) => typeof qb;
    andWhere: (sql: string, p?: Record<string, unknown>) => typeof qb;
    orderBy: (col: string, dir: 'ASC' | 'DESC') => typeof qb;
    limit: (n: number) => typeof qb;
    getMany: () => Promise<T[]>;
    _calls: typeof calls;
    _limit: () => number | undefined;
  } = {
    where(sql: string, params: Record<string, unknown>) {
      calls.push({ where: sql, params });
      return qb;
    },
    andWhere(sql: string, params?: Record<string, unknown>) {
      calls.push({ where: sql, params: params ?? {} });
      return qb;
    },
    orderBy() {
      return qb;
    },
    limit(n: number) {
      limitValue = n;
      return qb;
    },
    getMany() {
      return Promise.resolve(rowsByCall);
    },
    _calls: calls,
    _limit: () => limitValue,
  };
  return qb;
}

function makeFakeRepo<T>(rows: T[]) {
  const fake = makeFakeQb<T>(rows);
  const repo = {
    createQueryBuilder: jest.fn(() => fake),
    _fake: fake,
  } as unknown as Repository<T> & { _fake: typeof fake };
  return repo;
}

/** Minimal Lot fixture sufficient for ranking + mapping assertions. */
function lot(props: {
  id: string;
  organizationId: string;
  receivedAt: Date;
  supplierLotCode?: string;
  metadata?: Record<string, unknown>;
}): Lot {
  const row = new Lot();
  row.id = props.id;
  row.organizationId = props.organizationId;
  row.locationId = '33333333-3333-4333-8333-333333333333';
  row.supplierId = '44444444-4444-4444-4444-444444444444';
  row.receivedAt = props.receivedAt;
  row.expiresAt = null;
  row.quantityReceived = 10;
  row.quantityRemaining = 10;
  row.unit = 'kg';
  row.metadata = {
    ...(props.supplierLotCode
      ? { supplier_lot_code: props.supplierLotCode }
      : {}),
    ...(props.metadata ?? {}),
  };
  row.createdAt = new Date();
  row.updatedAt = new Date();
  return row;
}

function supplier(name: string): Supplier {
  const s = new Supplier();
  s.id = '55555555-5555-4555-8555-' + name.replace(/\W/g, '').padEnd(12, '0').slice(0, 12);
  s.organizationId = ORG;
  s.name = name;
  s.country = 'ES';
  return s as Supplier;
}

function ingredient(name: string): Ingredient {
  const i = new Ingredient();
  i.id = '66666666-6666-4666-8666-' + name.replace(/\W/g, '').padEnd(12, '0').slice(0, 12);
  i.organizationId = ORG;
  i.name = name;
  i.baseUnitType = 'WEIGHT';
  return i as Ingredient;
}

function audit(props: {
  organizationId: string;
  payloadAfter: Record<string, unknown>;
  createdAt: Date;
}): AuditLog {
  const a = new AuditLog();
  a.id = '77777777-7777-4777-8777-777777777777';
  a.organizationId = props.organizationId;
  a.eventType = 'LOT_CREATED';
  a.aggregateType = 'lot';
  a.aggregateId = '88888888-8888-4888-8888-888888888888';
  a.actorUserId = null;
  a.actorKind = 'system';
  a.payloadAfter = props.payloadAfter;
  a.createdAt = props.createdAt;
  return a;
}

describe('IncidentSearchService', () => {
  it('returns [] without hitting any repo when query is empty', async () => {
    const auditLog = makeFakeRepo<AuditLog>([]);
    const supplierRepo = makeFakeRepo<Supplier>([]);
    const ingredientRepo = makeFakeRepo<Ingredient>([]);
    const lotRepo = makeFakeRepo<Lot>([]);

    const svc = new IncidentSearchService(
      auditLog,
      supplierRepo,
      ingredientRepo,
      lotRepo,
    );

    const result = await svc.search(ORG, '');
    expect(result).toEqual([]);
    expect(auditLog.createQueryBuilder).not.toHaveBeenCalled();
    expect(supplierRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(ingredientRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(lotRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns [] when query is only whitespace', async () => {
    const auditLog = makeFakeRepo<AuditLog>([]);
    const supplierRepo = makeFakeRepo<Supplier>([]);
    const ingredientRepo = makeFakeRepo<Ingredient>([]);
    const lotRepo = makeFakeRepo<Lot>([]);

    const svc = new IncidentSearchService(
      auditLog,
      supplierRepo,
      ingredientRepo,
      lotRepo,
    );

    const result = await svc.search(ORG, '   ');
    expect(result).toEqual([]);
  });

  it('caps results at 8 even when underlying sources return more', async () => {
    // 8 lots + 8 suppliers + 8 ingredients + 8 aggregates = 32 candidates.
    const lots: Lot[] = [];
    for (let i = 0; i < 8; i += 1) {
      lots.push(
        lot({
          id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
          organizationId: ORG,
          receivedAt: new Date(`2026-05-${10 + i}T10:00:00Z`),
          supplierLotCode: `L${i}`,
        }),
      );
    }
    const suppliers: Supplier[] = [];
    for (let i = 0; i < 8; i += 1) suppliers.push(supplier(`Supplier${i}`));
    const ingredients: Ingredient[] = [];
    for (let i = 0; i < 8; i += 1) ingredients.push(ingredient(`Ingredient${i}`));
    const audits: AuditLog[] = [];
    for (let i = 0; i < 8; i += 1) {
      audits.push(
        audit({
          organizationId: ORG,
          payloadAfter: { lot_code: `AL${i}` },
          createdAt: new Date(`2026-04-${10 + i}T10:00:00Z`),
        }),
      );
    }

    const svc = new IncidentSearchService(
      makeFakeRepo<AuditLog>(audits),
      makeFakeRepo<Supplier>(suppliers),
      makeFakeRepo<Ingredient>(ingredients),
      makeFakeRepo<Lot>(lots),
    );

    const result = await svc.search(ORG, 'something');
    expect(result.length).toBeLessThanOrEqual(8);
    for (const hit of result) {
      expect(['lot', 'supplier', 'ingredient', 'aggregate']).toContain(
        hit.kind,
      );
    }
  });

  it('ranks recency above symptom-match', async () => {
    const lotRecentNoMatch = lot({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
      organizationId: ORG,
      receivedAt: new Date('2026-05-13T18:00:00Z'),
      supplierLotCode: 'NEW',
    });
    const lotOldHighMatch = lot({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
      organizationId: ORG,
      receivedAt: new Date('2026-05-01T10:00:00Z'),
      supplierLotCode: 'OLD',
      metadata: { symptom: 'diarrea fuerte' },
    });

    const svc = new IncidentSearchService(
      makeFakeRepo<AuditLog>([]),
      makeFakeRepo<Supplier>([]),
      makeFakeRepo<Ingredient>([]),
      makeFakeRepo<Lot>([lotRecentNoMatch, lotOldHighMatch]),
    );

    const result = await svc.search(ORG, 'diarrea');
    // Both lots emerge from the lot anchor; recency dominates.
    expect(result.length).toBe(2);
    expect(result[0].label).toBe('NEW');
    expect(result[1].label).toBe('OLD');
  });

  it('uses symptom-match as tiebreaker among same-receivedAt hits', async () => {
    const ts = new Date('2026-05-13T18:00:00Z');
    const lotNoMatch = lot({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000010',
      organizationId: ORG,
      receivedAt: ts,
      supplierLotCode: 'NM',
    });
    const lotHighMatch = lot({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000011',
      organizationId: ORG,
      receivedAt: ts,
      supplierLotCode: 'HM',
      metadata: { symptom: 'diarrea aguda' },
    });

    const svc = new IncidentSearchService(
      makeFakeRepo<AuditLog>([]),
      makeFakeRepo<Supplier>([]),
      makeFakeRepo<Ingredient>([]),
      makeFakeRepo<Lot>([lotNoMatch, lotHighMatch]),
    );

    const result = await svc.search(ORG, 'diarrea');
    expect(result.length).toBe(2);
    expect(result[0].label).toBe('HM');
    expect(result[1].label).toBe('NM');
  });

  it('type filter excludes non-listed anchor sources', async () => {
    const lots = [
      lot({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000020',
        organizationId: ORG,
        receivedAt: new Date(),
        supplierLotCode: 'X',
      }),
    ];
    const suppliers = [supplier('Pescados Alborada')];
    const ingredients = [ingredient('Lubina')];

    const auditRepo = makeFakeRepo<AuditLog>([]);
    const supplierRepo = makeFakeRepo<Supplier>(suppliers);
    const ingredientRepo = makeFakeRepo<Ingredient>(ingredients);
    const lotRepo = makeFakeRepo<Lot>(lots);

    const svc = new IncidentSearchService(
      auditRepo,
      supplierRepo,
      ingredientRepo,
      lotRepo,
    );

    const result = await svc.search(ORG, 'a', { types: ['supplier'] });
    expect(result.every((h) => h.kind === 'supplier')).toBe(true);
    expect(supplierRepo.createQueryBuilder).toHaveBeenCalled();
    // Other repos NOT queried because they were filtered out.
    expect(lotRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(ingredientRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(auditRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('multi-tenant gate forwards organizationId into the WHERE clause', async () => {
    const supplierRepo = makeFakeRepo<Supplier>([supplier('Alborada')]);
    const svc = new IncidentSearchService(
      makeFakeRepo<AuditLog>([]),
      supplierRepo,
      makeFakeRepo<Ingredient>([]),
      makeFakeRepo<Lot>([]),
    );
    await svc.search(ORG, 'alb', { types: ['supplier'] });
    const calls = (supplierRepo as unknown as { _fake: { _calls: Array<{ where: string; params: Record<string, unknown> }> } })._fake._calls;
    const orgCall = calls.find((c) =>
      c.where.includes('organization_id'),
    );
    expect(orgCall).toBeDefined();
    expect(orgCall!.params.organizationId).toBe(ORG);
    // Cross-org sanity: never sees OTHER_ORG by accident.
    expect(orgCall!.params.organizationId).not.toBe(OTHER_ORG);
  });

  it('respects opts.limit while still capping at 8', async () => {
    const lots = [
      lot({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000030',
        organizationId: ORG,
        receivedAt: new Date('2026-05-14T10:00:00Z'),
        supplierLotCode: 'A',
      }),
      lot({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000031',
        organizationId: ORG,
        receivedAt: new Date('2026-05-13T10:00:00Z'),
        supplierLotCode: 'B',
      }),
      lot({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000032',
        organizationId: ORG,
        receivedAt: new Date('2026-05-12T10:00:00Z'),
        supplierLotCode: 'C',
      }),
    ];

    const svc = new IncidentSearchService(
      makeFakeRepo<AuditLog>([]),
      makeFakeRepo<Supplier>([]),
      makeFakeRepo<Ingredient>([]),
      makeFakeRepo<Lot>(lots),
    );
    const result = await svc.search(ORG, 'anything', { limit: 2 });
    expect(result.length).toBe(2);
    expect(result[0].label).toBe('A');
    expect(result[1].label).toBe('B');
  });

  it('non-temporal hits (suppliers, ingredients) rank after lots (NULLS LAST)', async () => {
    const lots = [
      lot({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000040',
        organizationId: ORG,
        receivedAt: new Date('2020-01-01T00:00:00Z'),
        supplierLotCode: 'ANCIENT',
      }),
    ];
    const suppliers = [supplier('Recent Supplier')];

    const svc = new IncidentSearchService(
      makeFakeRepo<AuditLog>([]),
      makeFakeRepo<Supplier>(suppliers),
      makeFakeRepo<Ingredient>([]),
      makeFakeRepo<Lot>(lots),
    );
    const result = await svc.search(ORG, 'a');
    expect(result.length).toBe(2);
    // Even a very-old lot ranks above null-receivedAt supplier.
    expect(result[0].kind).toBe('lot');
    expect(result[1].kind).toBe('supplier');
  });
});
