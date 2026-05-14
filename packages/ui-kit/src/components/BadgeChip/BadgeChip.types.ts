import type { ReactNode } from 'react';

export type BadgeChipVariant =
  | 'info'
  | 'warn'
  | 'error'
  | 'fatal'
  | 'p1'
  | 'p2'
  | 'p3'
  | 'neutral';

export interface BadgeChipProps {
  variant: BadgeChipVariant;
  children: ReactNode;
  /** Optional override; defaults to text content. */
  'aria-label'?: string;
  className?: string;
}
