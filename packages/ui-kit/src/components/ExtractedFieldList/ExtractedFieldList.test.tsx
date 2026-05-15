import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExtractedFieldList } from './ExtractedFieldList';
import type { ExtractedField } from './ExtractedFieldList.types';

const SAMPLE_FIELDS: ExtractedField[] = [
  {
    fieldName: 'supplier',
    label: 'Proveedor',
    extractedValue: 'Mercabarna',
    operatorValue: 'Mercabarna',
    confidence: 0.91,
  },
  {
    fieldName: 'line1_price',
    label: 'Línea 1 — precio unit',
    extractedValue: '12,40',
    operatorValue: '12,40',
    confidence: 0.74,
  },
  {
    fieldName: 'total',
    label: 'Total',
    extractedValue: '',
    operatorValue: '',
    confidence: 0.42,
  },
];

describe('ExtractedFieldList', () => {
  it('renders all fields with their derived band', () => {
    render(
      <ExtractedFieldList fields={SAMPLE_FIELDS} onFieldChange={vi.fn()} />,
    );
    const rows = document.querySelectorAll('li[data-field-name]');
    expect(rows.length).toBe(3);
    const supplierRow = Array.from(rows).find(
      (r) => r.getAttribute('data-field-name') === 'supplier',
    );
    expect(supplierRow?.getAttribute('data-band')).toBe('auto_fill');
    const totalRow = Array.from(rows).find(
      (r) => r.getAttribute('data-field-name') === 'total',
    );
    expect(totalRow?.getAttribute('data-band')).toBe('reject');
  });

  it('renders the reject-band Manual eyebrow on rejected fields', () => {
    render(
      <ExtractedFieldList fields={SAMPLE_FIELDS} onFieldChange={vi.fn()} />,
    );
    expect(
      screen.getByText('Manual · campo requerido (extracción rechazada)'),
    ).toBeInTheDocument();
  });

  it('reject-band input carries destructive border + aria-required', () => {
    render(
      <ExtractedFieldList fields={SAMPLE_FIELDS} onFieldChange={vi.fn()} />,
    );
    const input = screen.getByLabelText('Total');
    expect(input.getAttribute('aria-required')).toBe('true');
    const style = (input as HTMLInputElement).style.borderColor;
    expect(style).toContain('var(--color-destructive)');
  });

  it('fires onFieldChange when the operator types', () => {
    const onFieldChange = vi.fn();
    render(
      <ExtractedFieldList
        fields={SAMPLE_FIELDS}
        onFieldChange={onFieldChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Total'), {
      target: { value: '142,80' },
    });
    expect(onFieldChange).toHaveBeenCalledWith('total', '142,80');
  });

  it('converts the badge to "editado por operador" once operatorValue diverges from extractedValue', () => {
    const edited: ExtractedField[] = [
      {
        fieldName: 'supplier',
        label: 'Proveedor',
        extractedValue: 'Mercabarna',
        operatorValue: 'Mercabarna SL',
        confidence: 0.91,
      },
    ];
    render(<ExtractedFieldList fields={edited} onFieldChange={vi.fn()} />);
    expect(screen.getByText('editado por operador')).toBeInTheDocument();
  });

  it('marks the highlighted field row via data-highlighted', () => {
    render(
      <ExtractedFieldList
        fields={SAMPLE_FIELDS}
        onFieldChange={vi.fn()}
        highlightedField="line1_price"
      />,
    );
    const row = document.querySelector('li[data-field-name="line1_price"]');
    expect(row?.getAttribute('data-highlighted')).toBe('true');
  });

  it('fires onFieldHover on pointer enter and onFieldHover(null) on pointer leave', () => {
    const onFieldHover = vi.fn();
    render(
      <ExtractedFieldList
        fields={SAMPLE_FIELDS}
        onFieldChange={vi.fn()}
        onFieldHover={onFieldHover}
      />,
    );
    const row = document.querySelector(
      'li[data-field-name="supplier"]',
    ) as HTMLElement;
    fireEvent.pointerEnter(row);
    expect(onFieldHover).toHaveBeenCalledWith('supplier');
    fireEvent.pointerLeave(row);
    expect(onFieldHover).toHaveBeenCalledWith(null);
  });

  // m3.x-photo-ingest-retroactive-correction-ui — readOnly variant for the
  // j12 retro surface. Renders signed-item operator values without inputs
  // so the operator must explicitly opt into editable retro mode.
  it('readOnly hides <input> and renders values in a static aria-readonly element', () => {
    render(
      <ExtractedFieldList
        fields={SAMPLE_FIELDS}
        onFieldChange={vi.fn()}
        readOnly
      />,
    );
    expect(document.querySelectorAll('input').length).toBe(0);
    const supplier = screen.getByLabelText('Proveedor');
    expect(supplier.tagName).toBe('DIV');
    expect(supplier.getAttribute('aria-readonly')).toBe('true');
    expect(supplier).toHaveTextContent('Mercabarna');
    expect(
      document
        .querySelector('ul[aria-label="Campos extraídos"]')
        ?.getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('readOnly preserves the highlight state forwarded from the parent', () => {
    render(
      <ExtractedFieldList
        fields={SAMPLE_FIELDS}
        onFieldChange={vi.fn()}
        highlightedField="supplier"
        readOnly
      />,
    );
    const row = document.querySelector('li[data-field-name="supplier"]');
    expect(row?.getAttribute('data-highlighted')).toBe('true');
  });
});
