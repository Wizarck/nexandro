import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ExpiryAlertsFiredImmutableError,
  ExpiryDedupWindowConflictError,
} from '../domain/errors';
import { ExpiryAlertsFired } from '../domain/expiry-alerts-fired.entity';
import { ExpiryAlertsFiredRepository } from './expiry-alerts-fired.repository';

interface MockQB {
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  getOne: jest.Mock;
  capturedClauses: string[];
}

function makeQB(getOneResult: ExpiryAlertsFired | null): MockQB {
  const captured: string[] = [];
  const qb: Partial<MockQB> = {
    capturedClauses: captured,
  };
  qb.where = jest.fn((c: string) => {
    captured.push(c);
    return qb as MockQB;
  });
  qb.andWhere = jest.fn((c: string) => {
    captured.push(c);
    return qb as MockQB;
  });
  qb.orderBy = jest.fn(() => qb as MockQB);
  qb.limit = jest.fn(() => qb as MockQB);
  qb.getOne = jest.fn(async () => getOneResult);
  return qb as MockQB;
}

function makeTypeormMock(opts: {
  insertImpl?: jest.Mock;
  qbResult?: ExpiryAlertsFired | null;
}): { mock: Record<string, jest.Mock>; qb: MockQB } {
  const qb = makeQB(opts.qbResult ?? null);
  const mock: Record<string, jest.Mock> = {
    insert: opts.insertImpl ?? jest.fn(async () => ({ identifiers: [{}] })),
    createQueryBuilder: jest.fn(() => qb),
  };
  return { mock, qb };
}

async function build(
  typeormMock: Record<string, jest.Mock>,
): Promise<ExpiryAlertsFiredRepository> {
  const mod: TestingModule = await Test.createTestingModule({
    providers: [
      ExpiryAlertsFiredRepository,
      {
        provide: getRepositoryToken(ExpiryAlertsFired),
        useValue: typeormMock,
      },
    ],
  }).compile();
  return mod.get(ExpiryAlertsFiredRepository);
}

describe('ExpiryAlertsFiredRepository', () => {
  describe('recordFired', () => {
    it('inserts and returns the persisted row', async () => {
      const { mock } = makeTypeormMock({});
      const repo = await build(mock);
      const out = await repo.recordFired({
        organizationId: randomUUID(),
        lotId: randomUUID(),
        alertBand: 't-72h',
        expiresAtSnapshot: new Date('2026-05-15T08:00:00Z'),
      });
      expect(mock.insert).toHaveBeenCalledTimes(1);
      expect(out.alertBand).toBe('t-72h');
    });

    it('re-raises a unique-constraint race as ExpiryDedupWindowConflictError', async () => {
      const insert = jest.fn(async () => {
        const err = new Error('duplicate key') as Error & {
          driverError: { code: string };
        };
        err.driverError = { code: '23505' };
        throw err;
      });
      const { mock } = makeTypeormMock({ insertImpl: insert });
      const repo = await build(mock);
      await expect(
        repo.recordFired({
          organizationId: randomUUID(),
          lotId: randomUUID(),
          alertBand: 't-24h',
          expiresAtSnapshot: new Date(),
        }),
      ).rejects.toBeInstanceOf(ExpiryDedupWindowConflictError);
    });

    it('rethrows non-unique DB errors unchanged', async () => {
      const insert = jest.fn(async () => {
        throw new Error('connection lost');
      });
      const { mock } = makeTypeormMock({ insertImpl: insert });
      const repo = await build(mock);
      await expect(
        repo.recordFired({
          organizationId: randomUUID(),
          lotId: randomUUID(),
          alertBand: 't-24h',
          expiresAtSnapshot: new Date(),
        }),
      ).rejects.toThrow(/connection lost/);
    });
  });

  describe('findRecentFor', () => {
    it('queries on organization_id + lot_id + alert_band + cutoff', async () => {
      const { mock, qb } = makeTypeormMock({ qbResult: null });
      const repo = await build(mock);
      const orgId = randomUUID();
      const lotId = randomUUID();
      const out = await repo.findRecentFor(orgId, lotId, 't-72h', 23);
      expect(out).toBeNull();
      const clauses = qb.capturedClauses.join(' | ');
      expect(clauses).toContain('organization_id');
      expect(clauses).toContain('lot_id');
      expect(clauses).toContain('alert_band');
      expect(clauses).toContain('fired_at');
    });

    it('returns the persisted entity when within window', async () => {
      const existing = ExpiryAlertsFired.create({
        organizationId: randomUUID(),
        lotId: randomUUID(),
        alertBand: 't-72h',
        expiresAtSnapshot: new Date(),
      });
      const { mock } = makeTypeormMock({ qbResult: existing });
      const repo = await build(mock);
      const out = await repo.findRecentFor(
        existing.organizationId,
        existing.lotId,
        't-72h',
        23,
      );
      expect(out).toBe(existing);
    });
  });

  describe('append-only guards', () => {
    let repo: ExpiryAlertsFiredRepository;
    beforeAll(async () => {
      const { mock } = makeTypeormMock({});
      repo = await build(mock);
    });

    it('update() throws ExpiryAlertsFiredImmutableError', async () => {
      await expect(repo.update()).rejects.toBeInstanceOf(
        ExpiryAlertsFiredImmutableError,
      );
    });

    it('delete() throws ExpiryAlertsFiredImmutableError', async () => {
      await expect(repo.delete()).rejects.toBeInstanceOf(
        ExpiryAlertsFiredImmutableError,
      );
    });

    it('save() throws ExpiryAlertsFiredImmutableError', async () => {
      await expect(repo.save()).rejects.toBeInstanceOf(
        ExpiryAlertsFiredImmutableError,
      );
    });
  });
});
