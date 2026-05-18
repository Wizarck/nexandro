import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScopeCheckboxList } from './ScopeCheckboxList';
import type { Scope } from './ScopeCheckboxList.types';

const DEFAULTS: Scope = {
  haccp: true,
  lot: true,
  procurement: false,
  photo: false,
  ai_obs: false,
};

describe('ScopeCheckboxList', () => {
  it('renders 5 rows with the canonical Spanish labels + descriptions', () => {
    render(<ScopeCheckboxList value={DEFAULTS} onChange={() => {}} />);
    // Sprint 2 P1-6: full Spanish labels — no EN/ES bilingual mix.
    expect(screen.getByText(/Registros HACCP/)).toBeInTheDocument();
    expect(screen.getByText(/Ciclo de vida de lotes/)).toBeInTheDocument();
    expect(screen.getByText(/Compras/)).toBeInTheDocument();
    expect(screen.getByText(/Trazabilidad de fotos/)).toBeInTheDocument();
    expect(screen.getByText(/Métricas de IA/)).toBeInTheDocument();
  });

  it('renders the haccp + lot checkboxes checked by default', () => {
    render(<ScopeCheckboxList value={DEFAULTS} onChange={() => {}} />);
    const checkboxes = screen.getAllByRole('checkbox');
    const checkedCount = checkboxes.filter(
      (c) => (c as HTMLInputElement).checked,
    ).length;
    expect(checkedCount).toBe(2);
  });

  it('fires onChange with the mutated scope when a row is toggled', () => {
    const onChange = vi.fn();
    render(<ScopeCheckboxList value={DEFAULTS} onChange={onChange} />);
    const procurementCheckbox = screen.getByLabelText(/Compras/);
    fireEvent.click(procurementCheckbox);
    expect(onChange).toHaveBeenCalledWith({
      haccp: true,
      lot: true,
      procurement: true,
      photo: false,
      ai_obs: false,
    });
  });

  it('toggles a checked row off and emits the updated scope', () => {
    const onChange = vi.fn();
    render(<ScopeCheckboxList value={DEFAULTS} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Registros HACCP/));
    expect(onChange).toHaveBeenCalledWith({
      haccp: false,
      lot: true,
      procurement: false,
      photo: false,
      ai_obs: false,
    });
  });

  it('carries data-scope-key for each row for assertions', () => {
    const { container } = render(
      <ScopeCheckboxList value={DEFAULTS} onChange={() => {}} />,
    );
    const haccpRow = container.querySelector('[data-scope-key="haccp"]');
    expect(haccpRow?.getAttribute('data-checked')).toBe('true');
    const photoRow = container.querySelector('[data-scope-key="photo"]');
    expect(photoRow?.getAttribute('data-checked')).toBe('false');
  });
});
