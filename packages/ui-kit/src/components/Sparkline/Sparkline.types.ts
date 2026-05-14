export interface SparklinePoint {
  /** Position along the x-axis (0..N-1). */
  index: number;
  /** Value at this point. Must be ≥ 0; values > `maxValue` are clamped. */
  value: number;
}

export interface SparklinePeak {
  index: number;
  value: number;
}

export interface SparklineProps {
  /** Ordered series. Empty array renders an empty `<svg>` (still a valid img). */
  data: SparklinePoint[];
  /** Maximum value used for normalising the path; defaults to max(data.value). */
  maxValue?: number;
  /** Optional gridline at this value (e.g. 0.01 = 1 % threshold). */
  threshold?: number;
  /** Highlight peak with a marker. */
  peak?: SparklinePeak | null;
  /** Required for screen-readers; describe the trend + peak. */
  ariaLabel: string;
  /** Tailwind class overrides. */
  className?: string;
}
