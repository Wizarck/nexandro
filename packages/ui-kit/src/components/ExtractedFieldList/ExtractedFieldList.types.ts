export interface ExtractedField {
  /** Stable identifier used for hover wiring and onFieldChange callbacks. */
  fieldName: string;
  label: string;
  /** The vision-LLM's original extraction (immutable; for forensic). */
  extractedValue: string;
  /** The operator's current value (mutable in this component). */
  operatorValue: string;
  /** Per-field confidence in [0, 1]. */
  confidence: number;
}

export interface ExtractedFieldListProps {
  fields: ReadonlyArray<ExtractedField>;
  onFieldChange: (fieldName: string, value: string) => void;
  /**
   * Field name to highlight (e.g. when its bounding box is hovered).
   * Lifted state per ADR-J12-RECIPROCAL-LINK-CLIENT-SIDE.
   */
  highlightedField?: string | null;
  onFieldHover?: (fieldName: string | null) => void;
  className?: string;
}
