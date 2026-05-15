import { cn } from '../../lib/cn';
import { ConfidenceBandBadge } from '../ConfidenceBandBadge';
import { M3AggregateTypeChip } from '../M3AggregateTypeChip';
import type { HitlQueueListProps, HitlQueueRow } from './HitlQueueList.types';

/**
 * j12 HitlQueueList (slice #17b m3-photo-ingest-review-ui).
 *
 * Vertical list of items awaiting review (j12 region #2). Each row =
 * 64×64 thumbnail + `M3AggregateTypeChip` + supplier/product hint +
 * time-since-upload + `ConfidenceBandBadge`. Selected row carries an
 * `--accent` left rule + `data-selected="true"`. Bottom row: ghost
 * `+ Subir foto` CTA.
 *
 * The CTA at the bottom (not the top) is per j12 §Decisions: queue is
 * primary, uploading is secondary.
 */
function timeAgo(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

export function HitlQueueList({
  rows,
  selectedItemId,
  onSelect,
  onUploadClick,
  now,
  className,
}: HitlQueueListProps) {
  const nowMs = now ?? Date.now();
  return (
    <div
      role="region"
      aria-label="Cola de revisión HITL"
      className={cn('flex flex-col', className)}
    >
      {rows.length === 0 && (
        <div
          className="rounded-md border border-dashed p-4 text-sm"
          style={{
            color: 'var(--color-mute)',
            borderColor: 'var(--color-border)',
          }}
        >
          No hay elementos pendientes de revisión.
        </div>
      )}

      <ul className="flex flex-col gap-2" aria-label="Elementos de cola">
        {rows.map((row) => (
          <li key={row.itemId}>
            <QueueRowButton
              row={row}
              selected={row.itemId === selectedItemId}
              now={nowMs}
              onSelect={() => onSelect(row.itemId)}
            />
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onUploadClick}
        className="mt-3 rounded-md border bg-transparent px-3 py-2 text-sm"
        style={{
          color: 'var(--color-mute)',
          borderColor: 'var(--color-border)',
        }}
      >
        + Subir foto
      </button>
    </div>
  );
}

function QueueRowButton({
  row,
  selected,
  now,
  onSelect,
}: {
  row: HitlQueueRow;
  selected: boolean;
  now: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-selected={selected ? 'true' : 'false'}
      aria-pressed={selected}
      className="flex w-full items-start gap-3 rounded-md border p-2 text-left"
      style={{
        backgroundColor: selected
          ? 'var(--color-accent-soft)'
          : 'var(--color-surface)',
        borderColor: selected
          ? 'var(--color-accent)'
          : 'var(--color-border)',
        borderLeftWidth: selected ? '4px' : '1px',
        borderLeftColor: selected ? 'var(--color-accent)' : 'var(--color-border)',
      }}
    >
      <div
        aria-hidden="true"
        className="overflow-hidden rounded"
        style={{
          width: '64px',
          height: '64px',
          backgroundColor: 'var(--color-surface-2)',
          borderColor: 'var(--color-border)',
          borderWidth: '1px',
          borderStyle: 'solid',
          flexShrink: 0,
        }}
      >
        {row.thumbnailUrl && (
          <img
            src={row.thumbnailUrl}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <M3AggregateTypeChip kind={row.kind} />
          <span
            className="text-xs"
            style={{ color: 'var(--color-mute)' }}
          >
            hace {timeAgo(row.uploadedAt, now)}
          </span>
        </div>
        <span
          className="truncate text-sm font-medium"
          style={{ color: 'var(--color-ink)' }}
        >
          {row.hint}
        </span>
        <div>
          <ConfidenceBandBadge confidence={row.overallConfidence} />
        </div>
      </div>
    </button>
  );
}
