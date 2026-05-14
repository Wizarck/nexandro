export type CcpInputType = 'numeric' | 'checkbox' | 'multi-select';

export interface CcpSpecRange {
  /** Lower bound (inclusive). Only relevant for numeric inputType. */
  min: number;
  /** Upper bound (inclusive). Only relevant for numeric inputType. */
  max: number;
  /** Unit suffix (e.g. "°C", "%", "pH"). */
  unit: string;
}

export interface CcpLastReading {
  /** Display value (e.g. "1.5 °C"). */
  display: string;
  /** ISO timestamp of the last recorded reading. */
  recordedAt: string;
  /** Display name of the actor (e.g. "Carmen"). */
  actor?: string;
}

export interface Ccp {
  id: string;
  /** Human-readable CCP name (e.g. "Cooling curve · cámara entrante"). */
  name: string;
  /** FSMS standard reference (e.g. "FSMS-2026-v2"). */
  fsmsRef: string;
  /** Variant of the reading input. */
  inputType: CcpInputType;
  /** Spec range — only meaningful for numeric inputType. */
  spec?: CcpSpecRange;
  /** Last reading summary for the row in the open picker. */
  lastReading?: CcpLastReading;
  /** ISO timestamp; if `< now`, the CCP is overdue. */
  dueBy?: string;
}

export interface CcpPickerProps {
  ccps: ReadonlyArray<Ccp>;
  /** `null` when no CCP is picked (open list). */
  selectedId: string | null;
  /** Pass `null` to re-open the list. */
  onSelect: (id: string | null) => void;
  className?: string;
}
