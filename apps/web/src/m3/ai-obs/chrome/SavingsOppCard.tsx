import type { SavingsOpportunity } from '../api/aiObs.types';
import { formatEur, formatPctInt } from '../lib/format';

interface SavingsOppCardProps {
  opportunity: SavingsOpportunity | null;
}

/**
 * j8 chrome #2 — savings opportunity card. Conditional render. Per
 * the j8 mock, accent-soft background + 3px accent left border.
 */
export function SavingsOppCard({ opportunity }: SavingsOppCardProps) {
  if (!opportunity) return null;
  return (
    <div
      role="region"
      aria-label="Oportunidad de ahorro"
      className="rounded-lg border border-(--color-accent) p-3"
      style={{
        background: 'var(--color-accent-soft)',
        borderLeft: '3px solid var(--color-accent)',
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        <span
          className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            background: 'var(--color-accent-press)',
            color: 'var(--color-accent-fg)',
          }}
        >
          Ahorro
        </span>
        <strong className="text-sm tabular-nums">
          ~ {formatEur(opportunity.expectedSavingsEur)} / mes
        </strong>
      </div>
      <div className="text-xs text-(--color-mute)" style={{ color: 'var(--color-mute)' }}>
        Mover <code className="font-mono text-xs">{opportunity.capability}</code> de{' '}
        <code className="font-mono text-xs">{opportunity.fromModel}</code> a{' '}
        <code className="font-mono text-xs">{opportunity.toModel}</code> → mismo
        accuracy, -{formatPctInt(opportunity.expectedSavingsPct)} coste.
      </div>
    </div>
  );
}
