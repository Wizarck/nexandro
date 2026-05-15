import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { M3AggregateTypeChip } from './M3AggregateTypeChip';

describe('M3AggregateTypeChip', () => {
  it('renders the invoice variant with data-kind and accessible name', () => {
    render(<M3AggregateTypeChip kind="invoice" />);
    const chip = screen.getByLabelText('Tipo: invoice');
    expect(chip.getAttribute('data-kind')).toBe('invoice');
    expect(chip.textContent).toContain('invoice');
  });

  it('renders the product variant', () => {
    render(<M3AggregateTypeChip kind="product" />);
    const chip = screen.getByLabelText('Tipo: product');
    expect(chip.getAttribute('data-kind')).toBe('product');
    expect(chip.textContent).toContain('product');
  });

  it('forwards className overrides', () => {
    render(<M3AggregateTypeChip kind="invoice" className="ml-2" />);
    const chip = screen.getByLabelText('Tipo: invoice');
    expect(chip.className).toContain('ml-2');
  });
});
