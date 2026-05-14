import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../audit-log/domain/audit-log.entity';
import { AiObsQueryService } from './ai-obs-query.service';
import { DashboardController } from './dashboard.controller';

/**
 * `GET /m3/ai-obs/*` dashboard module — slice #20 m3-ai-obs-ui (Wave 2.4).
 *
 * Per ADR-BACKEND-READ-ONLY, this module exposes only the dashboard
 * controller + the read-only `AiObsQueryService`. No writers, no
 * subscribers. Imports `TypeOrmModule.forFeature([AuditLog])` for the
 * Top-5 failures query against `audit_log`; reads against
 * `ai_usage_rollup` (slice #19) use `DataSource.query()` directly so
 * the slice compiles regardless of slice #19's merge order.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [DashboardController],
  providers: [AiObsQueryService],
  exports: [AiObsQueryService],
})
export class DashboardModule {}
