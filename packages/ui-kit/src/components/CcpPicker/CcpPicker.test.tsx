import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CcpPicker } from './CcpPicker';
import type { Ccp } from './CcpPicker.types';

const NOW = Date.now();
const CCPS: Ccp[] = [
  {
    id: 'ccp-1',
    name: 'Cooling curve · cámara entrante',
    fsmsRef: 'FSMS-2026-v2',
    inputType: 'numeric',
    spec: { min: -2, max: 2, unit: '°C' },
    lastReading: { display: '1.5 °C', recordedAt: '2026-05-13T15:28:00Z', actor: 'Carmen' },
    dueBy: new Date(NOW + 30 * 60_000).toISOString(),
  },
  {
    id: 'ccp-2',
    name: 'Hot-hold ensalada',
    fsmsRef: 'FSMS-2026-v2',
    inputType: 'numeric',
    spec: { min: 60, max: 75, unit: '°C' },
    dueBy: new Date(NOW - 5 * 60_000).toISOString(),
  },
];

describe('CcpPicker', () => {
  it('renders all CCPs in the open state', () => {
    render(<CcpPicker ccps={CCPS} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText('Cooling curve · cámara entrante')).toBeInTheDocument();
    expect(screen.getByText('Hot-hold ensalada')).toBeInTheDocument();
  });

  it('fires onSelect with the CCP id when a row is clicked', () => {
    const onSelect = vi.fn();
    render(<CcpPicker ccps={CCPS} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Cooling curve · cámara entrante'));
    expect(onSelect).toHaveBeenCalledWith('ccp-1');
  });

  it('renders the collapsed state with cambiar when a CCP is selected', () => {
    render(<CcpPicker ccps={CCPS} selectedId="ccp-1" onSelect={() => {}} />);
    expect(screen.getByText('Cooling curve · cámara entrante')).toBeInTheDocument();
    expect(screen.getByText(/cambiar/)).toBeInTheDocument();
  });

  it('cambiar button fires onSelect(null) to re-open the list', () => {
    const onSelect = vi.fn();
    render(<CcpPicker ccps={CCPS} selectedId="ccp-1" onSelect={onSelect} />);
    fireEvent.click(screen.getByText(/cambiar/));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('marks overdue CCPs with data-overdue=true', () => {
    render(<CcpPicker ccps={CCPS} selectedId={null} onSelect={() => {}} />);
    const overdueRow = screen
      .getByText('Hot-hold ensalada')
      .closest('button');
    expect(overdueRow?.getAttribute('data-overdue')).toBe('true');
  });

  it('renders a Vence en chip on a non-overdue CCP', () => {
    render(<CcpPicker ccps={CCPS} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText(/Vence en/)).toBeInTheDocument();
  });
});
