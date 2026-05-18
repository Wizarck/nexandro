import { Module } from '@nestjs/common';
import { ReconciliationController } from './interface/reconciliation.controller';

/**
 * Placeholder module for the j11 Reconciliación tab (Sprint 3 Block C).
 *
 * SHELL ONLY — wires a single read-only controller that returns `[]`.
 * The reconciliation aggregate (entity, repository, application service,
 * discrepancy detection) is a follow-up. Once it lands, providers +
 * exports get added here. Spec: docs/ux/j11.md §6.
 */
@Module({
  controllers: [ReconciliationController],
})
export class ReconciliationModule {}
