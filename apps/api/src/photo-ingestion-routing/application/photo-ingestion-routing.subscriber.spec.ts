import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { AuditEventEnvelope } from '../../audit-log/application/types';
import { PhotoIngestionRoutingService } from './photo-ingestion-routing.service';
import { PhotoIngestionRoutingSubscriber } from './photo-ingestion-routing.subscriber';

function buildSubscriber() {
  const routing = {
    routeSigned: jest.fn(),
  } as unknown as jest.Mocked<Pick<PhotoIngestionRoutingService, 'routeSigned'>>;
  const subscriber = new PhotoIngestionRoutingSubscriber(
    routing as unknown as PhotoIngestionRoutingService,
  );
  return { subscriber, routing };
}

function envelope(): AuditEventEnvelope {
  return {
    organizationId: '11111111-1111-4111-8111-111111111111',
    aggregateType: 'photo_ingestion_item',
    aggregateId: '22222222-2222-4222-8222-222222222222',
    actorUserId: 'user-1',
    actorKind: 'user',
    payloadAfter: { kind: 'product' },
  };
}

describe('PhotoIngestionRoutingSubscriber', () => {
  it('forwards PHOTO_INGESTION_SIGNED envelope to routing.routeSigned', async () => {
    const { subscriber, routing } = buildSubscriber();
    routing.routeSigned.mockResolvedValue({ routed: true });
    await subscriber.onPhotoIngestionSigned(envelope());
    expect(routing.routeSigned).toHaveBeenCalledTimes(1);
    expect(routing.routeSigned.mock.calls[0]![0]!.aggregateId).toBe(
      '22222222-2222-4222-8222-222222222222',
    );
  });

  it('swallows thrown errors and logs them; does NOT propagate', async () => {
    const { subscriber, routing } = buildSubscriber();
    routing.routeSigned.mockRejectedValue(new Error('boom'));
    const errSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    await expect(
      subscriber.onPhotoIngestionSigned(envelope()),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]![0])).toMatch(/aggregate=22222222/);
    errSpy.mockRestore();
  });

  it('logs unknown-aggregate marker when envelope is malformed and routing throws', async () => {
    const { subscriber, routing } = buildSubscriber();
    routing.routeSigned.mockRejectedValue(new Error('shape error'));
    const errSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    await subscriber.onPhotoIngestionSigned(
      undefined as unknown as AuditEventEnvelope,
    );
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]![0])).toMatch(/aggregate=<unknown>/);
    errSpy.mockRestore();
  });
});
