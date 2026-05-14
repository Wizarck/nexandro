import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RecallActionBar } from './RecallActionBar';

describe('RecallActionBar', () => {
  it('renders the CTA label and fires onActivate on click', () => {
    const onActivate = vi.fn();
    render(
      <RecallActionBar
        label="Detener servicio + Generar dossier"
        onActivate={onActivate}
      />,
    );
    const btn = screen.getByRole('button', {
      name: 'Detener servicio + Generar dossier',
    });
    fireEvent.click(btn);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('renders the eyebrow when supplied', () => {
    render(
      <RecallActionBar
        label="Despachar"
        onActivate={() => undefined}
        eyebrow="01:30 restante"
      />,
    );
    expect(screen.getByText('01:30 restante')).toBeInTheDocument();
  });

  it('disabled state prevents activation', () => {
    const onActivate = vi.fn();
    render(
      <RecallActionBar label="Despachar" onActivate={onActivate} disabled />,
    );
    const btn = screen.getByRole('button', { name: 'Despachar' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('renders children below the CTA (used for the confirmation strip)', () => {
    render(
      <RecallActionBar label="Despachar" onActivate={() => undefined}>
        <div data-testid="confirm-strip">strip</div>
      </RecallActionBar>,
    );
    expect(screen.getByTestId('confirm-strip')).toBeInTheDocument();
  });
});
