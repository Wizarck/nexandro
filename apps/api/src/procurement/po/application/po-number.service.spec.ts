import { PoCounterService } from '../infrastructure/po-counter.service';
import { PoNumberService } from './po-number.service';

describe('PoNumberService', () => {
  describe('format (static)', () => {
    it('pads to 4 digits', () => {
      expect(PoNumberService.format(2026, 1)).toBe('PO-2026-0001');
      expect(PoNumberService.format(2026, 42)).toBe('PO-2026-0042');
      expect(PoNumberService.format(2026, 9999)).toBe('PO-2026-9999');
    });

    it('widens beyond 4 digits naturally', () => {
      expect(PoNumberService.format(2026, 12345)).toBe('PO-2026-12345');
    });
  });

  describe('allocate', () => {
    const orgId = '11111111-1111-4111-8111-111111111111';

    function buildSvc(allocateNext: jest.Mock): PoNumberService {
      const stub = { allocateNext } as unknown as PoCounterService;
      return new PoNumberService(stub);
    }

    it('formats the allocated number using the asOf year', async () => {
      const allocateNext = jest.fn().mockResolvedValue(1);
      const svc = buildSvc(allocateNext);
      const out = await svc.allocate(orgId, new Date('2026-05-14T08:00:00Z'));
      expect(out).toBe('PO-2026-0001');
      expect(allocateNext).toHaveBeenCalledWith(orgId, 2026, undefined);
    });

    it('uses UTC year for rollover determinism', async () => {
      // A local-time year-rollover edge case: 2026-12-31T23:30 in UTC
      // is still 2026 — but a Europe/Madrid clock would show 2027-01-01T00:30.
      // The service MUST use UTC.
      const allocateNext = jest.fn().mockResolvedValue(42);
      const svc = buildSvc(allocateNext);
      const out = await svc.allocate(orgId, new Date('2026-12-31T23:30:00Z'));
      expect(out).toBe('PO-2026-0042');
      expect(allocateNext).toHaveBeenCalledWith(orgId, 2026, undefined);
    });

    it('passes through the EntityManager when supplied', async () => {
      const allocateNext = jest.fn().mockResolvedValue(7);
      const svc = buildSvc(allocateNext);
      const fakeManager = { __tag: 'em' } as unknown as Parameters<
        PoNumberService['allocate']
      >[2];
      const out = await svc.allocate(orgId, new Date('2027-01-01T00:00:00Z'), fakeManager);
      expect(out).toBe('PO-2027-0007');
      expect(allocateNext).toHaveBeenCalledWith(orgId, 2027, fakeManager);
    });
  });

  describe('parse', () => {
    const svc = new PoNumberService({} as unknown as PoCounterService);

    it('parses canonical 4-digit form', () => {
      expect(svc.parse('PO-2026-0001')).toEqual({ year: 2026, sequence: 1 });
      expect(svc.parse('PO-2026-0042')).toEqual({ year: 2026, sequence: 42 });
    });

    it('parses extended 5+ digit form', () => {
      expect(svc.parse('PO-2026-12345')).toEqual({ year: 2026, sequence: 12345 });
    });

    it('returns null on malformed input', () => {
      expect(svc.parse('PO-26-0001')).toBeNull();
      expect(svc.parse('PO-2026-01')).toBeNull();
      expect(svc.parse('po-2026-0001')).toBeNull();
      expect(svc.parse('PO_2026_0001')).toBeNull();
      expect(svc.parse('')).toBeNull();
      expect(svc.parse('PO-2026-')).toBeNull();
    });
  });
});
