export interface ChronologyRailEntry {
  /** Stable id (typically the audit_log row id). */
  id: string;
  /** Persisted UPPER_SNAKE_CASE event_type. */
  eventType: string;
  /** Human-readable label (e.g. `Investigación iniciada`). Falls back to eventType. */
  label?: string;
  /** ISO timestamp from audit_log. */
  createdAt: string;
  /** Optional actor identifier for the row eyebrow. */
  actor?: string | null;
  /** Optional snippet (mute text below the label). */
  snippet?: string | null;
}

export interface IncidentChronologyRailProps {
  entries: ChronologyRailEntry[];
  /** When true the rail renders as a bottom drawer (phone); else a sidebar (laptop). */
  drawer?: boolean;
  /** Visible title at the top of the rail. */
  title?: string;
  className?: string;
}
