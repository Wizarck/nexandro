import { IncidentCodeGenerator } from './incident-code-generator';
import type { AuditLogService } from '../../audit-log/application/audit-log.service';

describe('IncidentCodeGenerator', () => {
  function makeService(total: number): jest.Mocked<Pick<AuditLogService, 'query'>> {
    return {
      query: jest.fn(async () => ({
        rows: [],
        total,
        limit: 1,
        offset: 0,
      })),
    } as jest.Mocked<Pick<AuditLogService, 'query'>>;
  }

  it('produces IR-YYYY-0001 for the first incident of the year', async () => {
    const audit = makeService(0);
    const gen = new IncidentCodeGenerator(audit as unknown as AuditLogService);
    const code = await gen.nextCode('org-1', new Date('2026-05-13T02:21:00Z'));
    expect(code).toBe('IR-2026-0001');
  });

  it('increments the counter for each prior open envelope', async () => {
    const audit = makeService(6);
    const gen = new IncidentCodeGenerator(audit as unknown as AuditLogService);
    const code = await gen.nextCode('org-1', new Date('2026-05-13T02:21:00Z'));
    expect(code).toBe('IR-2026-0007');
  });

  it('resets the counter across year boundaries (calls query with year-scoped window)', async () => {
    const audit = makeService(0);
    const gen = new IncidentCodeGenerator(audit as unknown as AuditLogService);
    await gen.nextCode('org-1', new Date('2027-01-01T00:00:01Z'));
    const callArgs = audit.query.mock.calls[0][0];
    expect(callArgs.since!.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(callArgs.until!.toISOString()).toBe('2028-01-01T00:00:00.000Z');
  });

  it('pads the counter to 4 digits', async () => {
    const audit = makeService(99);
    const gen = new IncidentCodeGenerator(audit as unknown as AuditLogService);
    const code = await gen.nextCode('org-1', new Date('2026-05-13T02:21:00Z'));
    expect(code).toBe('IR-2026-0100');
  });
});
