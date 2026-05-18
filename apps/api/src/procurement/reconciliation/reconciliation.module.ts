import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reconciliation } from './domain/reconciliation.entity';
import { ReconciliationRepository } from './infrastructure/reconciliation.repository';
import { ReconciliationController } from './interface/reconciliation.controller';

/**
 * procurement.reconciliation bounded context (Sprint 4 W3-5 / W3-5b).
 *
 * PR #226 (W3-5 checkpoint 1) shipped only the entity + migration 0046.
 * Sprint 4 W3-5b (this checkpoint) lights up the rest:
 *  - Repository (multi-tenant gate, list/find/create/resolve)
 *  - Discrepancy detector (pure domain function)
 *  - Application service (state machine + audit emit)
 *  - Real controller (replaces the placeholder shell from PR #218)
 *
 * Multi-tenant invariant: every read/write goes through the dedicated
 * repository which always WHERE-clauses `organization_id`. No direct
 * `TypeOrmModule.forFeature` consumers outside this module.
 *
 * Spec: docs/ux/j11.md §6.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Reconciliation])],
  controllers: [ReconciliationController],
  providers: [ReconciliationRepository],
  exports: [ReconciliationRepository],
})
export class ReconciliationModule {}
