import { randomUUID } from 'node:crypto';
import {
  IllegalReconciliationTransition,
  ReconciliationInvariantError,
  ReconciliationNotFoundError,
} from '../domain/errors';
import { Reconciliation } from '../domain/reconciliation.entity';
import { ReconciliationRepository } from '../infrastructure/reconciliation.repository';
import { ReconciliationService } from './reconciliation.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

function makeRecon(overrides: Partial<Reconciliation> = {}): Reconciliation {
  const r = new Reconciliation();
  r.id = overrides.id ?? randomUUID();
  r.organizationId = overrides.organizationId ?? ORG;
  r.poId = overrides.poId ?? randomUUID();
  r.poNumber = overrides.poNumber ?? 'PO-2026-0001';
  r.grId = overrides.grId ?? randomUUID();
  r.supplierId = overrides.supplierId ?? randomUUID();
  r.discrepancyType = overrides.discrepancyType ?? 'cantidad';
  r.diff = overrides.diff ?? { expectedQty: 100, actualQty: 120, unit: 'kg' };
  r.state = overrides.state ?? 'abierta';
  r.resolvedAt = overrides.resolvedAt ?? null;
  r.resolvedByUserId = overrides.resolvedByUserId ?? null;
  r.resolutionNotes = overrides.resolutionNotes ?? null;
  r.createdAt = overrides.createdAt ?? new Date('2026-05-18T10:00:00Z');
  r.updatedAt = overrides.updatedAt ?? new Date('2026-05-18T10:00:00Z');
  return r;
}

function buildService(): {
  svc: ReconciliationService;
  repo: jest.Mocked<
    Pick<ReconciliationRepository, 'listByOrg' | 'findById' | 'resolve'>
  >;
} {
  const repo = {
    listByOrg: jest.fn(),
    findById: jest.fn(),
    resolve: jest.fn(),
  };
  const svc = new ReconciliationService(repo as unknown as ReconciliationRepository);
  return { svc, repo: repo as never };
}

describe('ReconciliationService', () => {
  describe('findOpen', () => {
    it('delegates to repo with state=abierta filter', async () => {
      const { svc, repo } = buildService();
      const rows = [makeRecon()];
      repo.listByOrg.mockResolvedValue(rows);
      const result = await svc.findOpen(ORG, { limit: 25 });
      expect(repo.listByOrg).toHaveBeenCalledWith(ORG, {
        state: 'abierta',
        limit: 25,
      });
      expect(result).toBe(rows);
    });
  });

  describe('list', () => {
    it('forwards opts verbatim (no state coercion)', async () => {
      const { svc, repo } = buildService();
      repo.listByOrg.mockResolvedValue([]);
      await svc.list(ORG, { state: 'aceptada', limit: 50, offset: 10 });
      expect(repo.listByOrg).toHaveBeenCalledWith(ORG, {
        state: 'aceptada',
        limit: 50,
        offset: 10,
      });
    });
  });

  describe('getById', () => {
    it('returns row when found', async () => {
      const { svc, repo } = buildService();
      const row = makeRecon();
      repo.findById.mockResolvedValue(row);
      await expect(svc.getById(row.id, ORG)).resolves.toBe(row);
    });

    it('throws ReconciliationNotFoundError on cross-tenant access (null)', async () => {
      const { svc, repo } = buildService();
      repo.findById.mockResolvedValue(null);
      await expect(svc.getById('any-id', OTHER_ORG)).rejects.toBeInstanceOf(
        ReconciliationNotFoundError,
      );
    });
  });

  describe('resolve — state machine', () => {
    it.each(['aceptada', 'nota-credito', 'devuelta'] as const)(
      'accepts terminal state %s',
      async (state) => {
        const { svc, repo } = buildService();
        repo.resolve.mockResolvedValue(1);
        const updated = makeRecon({
          state,
          resolvedAt: new Date('2026-05-18T11:00:00Z'),
          resolvedByUserId: USER,
        });
        repo.findById.mockResolvedValue(updated);

        const out = await svc.resolve(
          updated.id,
          ORG,
          { state, notes: 'reason' },
          USER,
        );
        expect(out.state).toBe(state);
        expect(repo.resolve).toHaveBeenCalledWith(updated.id, ORG, {
          state,
          userId: USER,
          notes: 'reason',
        });
      },
    );

    it('rejects abierta as a target state', async () => {
      const { svc, repo } = buildService();
      await expect(
        svc.resolve(
          'id',
          ORG,
          // Cast — TS will reject statically but the runtime must too.
          { state: 'abierta' as never, notes: null },
          USER,
        ),
      ).rejects.toBeInstanceOf(IllegalReconciliationTransition);
      expect(repo.resolve).not.toHaveBeenCalled();
    });

    it('throws ReconciliationNotFoundError when affected=0 AND no row exists', async () => {
      const { svc, repo } = buildService();
      repo.resolve.mockResolvedValue(0);
      repo.findById.mockResolvedValue(null);
      await expect(
        svc.resolve('missing', ORG, { state: 'aceptada', notes: null }, USER),
      ).rejects.toBeInstanceOf(ReconciliationNotFoundError);
    });

    it('throws IllegalReconciliationTransition when affected=0 AND row is already resolved', async () => {
      const { svc, repo } = buildService();
      repo.resolve.mockResolvedValue(0);
      const already = makeRecon({
        state: 'aceptada',
        resolvedAt: new Date('2026-05-17T08:00:00Z'),
        resolvedByUserId: USER,
      });
      repo.findById.mockResolvedValue(already);
      await expect(
        svc.resolve(already.id, ORG, { state: 'devuelta', notes: null }, USER),
      ).rejects.toBeInstanceOf(IllegalReconciliationTransition);
    });

    it('caps notes length at 1000 chars', async () => {
      const { svc, repo } = buildService();
      const longNotes = 'x'.repeat(1001);
      await expect(
        svc.resolve(
          'id',
          ORG,
          { state: 'aceptada', notes: longNotes },
          USER,
        ),
      ).rejects.toBeInstanceOf(ReconciliationInvariantError);
      expect(repo.resolve).not.toHaveBeenCalled();
    });

    it('accepts null notes', async () => {
      const { svc, repo } = buildService();
      repo.resolve.mockResolvedValue(1);
      const updated = makeRecon({
        state: 'aceptada',
        resolvedAt: new Date(),
        resolvedByUserId: USER,
      });
      repo.findById.mockResolvedValue(updated);
      await expect(
        svc.resolve(updated.id, ORG, { state: 'aceptada', notes: null }, USER),
      ).resolves.toBe(updated);
    });

    it('multi-tenant: a different orgId resolving the same id is a not-found', async () => {
      const { svc, repo } = buildService();
      repo.resolve.mockResolvedValue(0);
      repo.findById.mockResolvedValue(null); // cross-tenant → null
      await expect(
        svc.resolve('foreign-id', OTHER_ORG, { state: 'aceptada', notes: null }, USER),
      ).rejects.toBeInstanceOf(ReconciliationNotFoundError);
      expect(repo.resolve).toHaveBeenCalledWith('foreign-id', OTHER_ORG, {
        state: 'aceptada',
        userId: USER,
        notes: null,
      });
    });
  });
});
