import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BadgeChip } from './BadgeChip';
import type { BadgeChipVariant } from './BadgeChip.types';

const ALL_VARIANTS: BadgeChipVariant[] = [
  'info',
  'warn',
  'error',
  'fatal',
  'p1',
  'p2',
  'p3',
  'neutral',
];

describe('BadgeChip', () => {
  it.each(ALL_VARIANTS)('renders variant=%s with role="status"', (variant) => {
    render(<BadgeChip variant={variant}>{variant}</BadgeChip>);
    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('data-variant', variant);
    expect(badge).toHaveTextContent(variant);
  });

  it('renders children as accessible name when aria-label is omitted', () => {
    render(<BadgeChip variant="warn">Warn · 70 %</BadgeChip>);
    expect(screen.getByRole('status')).toHaveTextContent('Warn · 70 %');
  });

  it('honours explicit aria-label', () => {
    render(
      <BadgeChip variant="fatal" aria-label="Presupuesto agotado">
        Fatal
      </BadgeChip>,
    );
    expect(screen.getByRole('status')).toHaveAccessibleName('Presupuesto agotado');
  });

  it('forwards className for layout overrides', () => {
    const { container } = render(
      <BadgeChip variant="info" className="ml-4">
        Info
      </BadgeChip>,
    );
    expect(container.querySelector('[role="status"]')?.className).toMatch(/ml-4/);
  });

  it('fatal variant uses destructive background (colour + text combination)', () => {
    render(<BadgeChip variant="fatal">Fatal</BadgeChip>);
    const badge = screen.getByRole('status');
    expect(badge.style.backgroundColor).toContain('var(--color-destructive)');
    // Text content is the differentiator, not just colour.
    expect(badge).toHaveTextContent('Fatal');
  });
});
