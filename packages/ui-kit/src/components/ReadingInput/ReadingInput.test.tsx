import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReadingInput } from './ReadingInput';

describe('ReadingInput', () => {
  describe('numeric variant', () => {
    it('fires onChange with the typed string', () => {
      const onChange = vi.fn();
      render(
        <ReadingInput
          inputType="numeric"
          value=""
          onChange={onChange}
          unit="°C"
          aria-label="Valor de la lectura"
        />,
      );
      const input = screen.getByLabelText('Valor de la lectura') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '1.2' } });
      expect(onChange).toHaveBeenCalledWith('1.2');
    });

    it('renders the unit suffix', () => {
      render(
        <ReadingInput
          inputType="numeric"
          value="1.2"
          onChange={() => {}}
          unit="°C"
          aria-label="Lectura"
        />,
      );
      expect(screen.getByText('°C')).toBeInTheDocument();
    });
  });

  describe('checkbox variant', () => {
    it('fires onChange(true) when Limpio is clicked', () => {
      const onChange = vi.fn();
      render(
        <ReadingInput inputType="checkbox" value={false} onChange={onChange} />,
      );
      fireEvent.click(screen.getByText('Limpio'));
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('fires onChange(false) when No limpio is clicked', () => {
      const onChange = vi.fn();
      render(
        <ReadingInput inputType="checkbox" value={true} onChange={onChange} />,
      );
      fireEvent.click(screen.getByText('No limpio'));
      expect(onChange).toHaveBeenCalledWith(false);
    });

    it('reflects current value via aria-pressed', () => {
      render(
        <ReadingInput inputType="checkbox" value={true} onChange={() => {}} />,
      );
      expect(screen.getByText('Limpio').getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByText('No limpio').getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('multi-select variant', () => {
    const OPTIONS = [
      { id: 'gluten', label: 'Gluten' },
      { id: 'leche', label: 'Leche' },
    ];

    it('toggles an option into the array on click', () => {
      const onChange = vi.fn();
      render(
        <ReadingInput
          inputType="multi-select"
          value={['gluten']}
          options={OPTIONS}
          onChange={onChange}
        />,
      );
      fireEvent.click(screen.getByText('Leche'));
      expect(onChange).toHaveBeenCalledWith(['gluten', 'leche']);
    });

    it('removes an option from the array on second click', () => {
      const onChange = vi.fn();
      render(
        <ReadingInput
          inputType="multi-select"
          value={['gluten', 'leche']}
          options={OPTIONS}
          onChange={onChange}
        />,
      );
      fireEvent.click(screen.getByText('Gluten'));
      expect(onChange).toHaveBeenCalledWith(['leche']);
    });
  });
});
