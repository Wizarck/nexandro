export interface CorrectionsHistoryEntry {
  /** Stable UUID assigned by the service. Used as React key. */
  correctionId: string;
  /** ISO-8601 UTC timestamp. */
  correctedAt: string;
  /** UUID of the user who applied the correction. Elided in the UI. */
  correctedByUserId: string;
  /** Optional rationale, ≤500 chars. Truncated in the summary view. */
  reason: string | null;
  /**
   * Count of fields whose `operatorValue` changed in this correction
   * (i.e. differs from the next-newer entry's snapshot, or — for the
   * newest entry — from the current item state). The caller derives this
   * count; the component just renders it.
   */
  fieldsChanged: number;
}

export interface CorrectionsHistoryListProps {
  /** Entries oldest-first per the backend column order. */
  entries: ReadonlyArray<CorrectionsHistoryEntry>;
  /** Optional locale for `Intl.DateTimeFormat` — defaults to `'es-ES'`. */
  locale?: string;
  className?: string;
}
