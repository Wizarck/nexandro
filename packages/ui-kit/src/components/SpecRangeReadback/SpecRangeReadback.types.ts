export type SpecRangeStatus = 'idle' | 'in-spec' | 'out-of-spec';

export interface SpecRangeReadbackProps {
  /** Lower bound of the spec range, inclusive. */
  specMin: number;
  /** Upper bound of the spec range, inclusive. */
  specMax: number;
  /**
   * Current input value as a string (the raw value typed by the operator).
   * Non-parseable strings (empty, NaN) render the `idle` state.
   */
  currentValue: string;
  /** Unit suffix (e.g. "°C"). */
  unit: string;
  className?: string;
}
