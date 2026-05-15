import {
  CONFIDENCE_AUTO_FILL,
  CONFIDENCE_FLAG_FOR_REVIEW,
} from '../domain/constants';
import { classifyField } from './confidence-band.classifier';

/**
 * IEEE 754 boundary discipline (ADR-034 + j12 §Notes):
 *
 *  - `0.85` exactly = auto_fill (inclusive `>=` comparison).
 *  - `0.60` exactly = flag_for_review (inclusive).
 *  - The next representable double below `0.85` is `0.8499999999999999`;
 *    above is `0.8500000000000001`.
 *  - Same boundary pair on `0.60`. We test every neighbour so a future
 *    refactor cannot silently swap `>=` for `>` and corrupt the
 *    auto-fill audit chain.
 */

describe('classifyField — ADR-034 IEEE 754 boundary discipline', () => {
  it('CONFIDENCE_AUTO_FILL is exactly 0.85', () => {
    expect(CONFIDENCE_AUTO_FILL).toBe(0.85);
  });

  it('CONFIDENCE_FLAG_FOR_REVIEW is exactly 0.60', () => {
    expect(CONFIDENCE_FLAG_FOR_REVIEW).toBe(0.6);
  });

  it('classifies 0.85 exactly as auto_fill (inclusive)', () => {
    expect(classifyField(0.85)).toBe('auto_fill');
  });

  it('classifies the next double above 0.85 as auto_fill', () => {
    expect(classifyField(0.8500000000000001)).toBe('auto_fill');
  });

  it('classifies the next double below 0.85 as flag_for_review', () => {
    expect(classifyField(0.8499999999999999)).toBe('flag_for_review');
  });

  it('classifies 0.60 exactly as flag_for_review (inclusive)', () => {
    expect(classifyField(0.6)).toBe('flag_for_review');
  });

  it('classifies the next double above 0.60 as flag_for_review', () => {
    expect(classifyField(0.6000000000000001)).toBe('flag_for_review');
  });

  it('classifies the next double below 0.60 as reject', () => {
    expect(classifyField(0.5999999999999999)).toBe('reject');
  });

  it('classifies 0.0 as reject (lowest edge)', () => {
    expect(classifyField(0)).toBe('reject');
  });

  it('classifies 1.0 as auto_fill (highest edge)', () => {
    expect(classifyField(1)).toBe('auto_fill');
  });

  it('classifies NaN as reject (outage-safe, never auto_fill)', () => {
    expect(classifyField(Number.NaN)).toBe('reject');
  });

  it('classifies negative confidence as reject', () => {
    expect(classifyField(-0.1)).toBe('reject');
  });

  it('classifies confidence > 1 as auto_fill (outage-safe — provider over-claim still gates HITL via per-field check)', () => {
    // Defensive: if a provider returns >1 it has bigger problems; the
    // classifier still gives a deterministic answer. The slice does NOT
    // re-validate the range at the classifier — that's the Zod schema's
    // job at the ingest boundary.
    expect(classifyField(1.1)).toBe('auto_fill');
  });

  it('classifies +Infinity / -Infinity as reject (Number.isFinite guard)', () => {
    expect(classifyField(Number.POSITIVE_INFINITY)).toBe('reject');
    expect(classifyField(Number.NEGATIVE_INFINITY)).toBe('reject');
  });
});
