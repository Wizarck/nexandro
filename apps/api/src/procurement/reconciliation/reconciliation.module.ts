import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscrepancyDetectorService } from './application/discrepancy-detector.service';
import { ReconciliationService } from './application/reconciliation.service';
import { Reconciliation } from './domain/reconciliation.entity';
import { ReconciliationRepository } from './infrastructure/reconciliation.repository';
import { ReconciliationController } from './interface/reconciliation.controller';

/**
 * procurement.reconciliation bounded context (Sprint 4 W3-5).
 *
 * Replaces the PR #218 placeholder. Surface:
 *
 *  - GET  /m3/procurement/reconciliation        — Owner + Manager
 *  - POST /m3/procurement/reconciliation/:id/resolve — Owner only
 *
 * Providers:
 *  - ReconciliationRepository — multi-tenant data access (org-id gated).
 *  - ReconciliationService    — read/resolve state-machine guardian.
 *  - DiscrepancyDetectorService — pure (no repo) so GR confirmation
 *    can wire it later without import cycles.
 *
 * Exports `DiscrepancyDetectorService` + `ReconciliationRepository`
 * so the GR module can wire detection on GR confirmation in a
 * follow-up slice without re-instantiating providers.
 *
 * Spec: docs/ux/j11.md §6.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Reconciliation])],
  controllers: [ReconciliationController],
  providers: [
    ReconciliationRepository,
    ReconciliationService,
    DiscrepancyDetectorService,
  ],
  exports: [ReconciliationRepository, DiscrepancyDetectorService],
})
export class ReconciliationModule {}
