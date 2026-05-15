import { cn } from '../../lib/cn';
import type {
  CorrectionsHistoryEntry,
  CorrectionsHistoryListProps,
} from './CorrectionsHistoryList.types';

const REASON_MAX_CHARS = 60;
const USER_ID_DISPLAY_CHARS = 8;

/**
 * j12 audit-trail sidebar for the retroactive-correction surface
 * (slice `m3.x-photo-ingest-retroactive-correction-ui`).
 *
 * Pure presentational. Renders retro-correction entries newest-first as
 * a stacked list. Each entry shows:
 *   - formatted timestamp (locale-aware, falls back to `'es-ES'`)
 *   - elided actor user id (first 8 chars + `…`)
 *   - field-delta count chip
 *   - reason snippet (truncated; full text via `title` attribute)
 *
 * Empty state: muted "Sin correcciones previas".
 */
export function CorrectionsHistoryList({
  entries,
  locale = 'es-ES',
  className,
}: CorrectionsHistoryListProps) {
  if (entries.length === 0) {
    return (
      <div
        className={cn('rounded p-3 text-sm', className)}
        style={{
          color: 'var(--color-mute)',
          backgroundColor: 'var(--color-surface-2)',
          borderColor: 'var(--color-border)',
          borderWidth: '1px',
          borderStyle: 'solid',
        }}
        data-testid="corrections-history-empty"
      >
        Sin correcciones previas
      </div>
    );
  }

  // Render newest-first. Backend stores oldest-first per ADR-APPEND-ONLY-
  // CORRECTIONS-HISTORY; we reverse for display so the most recent action
  // is at the top.
  const ordered = [...entries].reverse();
  const fmt = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <ol
      className={cn('flex flex-col gap-2', className)}
      data-testid="corrections-history-list"
      aria-label="Historial de correcciones"
    >
      {ordered.map((entry) => (
        <Entry key={entry.correctionId} entry={entry} fmt={fmt} />
      ))}
    </ol>
  );
}

function Entry({
  entry,
  fmt,
}: {
  entry: CorrectionsHistoryEntry;
  fmt: Intl.DateTimeFormat;
}) {
  const ts = (() => {
    const d = new Date(entry.correctedAt);
    return Number.isNaN(d.getTime()) ? entry.correctedAt : fmt.format(d);
  })();
  const userElided =
    entry.correctedByUserId.length > USER_ID_DISPLAY_CHARS
      ? `${entry.correctedByUserId.slice(0, USER_ID_DISPLAY_CHARS)}…`
      : entry.correctedByUserId;
  const reasonTruncated =
    entry.reason && entry.reason.length > REASON_MAX_CHARS
      ? `${entry.reason.slice(0, REASON_MAX_CHARS)}…`
      : entry.reason;
  return (
    <li
      className="rounded p-2"
      style={{
        backgroundColor: 'var(--color-surface-2)',
        borderColor: 'var(--color-border)',
        borderWidth: '1px',
        borderStyle: 'solid',
      }}
      data-testid="corrections-history-entry"
      data-correction-id={entry.correctionId}
    >
      <div className="flex items-center justify-between gap-2">
        <time
          className="text-xs"
          dateTime={entry.correctedAt}
          style={{ color: 'var(--color-mute)' }}
        >
          {ts}
        </time>
        <span
          className="text-xs"
          style={{ color: 'var(--color-mute)' }}
          title={entry.correctedByUserId}
        >
          {userElided}
        </span>
      </div>
      <div
        className="mt-1 text-xs"
        style={{ color: 'var(--color-ink)' }}
      >
        <span
          className="inline-flex items-center rounded px-1.5 py-0.5"
          style={{
            backgroundColor: 'var(--color-accent-soft, var(--color-surface-1))',
            color: 'var(--color-accent)',
            fontWeight: 500,
          }}
          aria-label={`${entry.fieldsChanged} ${
            entry.fieldsChanged === 1 ? 'campo modificado' : 'campos modificados'
          }`}
        >
          {entry.fieldsChanged}{' '}
          {entry.fieldsChanged === 1 ? 'campo' : 'campos'}
        </span>
      </div>
      {reasonTruncated && (
        <p
          className="mt-1 text-sm"
          style={{ color: 'var(--color-ink)' }}
          title={entry.reason ?? undefined}
        >
          {reasonTruncated}
        </p>
      )}
    </li>
  );
}
