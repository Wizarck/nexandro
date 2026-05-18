import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RetroactiveBadge } from './RetroactiveBadge';

describe('RetroactiveBadge', () => {
  it('renders an active pill linking to /m3/review-queue when count > 0', () => {
    render(<RetroactiveBadge count={3} />);
    const link = screen.getByRole('status');
    expect(link).toHaveAttribute('href', '/m3/review-queue');
    expect(link).toHaveAttribute('data-state', 'active');
    expect(link).toHaveTextContent(/Cambios retroactivos/);
    expect(link).toHaveTextContent(/3 pendientes/);
    expect(link).toHaveAccessibleName(/Cambios retroactivos: 3 pendientes/);
  });

  it('renders the always-on zero-state pill when count === 0 and zeroState defaults to "show"', () => {
    render(<RetroactiveBadge count={0} weeklyTotal={5} />);
    const link = screen.getByRole('status');
    expect(link).toHaveAttribute('data-state', 'zero');
    expect(link).toHaveTextContent(/0 \/ 5 esta semana/);
  });

  it('renders null when count === 0 and zeroState="hide"', () => {
    const { container } = render(
      <RetroactiveBadge count={0} zeroState="hide" />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('links to /m3/review-queue and exposes the venue chip when supplied', () => {
    render(
      <RetroactiveBadge count={2} venue="Palafito Madrid" />,
    );
    const link = screen.getByRole('status');
    expect(link).toHaveAttribute('href', '/m3/review-queue');
    expect(link).toHaveTextContent('Palafito Madrid');
    expect(link).toHaveAccessibleName(/en Palafito Madrid/);
  });
});
