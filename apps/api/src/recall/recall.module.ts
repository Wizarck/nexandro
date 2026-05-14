import { Module } from '@nestjs/common';
import { TraceService } from './application/trace.service';
import { TraceController } from './interface/trace.controller';

/**
 * Recall bounded context (M3 Wave 2.5).
 *
 * Slice #12 (`m3-trace-tree-forward-reverse`) ships:
 *   - TraceService — forward + reverse traversal queries against the
 *     consumption ledger persisted by slice #2 + slice #21.
 *   - TraceController — REST surface gated to OWNER + MANAGER.
 *
 * Slice #11 (`m3-incident-search-multi-anchor`, parallel) is expected
 * to ALSO touch this module's `providers` + `controllers`. Merge
 * resolution: keep both providers + both controllers; the module class
 * is a pure NestJS @Module shell with no slice-specific logic.
 *
 * Downstream consumers:
 *   - slice #13 m3-recall-86-flag-dispatch — dossier embeds forward
 *     tree + the operator-action layer.
 *   - slice #14 m3-recall-pdf-export — PDF export consumes the same
 *     tree shape.
 *   - slice #15 m3-appcc-export-multilingual — APPCC regulatory PDF
 *     embeds the trace.
 */
@Module({
  providers: [TraceService],
  controllers: [TraceController],
  exports: [TraceService],
})
export class RecallModule {}
