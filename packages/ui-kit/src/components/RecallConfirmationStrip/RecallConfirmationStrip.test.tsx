import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RecallConfirmationStrip } from './RecallConfirmationStrip';

describe('RecallConfirmationStrip', () => {
  it('renders the message + confirm pill + ghost back in confirm mode', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <RecallConfirmationStrip
        mode="confirm"
        message="¿Cortar servicio en 3 locales + enviar dossier a 2 destinatarios?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(
      screen.getByText(/Cortar servicio en 3 locales/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, despachar ahora' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders the receipt headline + link in receipt mode', () => {
    const onClick = vi.fn();
    render(
      <RecallConfirmationStrip
        mode="receipt"
        message="Dossier dispatched · 02:21 CEST"
        receiptLink={{ label: 'ver dossier →', onClick }}
      />,
    );
    expect(
      screen.getByText('Dossier dispatched · 02:21 CEST'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ver dossier →' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('honours busy state by disabling the confirm + cancel buttons', () => {
    const onConfirm = vi.fn();
    render(
      <RecallConfirmationStrip
        mode="confirm"
        message="¿OK?"
        onConfirm={onConfirm}
        busy
      />,
    );
    const btn = screen.getByRole('button', { name: 'Sí, despachar ahora' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('exposes aria-live=polite on the receipt strip for screen-readers', () => {
    render(
      <RecallConfirmationStrip
        mode="receipt"
        message="Despachado."
        receiptLink={{ label: 'ver', onClick: () => undefined }}
      />,
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});
