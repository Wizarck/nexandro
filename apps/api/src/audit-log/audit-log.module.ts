import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogIdempotencyCache } from './application/audit-log-idempotency';
import { AuditLogService } from './application/audit-log.service';
import { AuditLogSubscriber } from './application/audit-log.subscriber';
import {
  AUDIT_ARCHIVE_STORAGE,
} from './archival/audit-archive-storage';
import { createAuditArchiveStorage } from './archival/audit-archive-storage.factory';
import { AuditLogArchivalScanner } from './archival/audit-log-archival.scanner';
import { AuditLog } from './domain/audit-log.entity';
import { AuditLogController } from './interface/audit-log.controller';

/**
 * Canonical audit log BC. Hosts the `audit_log` table, the
 * `AuditLogSubscriber` that listens to all known event types, and the
 * `GET /audit-log` endpoint.
 *
 * Per ADR-AUDIT-WRITER, no other BC depends on this module — they emit
 * events on the bus, the subscriber persists them. Adding a new event type
 * in M3+ is a 1-line addition to `AuditLogSubscriber` + a constants entry
 * in `application/types.ts`.
 *
 * Per slice #21 m3-audit-log-hash-chain-hardening (Wave 2.3):
 *  - `AuditLogIdempotencyCache` (LRU 10K, 1h TTL) for ADR-IDEMPOTENT-EMIT-DEDUP.
 *  - Hash chain integration in `AuditLogService.record()` per
 *    ADR-HASH-CHAIN-VALIDATION-PER-WRITE.
 *  - `AuditLogSubscriber` extended with @OnEvent handlers for every M3
 *    deferred event type per ADR-SUBSCRIBER-FAN-OUT.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditLogController],
  providers: [
    AuditLogService,
    AuditLogSubscriber,
    AuditLogArchivalScanner,
    {
      provide: AuditLogIdempotencyCache,
      useFactory: () => new AuditLogIdempotencyCache(),
    },
    {
      provide: AUDIT_ARCHIVE_STORAGE,
      useFactory: createAuditArchiveStorage,
    },
  ],
  exports: [AuditLogService],
})
export class AuditLogModule {}
