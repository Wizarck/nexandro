import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { IncidentSearchField } from './IncidentSearchField';
import type { IncidentSearchHit } from './IncidentSearchField.types';

const HITS: IncidentSearchHit[] = [
  {
    kind: 'lot',
    id: '550e8400-e29b-41d4-a716-446655440000',
    label: 'LOT-A',
    supportingText: 'Recibido 2026-05-13',
    receivedAt: '2026-05-13T10:00:00Z',
    symptomMatchScore: 0.5,
  },
  {
    kind: 'supplier',
    id: '550e8400-e29b-41d4-a716-446655440001',
    label: 'Pescados Alborada',
    supportingText: 'ES',
    receivedAt: null,
    symptomMatchScore: 0,
  },
];

describe('IncidentSearchField', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders combobox closed by default (no focus)', () => {
    render(
      <IncidentSearchField hits={[]} onSearch={vi.fn()} onSelect={vi.fn()} />,
    );
    const combobox = screen.getByRole('combobox');
    // autoFocus may open it on initial render; blur first.
    fireEvent.blur(combobox);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
  });

  it('debounces onSearch by 200ms', () => {
    const onSearch = vi.fn();
    render(
      <IncidentSearchField
        hits={[]}
        onSearch={onSearch}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'tom' },
    });
    expect(onSearch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onSearch).toHaveBeenCalledWith('tom');
  });

  it('trims whitespace before firing onSearch', () => {
    const onSearch = vi.fn();
    render(
      <IncidentSearchField
        hits={[]}
        onSearch={onSearch}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '  pescado  ' },
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onSearch).toHaveBeenCalledWith('pescado');
  });

  it('keyboard nav: ArrowDown then Enter selects first hit', () => {
    const onSelect = vi.fn();
    render(
      <IncidentSearchField
        hits={HITS}
        onSearch={vi.fn()}
        onSelect={onSelect}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: HITS[0].id }),
    );
  });

  it('keyboard nav: ArrowDown twice + Enter selects second hit', () => {
    const onSelect = vi.fn();
    render(
      <IncidentSearchField
        hits={HITS}
        onSearch={vi.fn()}
        onSelect={onSelect}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: HITS[1].id }),
    );
  });

  it('mouse click on a hit row fires onSelect', () => {
    const onSelect = vi.fn();
    render(
      <IncidentSearchField
        hits={HITS}
        onSearch={vi.fn()}
        onSelect={onSelect}
      />,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.mouseDown(screen.getByText('LOT-A'));
    fireEvent.click(screen.getByText('LOT-A'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: HITS[0].id }),
    );
  });

  it('Escape closes the listbox', () => {
    render(
      <IncidentSearchField
        hits={HITS}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders the empty-state copy when hits is empty', () => {
    render(
      <IncidentSearchField
        hits={[]}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        emptyStateCopy="Sin coincidencias"
      />,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.getByText('Sin coincidencias')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(
      <IncidentSearchField
        hits={[]}
        loading
        onSearch={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.getByText('Buscando…')).toBeInTheDocument();
  });

  it('renders hit kind label badge in Spanish', () => {
    render(
      <IncidentSearchField
        hits={HITS}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.getByText('lote')).toBeInTheDocument();
    expect(screen.getByText('proveedor')).toBeInTheDocument();
  });

  it('controlled value prop syncs internal state', () => {
    const { rerender } = render(
      <IncidentSearchField
        hits={[]}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        value="alborada"
      />,
    );
    expect(screen.getByRole('combobox')).toHaveValue('alborada');
    rerender(
      <IncidentSearchField
        hits={[]}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        value="pescado"
      />,
    );
    expect(screen.getByRole('combobox')).toHaveValue('pescado');
  });

  it('forwards aria-label override', () => {
    render(
      <IncidentSearchField
        hits={[]}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        aria-label="Recall investigation search"
      />,
    );
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-label',
      'Recall investigation search',
    );
  });
});
