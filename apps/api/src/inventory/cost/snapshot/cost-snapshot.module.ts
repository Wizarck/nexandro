import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CostSnapshot } from './domain/cost-snapshot.entity';
import { CostSnapshotRepository } from './application/cost-snapshot.repository';
import { CostSnapshotService } from './application/cost-snapshot.service';
import { CostSnapshotSubscriber } from './application/cost-snapshot.subscriber';
import { INVENTORY_COST_RESOLVER } from './application/ports/cost-resolver.port';

/**
 * Inventory.cost-snapshot bounded context (M3 Wave 2.2, slice #5).
 *
 * Provides:
 *  - {@link CostSnapshotRepository} (append-only)
 *  - {@link CostSnapshotService} (snapshotConsumption write path)
 *  - {@link CostSnapshotSubscriber} (@OnEvent LOT_CONSUMED listener)
 *
 * Imports `EventEmitterModule.forRoot()` at the app level (app.module.ts);
 * `@OnEvent` decorator activation requires the subscriber to be in the
 * NestJS providers list (Wave 1.x INT lesson — codified in user memory).
 *
 * The {@link INVENTORY_COST_RESOLVER} DI token MUST be bound by slice #4
 * (`m3-inventory-cost-resolver-fifo-fefo`). Until slice #4 lands, the
 * `useValue` placeholder below allows the module to load without crash;
 * at runtime any `LOT_CONSUMED` event will produce a NotImplementedError
 * via the placeholder resolver. Phase 3 merge order:
 *   #2 (event emitter) → #4 (resolver) → #5 (this slice, subscriber active)
 *
 * The placeholder is intentionally NOT silenced — slice #4's merge replaces
 * it with the FIFO/FEFO implementation; if a deployment skips #4 the
 * runtime throw is the right signal.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CostSnapshot])],
  providers: [
    CostSnapshotRepository,
    CostSnapshotService,
    CostSnapshotSubscriber,
    {
      provide: INVENTORY_COST_RESOLVER,
      useValue: {
        resolve: () => {
          throw new Error(
            'INVENTORY_COST_RESOLVER unbound. Slice #4 ' +
              '(m3-inventory-cost-resolver-fifo-fefo) MUST provide the ' +
              'FIFO/FEFO implementation before LOT_CONSUMED traffic can ' +
              'produce cost_snapshots rows. Phase-3 merge replaces this ' +
              'placeholder.',
          );
        },
      },
    },
  ],
  exports: [CostSnapshotRepository, CostSnapshotService],
})
export class CostSnapshotModule {}
