import { cn } from '../../lib/cn';
import type {
  M3AggregateKind,
  M3AggregateTypeChipProps,
} from './M3AggregateTypeChip.types';

/**
 * j12 M3AggregateTypeChip (slice #17b m3-photo-ingest-review-ui).
 *
 * Tiny chip showing `invoice` vs `product` aggregate kind. Reused both
 * inside `HitlQueueList` rows AND in the queue filter chip group. Per
 * the project palette + DESIGN.md, dot + colour + text — never colour-
 * only.
 */
const KIND_LABELS: Readonly<Record<M3AggregateKind, string>> = {
  invoice: 'invoice',
  product: 'product',
};

const KIND_DOT_COLOURS: Readonly<Record<M3AggregateKind, string>> = {
  invoice: 'var(--color-accent)',
  product: 'var(--color-status-on-target-fg)',
};

export function M3AggregateTypeChip({
  kind,
  className,
}: M3AggregateTypeChipProps) {
  const label = KIND_LABELS[kind];
  const dot = KIND_DOT_COLOURS[kind];
  return (
    <span
      aria-label={`Tipo: ${label}`}
      data-kind={kind}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-xs',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-mute)',
        borderColor: 'var(--color-border)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '999px',
          backgroundColor: dot,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}
