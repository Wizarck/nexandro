/**
 * INT testcontainer placeholder for m3-trace-tree-forward-reverse
 * (Wave 2.5 slice #12). File path reserved per architecture-m3.md
 * line 563.
 *
 * Deferred from slice #12 per tasks.md §Deferred (item D1). When
 * implemented, the harness SHOULD:
 *
 *   1. Spin up a Postgres testcontainer, run migrations through 0036.
 *   2. Seed 2 organisations with overlapping lots / recipes / menu items.
 *   3. Insert a synthetic LOT_CONSUMED chain of N audit_log rows
 *      (parameterised over depth: 1, 5, 10, 15).
 *   4. Run TraceService.traceForward + traceReverse and assert:
 *      - the returned tree's depth matches the cap
 *      - `depthExceeded: true` fires at the cap boundary
 *      - cross-tenant rows do NOT leak into the other org's trace
 *      - per-org `recall_max_depth` override is honoured
 *
 * NO test body in this stub — the placeholder ensures the file path
 * stays reserved and discoverable by grep.
 */

import { describe, it } from 'vitest';

describe.skip('recall-traversal-depth (deferred — see tasks.md §Deferred)', () => {
  it('placeholder — implementation pending', () => {
    // pending
  });
});
