import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LotModule } from '../lot/lot.module';
import { ExpiryAlertsFiredRepository } from './application/expiry-alerts-fired.repository';
import { ExpiryScannerService } from './application/expiry-scanner.service';
import { ExpiryAlertsFired } from './domain/expiry-alerts-fired.entity';

/**
 * `inventory.expiry` BC (slice #3, Wave 2.2).
 *
 * Wires:
 *  - `ExpiryAlertsFired` TypeORM entity (append-only fired-log)
 *  - `ExpiryAlertsFiredRepository` (exported for slice #20 j8 widget)
 *  - `ExpiryScannerService` (cron-driven, internal)
 *
 * Imports `LotModule` to inject `LotRepository` for the read-only
 * `findByExpiryWindow` + `findDistinctOrgsWithExpiryIn` scans.
 *
 * `ScheduleModule.forRoot()` is registered at the app root (see
 * `app.module.ts`); this module does NOT register it locally because
 * (a) it must run process-wide, (b) idempotency: `forRoot` is safe to
 * call once at the app root and not in feature modules.
 *
 * The `@OnEvent('audit.event')` subscriber that persists
 * `LotExpiryNearEvent` into `audit_log` is intentionally NOT wired
 * here — deferred to slice #21 per design.md ADR-EXPIRY-NO-EMIT-HERE.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ExpiryAlertsFired]), LotModule],
  providers: [ExpiryAlertsFiredRepository, ExpiryScannerService],
  exports: [ExpiryAlertsFiredRepository],
})
export class ExpiryModule {}
