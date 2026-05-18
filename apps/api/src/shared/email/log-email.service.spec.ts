import { Logger } from '@nestjs/common';
import { LogEmailService } from './log-email.service';

describe('LogEmailService', () => {
  let svc: LogEmailService;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    svc = new LogEmailService();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs the recipient + accept URL + role + org + invitedBy', async () => {
    await svc.sendInvitation(
      'staff@example.com',
      'http://localhost:5173/invitations/accept?token=abc',
      'STAFF',
      'Acme S.L.',
      'Lourdes García',
    );
    expect(logSpy).toHaveBeenCalledTimes(1);
    const msg = logSpy.mock.calls[0][0] as string;
    expect(msg).toContain('staff@example.com');
    expect(msg).toContain('http://localhost:5173/invitations/accept?token=abc');
    expect(msg).toContain('STAFF');
    expect(msg).toContain('Acme S.L.');
    expect(msg).toContain('Lourdes García');
  });

  it('does not throw on missing optional context (still logs what it has)', async () => {
    await expect(
      svc.sendInvitation('a@b.co', 'http://x/y', 'OWNER', '', ''),
    ).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
