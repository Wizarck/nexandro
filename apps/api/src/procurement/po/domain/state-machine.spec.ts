import { PO_STATES, type PoState } from './types';
import { canTransition, assertTransition } from './state-machine';
import { IllegalStateTransitionError } from './errors';

/**
 * Source-of-truth legal transitions per design.md ADR-PO-STATE-MACHINE.
 * Duplicated here intentionally so the spec validates the implementation
 * against the matrix as documented, not against the implementation itself.
 *
 * Format: array of `${from}->${to}` strings. 9 legal pairs, 27 illegal.
 */
const LEGAL_PAIRS = new Set<string>([
  'draft->sent',
  'draft->cancelled',
  'sent->partially_received',
  'sent->received',
  'sent->cancelled',
  'partially_received->partially_received',
  'partially_received->received',
  'partially_received->cancelled',
  'received->closed',
]);

describe('state-machine', () => {
  describe('canTransition (exhaustive 36-pair matrix)', () => {
    for (const from of PO_STATES) {
      for (const to of PO_STATES) {
        const key = `${from}->${to}`;
        const expected = LEGAL_PAIRS.has(key);
        it(`${key} is ${expected ? 'legal' : 'illegal'}`, () => {
          expect(canTransition(from, to)).toBe(expected);
        });
      }
    }

    it('matrix contains exactly 9 legal pairs', () => {
      let count = 0;
      for (const from of PO_STATES) {
        for (const to of PO_STATES) {
          if (canTransition(from, to)) count++;
        }
      }
      expect(count).toBe(9);
    });
  });

  describe('assertTransition', () => {
    it('does not throw on legal transitions', () => {
      expect(() => assertTransition('draft', 'sent')).not.toThrow();
      expect(() => assertTransition('sent', 'partially_received')).not.toThrow();
      expect(() =>
        assertTransition('partially_received', 'partially_received'),
      ).not.toThrow();
      expect(() => assertTransition('received', 'closed')).not.toThrow();
    });

    it('throws IllegalStateTransitionError with both states in the message', () => {
      try {
        assertTransition('draft', 'received');
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(IllegalStateTransitionError);
        const msg = (err as Error).message;
        expect(msg).toContain('draft');
        expect(msg).toContain('received');
      }
    });

    it('throws on received -> cancelled (cannot cancel after full receipt)', () => {
      expect(() => assertTransition('received', 'cancelled')).toThrow(
        IllegalStateTransitionError,
      );
    });

    it('throws on every outgoing transition from closed', () => {
      for (const to of PO_STATES) {
        expect(() => assertTransition('closed', to)).toThrow(
          IllegalStateTransitionError,
        );
      }
    });

    it('throws on every outgoing transition from cancelled', () => {
      for (const to of PO_STATES) {
        expect(() => assertTransition('cancelled', to)).toThrow(
          IllegalStateTransitionError,
        );
      }
    });
  });

  describe('purity', () => {
    it('returns identical results for identical inputs', () => {
      const pairs: Array<[PoState, PoState]> = [
        ['draft', 'sent'],
        ['received', 'closed'],
        ['draft', 'received'],
      ];
      for (const [from, to] of pairs) {
        const first = canTransition(from, to);
        const second = canTransition(from, to);
        expect(first).toBe(second);
      }
    });

    it('exposes no observable side effects (no thrown error from canTransition)', () => {
      // canTransition is a predicate; it MUST NOT throw on any input pair
      // from the documented state set.
      for (const from of PO_STATES) {
        for (const to of PO_STATES) {
          expect(() => canTransition(from, to)).not.toThrow();
        }
      }
    });
  });
});
