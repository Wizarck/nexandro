export interface RecentReadingRow {
  id: string;
  /** Display value (e.g. "1.5 °C"). */
  display: string;
  /** ISO timestamp. The component renders an abbreviated locale string. */
  recordedAt: string;
  /** Display name of the actor (e.g. "Carmen"). */
  actor?: string;
  /** True when the reading was within the FSMS spec. */
  inSpec: boolean;
}

export interface RecentReadingsStripProps {
  /** May contain more than 5 rows — the component caps at 5. */
  readings: ReadonlyArray<RecentReadingRow>;
  /** Section title (defaults to "Últimas lecturas · este PCC"). */
  title?: string;
  className?: string;
}
