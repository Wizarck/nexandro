import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { PhotoStorageModule } from '../photo-storage/photo-storage.module';
import { SharedVisionLlmModule } from '../shared/vision-llm/shared-vision-llm.module';
import { HitlQueueQuery } from './application/hitl-queue.query';
import { HitlSignService } from './application/hitl-sign.service';
import { IngestionItemRepository } from './application/ingestion-item.repository';
import { IngestionService } from './application/ingestion.service';
import { IngestionItem } from './domain/ingestion-item.entity';
import { IngestionController } from './interface/ingestion.controller';

/**
 * Photo-ingestion BC (M3 Wave 2.8, slice #17a).
 *
 * Owns:
 *  - `IngestionItem` entity + `photo_ingestion_items` table.
 *  - `IngestionService` (vision-LLM extraction + ADR-034 banding + persistence).
 *  - `HitlSignService` (operator-confirmed corrections + signed envelope).
 *  - `HitlQueueQuery` + `IngestionItemRepository` (read surfaces).
 *  - `IngestionController` REST surface at `/m3/photo-ingest`.
 *
 * Imports:
 *  - `PhotoStorageModule` for `PhotoStorageService` (signed read URLs for the
 *    vision-LLM provider).
 *  - `SharedVisionLlmModule` for the `VISION_LLM_PROVIDER` DI token (slice
 *    #16). The factory resolves the env-pinned adapter at boot.
 *  - `AuditLogModule` so the slice can compile-time depend on the
 *    `AuditLogService` if a future emit-side translator is introduced.
 *
 * Audit subscriber registration for the 7 new `PHOTO_INGESTION_*` channels
 * lives in `AuditLogSubscriber` per ADR-CROSS-BC-SUBSCRIBER-LOCATION +
 * slice #21's ADR-SUBSCRIBER-FAN-OUT.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([IngestionItem]),
    PhotoStorageModule,
    SharedVisionLlmModule,
    AuditLogModule,
  ],
  controllers: [IngestionController],
  providers: [
    IngestionItemRepository,
    IngestionService,
    HitlSignService,
    HitlQueueQuery,
  ],
  exports: [IngestionService, HitlSignService, HitlQueueQuery],
})
export class PhotoIngestionModule {}
