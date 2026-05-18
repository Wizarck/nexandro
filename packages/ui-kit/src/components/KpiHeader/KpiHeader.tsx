import { cn } from '../../lib/cn';

/**
 * Owner Sunday-night KPI header — 4 cards stacked vertically on mobile,
 * 4-up on tablet/desktop. Honest about which numbers are real vs stub:
 * a `note` slot beneath each value carries the source/limitation copy
 * (per audit 2026-05-18 L1-8 + DESIGN.md §1.4 citations-as-trust).
 *
 * Renders even when data is missing — a "—" placeholder + note keeps the
 * shape stable so the page doesn't reflow as fields populate.
 */

export interface KpiCard {
  label: string;
  /** Numeric value (already in target unit). null = unknown. */
  value: number | null;
  /** EUR | percent | count — drives suffix rendering. */
  kind: 'eur' | 'percent' | 'count';
  /** Optional citation / limitation. */
  note?: string;
  /** Optional period-over-period delta in pp or €. Sign-aware colour. */
  delta?: number | null;
  /** Tooltip text on hover. */
  hint?: string;
}

export interface KpiHeaderProps {
  cards: ReadonlyArray<KpiCard>;
  loading?: boolean;
  /** Locale used to format numbers + currency (default `es-ES`). */
  locale?: string;
  className?: string;
}

export function KpiHeader({
  cards,
  loading = false,
  locale = 'es-ES',
  className,
}: KpiHeaderProps): JSX.Element {
  return (
    <section
      aria-label="KPIs del dashboard"
      className={cn(
        'mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {cards.map((c) => (
        <Card key={c.label} card={c} loading={loading} locale={locale} />
      ))}
    </section>
  );
}

function Card({
  card,
  loading,
  locale,
}: {
  card: KpiCard;
  loading: boolean;
  locale: string;
}) {
  const display = formatValue(card.value, card.kind, locale);
  const deltaDisplay = card.delta != null ? formatDelta(card.delta, card.kind, locale) : null;
  return (
    <article
      className="rounded-lg border border-border bg-surface p-4"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
      title={card.hint}
    >
      <p
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: 'var(--color-mute)' }}
      >
        {card.label}
      </p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          loading && 'animate-pulse',
        )}
        style={{
          color: card.value == null ? 'var(--color-mute)' : 'var(--color-ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {loading ? '—' : display}
      </p>
      {deltaDisplay && (
        <p
          className="mt-0.5 text-xs tabular-nums"
          style={{
            color: card.delta! >= 0 ? 'var(--color-success)' : 'var(--color-destructive)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {card.delta! >= 0 ? '↑' : '↓'} {deltaDisplay} vs período anterior
        </p>
      )}
      {card.note && (
        <p
          className="mt-1 text-[11px] leading-snug"
          style={{ color: 'var(--color-mute)' }}
        >
          {card.note}
        </p>
      )}
    </article>
  );
}

function formatValue(
  value: number | null,
  kind: KpiCard['kind'],
  locale: string,
): string {
  if (value == null) return '—';
  if (kind === 'eur') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (kind === 'percent') {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value / 100);
  }
  return new Intl.NumberFormat(locale).format(value);
}

function formatDelta(
  value: number,
  kind: KpiCard['kind'],
  locale: string,
): string {
  const abs = Math.abs(value);
  if (kind === 'percent') {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(abs)} pp`;
  }
  return formatValue(abs, kind, locale);
}
