export interface HeatmapProps {
  /** Row count (e.g. 7 for days of week). */
  rows: number;
  /** Column count (e.g. 24 for hours of day). */
  cols: number;
  /** Row labels, length === rows. */
  rowLabels: string[];
  /** Column labels, length === cols. */
  colLabels: string[];
  /** Matrix cells[row][col] = numeric value. */
  cells: number[][];
  /** Maximum value across all cells; drives the OKLCH lightness bucketing. */
  max: number;
  /**
   * Compute the aria-label per cell. Required for screen-readers.
   * Receives (rowIndex, colIndex, value).
   */
  cellAriaLabel: (row: number, col: number, value: number) => string;
  /** Optional click handler; activates on click and keyboard Space/Enter. */
  onCellClick?: (row: number, col: number, value: number) => void;
  /** Tailwind class overrides. */
  className?: string;
}
