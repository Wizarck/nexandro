export interface CorrectiveActionOption {
  id: string;
  /** Short label shown in the dropdown. */
  label: string;
}

export interface CorrectiveActionPickerProps {
  /** Pre-defined corrective actions per FSMS standard config. */
  actions: ReadonlyArray<CorrectiveActionOption>;
  /** Currently-selected action id, or `null` when none picked. */
  selectedActionId: string | null;
  onSelectAction: (id: string | null) => void;
  /** Free-form notes textarea content (optional context). */
  notes: string;
  onChangeNotes: (notes: string) => void;
  /**
   * Indicates whether the override-without-corrective option is
   * unfolded in the UI. In this slice the override is rendered inert
   * (toggle expands, radio is non-submittable) per ADR-J10-CORRECTIVE-
   * ACTION-IS-A-GATE; full Owner-approval flow is M3.x.
   */
  overrideOpen?: boolean;
  onToggleOverride?: (open: boolean) => void;
  className?: string;
}
