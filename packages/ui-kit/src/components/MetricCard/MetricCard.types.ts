import type { ReactNode } from 'react';

export interface MetricCardProps {
  /** Uppercase small caption above the headline. */
  eyebrow: string;
  /** Primary value or status indicator. */
  headline?: ReactNode;
  /** Secondary line below the headline. */
  sub?: ReactNode;
  /** Optional body / children rendered below sub. */
  children?: ReactNode;
  /** When true, spans the full grid width (j8 mock wide widgets). */
  wide?: boolean;
  /** Optional footer (e.g. last-refreshed badge). */
  footer?: ReactNode;
  /** Optional manual refresh button rendered next to the footer. */
  refreshButton?: {
    onClick: () => void;
    label: string;
  };
  /** Region role aria-label (defaults to eyebrow). */
  'aria-label'?: string;
  className?: string;
}
