import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { RetroactiveQueueRow } from './RetroactiveQueueRow';
import {
  deriveSeverity,
  type RetroactiveQueueDemoRow,
} from './RetroactiveQueueRow.types';

const baseRow: RetroactiveQueueDemoRow = {
  id: 'r-1',
  category: 'coste',
  headline: 'Aceite oliva 5L · coste +0.04 €/g',
  downstream: 'Pizza Margarita',
  signedBy: 'iker',
  signedAt: '2026-05-12T10:00:00.000Z',
  detectedRelative: 'hace 2 h',
  triggerLabel: 'extracción albarán PA-2026-887',
  impactPct: 2,
  newValueLabel: '0.34 €/g (era 0.30 €/g)',
};

describe('RetroactiveQueueRow', () => {
  it('renders amber severity for a 1-5 % cost-delta coste row + 1-click re-sign', () => {
    const onReSign = vi.fn();
    const onMaintain = vi.fn();
    const onOpenDiff = vi.fn();
    const row: RetroactiveQueueDemoRow = { ...baseRow, impactPct: 2 };

    render(
      <RetroactiveQueueRow
        row={row}
        onReSign={onReSign}
        onMaintain={onMaintain}
        onOpenDiff={onOpenDiff}
      />,
    );

    const item = screen.getByTestId('retroactive-queue-row');
    expect(item).toHaveAttribute('data-severity', 'amber');
    expect(item).toHaveAttribute('data-category', 'coste');
    expect(within(item).getByText(/Aceite oliva 5L/)).toBeInTheDocument();
    expect(within(item).getByText(/Pizza Margarita/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Re-firmar con nuevo coste/ }));
    // Below 5 % threshold → 1-click re-sign with auto-stamped reason.
    expect(onReSign).toHaveBeenCalledWith(row, 'non-material');
    expect(screen.queryByTestId('retroactive-resign-reason-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Mantener firma/ }));
    expect(onMaintain).toHaveBeenCalledWith(row);

    fireEvent.click(screen.getByRole('button', { name: /Ver diff/ }));
    expect(onOpenDiff).toHaveBeenCalledWith(row);
  });

  it('renders paprika severity for >5 % impact + opens typed-reason modal on re-sign', () => {
    const onReSign = vi.fn();
    const row: RetroactiveQueueDemoRow = { ...baseRow, impactPct: 9 };

    render(
      <RetroactiveQueueRow
        row={row}
        onReSign={onReSign}
        onMaintain={vi.fn()}
        onOpenDiff={vi.fn()}
      />,
    );

    expect(screen.getByTestId('retroactive-queue-row')).toHaveAttribute(
      'data-severity',
      'paprika',
    );

    fireEvent.click(screen.getByRole('button', { name: /Re-firmar con nuevo coste/ }));
    // Above threshold → modal opens, no re-sign fires until reason is supplied.
    expect(screen.getByTestId('retroactive-resign-reason-modal')).toBeInTheDocument();
    expect(onReSign).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Razón de la re-firma'), {
      target: { value: 'Subida histórica del 9 % validada por proveedor' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar re-firma/ }));
    expect(onReSign).toHaveBeenCalledWith(
      row,
      'Subida histórica del 9 % validada por proveedor',
    );
  });

  it('escalates allergen-relevant rows to paprika even at <1 % impact and uses the allergen CTA label', () => {
    const row: RetroactiveQueueDemoRow = {
      ...baseRow,
      category: 'allergen',
      headline: 'Alérgenos override eliminado en Salsa pomodoro',
      impactPct: 0,
      allergenRelevant: true,
      newValueLabel: 'sin override',
    };

    render(
      <RetroactiveQueueRow
        row={row}
        onReSign={vi.fn()}
        onMaintain={vi.fn()}
        onOpenDiff={vi.fn()}
      />,
    );

    const item = screen.getByTestId('retroactive-queue-row');
    expect(item).toHaveAttribute('data-severity', 'paprika');
    expect(item).toHaveAttribute('data-category', 'allergen');
    expect(
      screen.getByRole('button', { name: /Re-firmar con nueva matriz/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/relevancia alérgena/i)).toBeInTheDocument();
  });
});

describe('deriveSeverity', () => {
  it('returns mute for <1 % impact and non-allergen', () => {
    expect(deriveSeverity(0)).toBe('mute');
    expect(deriveSeverity(0.5)).toBe('mute');
  });
  it('returns amber for 1-5 % impact', () => {
    expect(deriveSeverity(1)).toBe('amber');
    expect(deriveSeverity(5)).toBe('amber');
  });
  it('returns paprika for >5 % impact OR allergen-relevant', () => {
    expect(deriveSeverity(5.1)).toBe('paprika');
    expect(deriveSeverity(0, true)).toBe('paprika');
  });
});
