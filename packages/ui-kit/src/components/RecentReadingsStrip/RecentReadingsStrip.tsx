import { cn } from '../../lib/cn';
import type {
  RecentReadingRow,
  RecentReadingsStripProps,
} from './RecentReadingsStrip.types';

const MAX_ROWS = 5;
const DEFAULT_TITLE = 'Últimas lecturas · este PCC';

/**
 * j10 region #8 — recent readings strip (slice #10 m3-haccp-ui).
 *
 * Right-sidebar strip on landscape tablet (or bottom drawer on phone).
 * Caps the visible row count at 5; oldest at bottom. Each row is
 * read-only (no click handler — j10 §Decisions "Recent readings strip
 * is read-only"). Out-of-spec rows carry both colour and glyph + text
 * label (never colour-only).
 */
export function RecentReadingsStrip({
  readings,
  title = DEFAULT_TITLE,
  className,
}: RecentReadingsStripProps) {
  const rows = readings.slice(0, MAX_ROWS);

  return (
    <aside
      className={cn('self-start rounded-md border p-4', className)}
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
      aria-label={title}
    >
      <h3
        className="m-0 mb-2 text-xs font-semibold uppercase tracking-[0.04em]"
        style={{ color: 'var(--color-mute)' }}
      >
        {title}
      </h3>
      {rows.length === 0 ? (
        <p
          className="m-0 text-sm"
          style={{ color: 'var(--color-mute)' }}
        >
          Sin lecturas recientes.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {rows.map((row) => (
            <RecentReadingRowView key={row.id} row={row} />
          ))}
        </ul>
      )}
    </aside>
  );
}

function RecentReadingRowView({ row }: { row: RecentReadingRow }) {
  return (
    <li
      data-out-of-range={row.inSpec ? 'false' : 'true'}
      className="grid items-center gap-3 border-t py-2 text-sm"
      style={{
        gridTemplateColumns: '1fr 16px auto',
        borderColor: 'var(--color-border)',
      }}
    >
      <span className="flex flex-col">
        <span
          style={{
            color: row.inSpec ? 'var(--color-ink)' : 'var(--color-destructive)',
            fontWeight: row.inSpec ? 500 : 700,
            fontVariantNumeric: 'tabular-nums lining-nums',
          }}
        >
          {row.display}
        </span>
        <span className="text-xs" style={{ color: 'var(--color-mute)' }}>
          {formatTs(row.recordedAt)}
          {row.actor ? ` · ${row.actor}` : ''}
          {row.inSpec ? '' : ' · fuera de rango'}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="text-center font-bold"
        style={{
          color: row.inSpec
            ? 'var(--color-success)'
            : 'var(--color-destructive)',
        }}
      >
        {row.inSpec ? '✓' : '⚠'}
      </span>
      <span
        className="text-xs"
        style={{ color: 'var(--color-mute)' }}
      >
        {row.inSpec ? 'En rango' : 'Fuera'}
      </span>
    </li>
  );
}

function formatTs(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.toLocaleDateString('es-ES', { weekday: 'short' })} ${hh}:${mm}`;
}
