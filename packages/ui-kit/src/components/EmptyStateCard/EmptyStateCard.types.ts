export interface EmptyStateCardProps {
  /** Headline copy (e.g. "Sin actividad en los últimos 30 días"). */
  title: string;
  /** Body copy explaining the empty state + next step. */
  body?: string;
  /** Optional CTA link target (e.g. "/owner-settings#ai-providers"). */
  ctaHref?: string;
  /** Optional CTA link text. */
  ctaLabel?: string;
  className?: string;
}
