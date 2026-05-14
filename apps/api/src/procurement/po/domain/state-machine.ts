/**
 * Pure-function state machine for `PurchaseOrder` per ADR-PO-STATE-MACHINE.
 *
 * No NestJS imports, no DB calls, no side effects. Exhaustively unit-tested
 * (state-machine.spec.ts walks all 36 (from, to) pairs).
 *
 * Legal transition table (10 legal pairs, 26 illegal):
 *
 *   from \ to    | draft | sent | partially_received | received | closed | cancelled
 *   draft        |   .   |  X   |          .          |    .     |   .    |    X
 *   sent         |   .   |  .   |          X          |    X     |   .    |    X
 *   partially_R  |   .   |  .   |          X          |    X     |   .    |    X
 *   received     |   .   |  .   |          .          |    .     |   X    |    .
 *   closed       |   .   |  .   |          .          |    .     |   .    |    .
 *   cancelled    |   .   |  .   |          .          |    .     |   .    |    .
 *
 * `closed` and `cancelled` are terminal — no outgoing transitions.
 * `partially_received -> partially_received` is idempotent (additional partial GR
 *  in slice #7 reuses this on every delivery).
 */

import type { PoState } from './types';
import { IllegalStateTransitionError } from './errors';

const LEGAL_TRANSITIONS: ReadonlyMap<PoState, ReadonlySet<PoState>> = new Map<
  PoState,
  ReadonlySet<PoState>
>([
  ['draft', new Set<PoState>(['sent', 'cancelled'])],
  ['sent', new Set<PoState>(['partially_received', 'received', 'cancelled'])],
  [
    'partially_received',
    new Set<PoState>(['partially_received', 'received', 'cancelled']),
  ],
  ['received', new Set<PoState>(['closed'])],
  ['closed', new Set<PoState>()],
  ['cancelled', new Set<PoState>()],
]);

/**
 * Returns true iff `from -> to` is a legal transition per the matrix.
 * Pure function: same inputs always produce the same output.
 */
export function canTransition(from: PoState, to: PoState): boolean {
  const allowedTargets = LEGAL_TRANSITIONS.get(from);
  if (allowedTargets === undefined) return false;
  return allowedTargets.has(to);
}

/**
 * Asserts that `from -> to` is a legal transition; throws
 * {@link IllegalStateTransitionError} otherwise.
 */
export function assertTransition(from: PoState, to: PoState): void {
  if (!canTransition(from, to)) {
    throw new IllegalStateTransitionError(from, to);
  }
}
