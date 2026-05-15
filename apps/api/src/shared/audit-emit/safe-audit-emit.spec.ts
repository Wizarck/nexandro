import type { EventEmitter2 } from '@nestjs/event-emitter';
import { safeAuditEmit } from './safe-audit-emit';
import type { AuditEventEnvelope } from '../../audit-log/application/types';

const ORG = '00000000-0000-4000-8000-00000000aaaa';

function buildHarness() {
  const emit = jest.fn();
  const events = { emitAsync: emit } as unknown as Pick<EventEmitter2, 'emitAsync'>;
  const errorLog = jest.fn();
  const logger = { error: errorLog };
  return { events, emit, logger, errorLog };
}

const ENVELOPE: AuditEventEnvelope = {
  organizationId: ORG,
  aggregateType: 'lot',
  aggregateId: 'lot-1',
  actorUserId: null,
  actorKind: 'system',
  payloadAfter: { foo: 'bar' },
};

describe('safeAuditEmit', () => {
  it('forwards the call to emitAsync with the given channel + envelope on the happy path', async () => {
    const { events, emit, logger, errorLog } = buildHarness();
    emit.mockResolvedValueOnce([]);
    await safeAuditEmit(events, 'AGENT_ACTION_FORENSIC', ENVELOPE, logger);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('AGENT_ACTION_FORENSIC', ENVELOPE);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('logs at ERROR with eventType + aggregateId + orgId when emitAsync rejects, and does NOT rethrow', async () => {
    const { events, emit, logger, errorLog } = buildHarness();
    emit.mockRejectedValueOnce(new Error('audit chain broken'));
    // Should not throw — the helper swallows.
    await expect(
      safeAuditEmit(events, 'LOT_CREATED', ENVELOPE, logger),
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledTimes(1);
    const [message] = errorLog.mock.calls[0]!;
    expect(message).toContain('audit-emit.failed');
    expect(message).toContain('LOT_CREATED');
    expect(message).toContain(ENVELOPE.aggregateId);
    expect(message).toContain(ENVELOPE.organizationId);
    expect(message).toContain('audit chain broken');
  });

  it('handles non-Error rejections by coercing them to String', async () => {
    const { events, emit, logger, errorLog } = buildHarness();
    emit.mockRejectedValueOnce('raw-string-rejection');
    await safeAuditEmit(events, 'CCP_READING_RECORDED', ENVELOPE, logger);
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog.mock.calls[0]![0]).toContain('raw-string-rejection');
  });
});
