import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import { PhotoIngestionRoutingService } from './photo-ingestion-routing.service';

/**
 * Subscriber wired on `PHOTO_INGESTION_SIGNED` (M3 hardening H1a slice
 * `m3-photo-ingest-downstream-routing`). Per ADR-CROSS-BC-SUBSCRIBER-LOCATION
 * (slice #21) the audit-log BC owns audit-row writes; THIS subscriber is
 * a NON-AUDIT consumer of the same bus event, performing the domain side
 * effect (Lot / GR draft creation) on behalf of the photo-ingestion-routing
 * BC.
 *
 * Wrapped in try/catch: the signing transaction has already committed by
 * the time this handler runs, and the routing decision is best-effort
 * downstream consumer logic. Throwing here would either be silently
 * swallowed by the bus or trigger NestJS retry on a deterministic failure.
 * On exception, log + drop; the operator sees the signed envelope but no
 * routing envelope (operations triage via dashboard or manual create).
 */
@Injectable()
export class PhotoIngestionRoutingSubscriber {
  private readonly logger = new Logger(PhotoIngestionRoutingSubscriber.name);

  constructor(
    private readonly routing: PhotoIngestionRoutingService,
  ) {}

  @OnEvent(AuditEventType.PHOTO_INGESTION_SIGNED)
  async onPhotoIngestionSigned(envelope: AuditEventEnvelope): Promise<void> {
    try {
      await this.routing.routeSigned(envelope);
    } catch (err) {
      this.logger.error(
        `photo-ingestion-routing.subscriber.error: aggregate=${envelope?.aggregateId ?? '<unknown>'} ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
