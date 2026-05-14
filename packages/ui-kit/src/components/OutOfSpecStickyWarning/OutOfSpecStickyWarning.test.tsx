import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OutOfSpecStickyWarning } from './OutOfSpecStickyWarning';

describe('OutOfSpecStickyWarning', () => {
  it('renders with role=alert and the default message', () => {
    render(<OutOfSpecStickyWarning />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(
      'Lectura previa fuera de rango sin acción correctiva',
    );
  });

  it('renders a custom message when provided', () => {
    render(<OutOfSpecStickyWarning message="Una hora atrás" />);
    expect(screen.getByRole('alert').textContent).toContain('Una hora atrás');
  });

  it('renders the CTA button when ctaLabel + onSeePrior are supplied', () => {
    const onSeePrior = vi.fn();
    render(
      <OutOfSpecStickyWarning ctaLabel="Ver previa →" onSeePrior={onSeePrior} />,
    );
    const btn = screen.getByRole('button', { name: /Ver previa/ });
    fireEvent.click(btn);
    expect(onSeePrior).toHaveBeenCalled();
  });

  it('hides the CTA button when ctaLabel is omitted', () => {
    render(<OutOfSpecStickyWarning onSeePrior={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
