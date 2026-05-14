import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentReadingsStrip } from './RecentReadingsStrip';
import type { RecentReadingRow } from './RecentReadingsStrip.types';

function row(id: string, display: string, inSpec: boolean): RecentReadingRow {
  return {
    id,
    display,
    recordedAt: '2026-05-13T15:28:00Z',
    actor: 'Carmen',
    inSpec,
  };
}

describe('RecentReadingsStrip', () => {
  it('caps the visible rows at 5 even if more are passed in', () => {
    const readings: RecentReadingRow[] = Array.from({ length: 8 }).map(
      (_, i) => row(`r-${i}`, `${i + 1} °C`, true),
    );
    render(<RecentReadingsStrip readings={readings} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(5);
  });

  it('marks out-of-spec rows with data-out-of-range=true and the ⚠ glyph', () => {
    const readings: RecentReadingRow[] = [row('r-1', '3.2 °C', false)];
    render(<RecentReadingsStrip readings={readings} />);
    const r = screen.getAllByRole('listitem')[0];
    expect(r.getAttribute('data-out-of-range')).toBe('true');
    expect(r.textContent).toContain('⚠');
    expect(r.textContent).toContain('fuera de rango');
  });

  it('marks in-spec rows with data-out-of-range=false and the ✓ glyph', () => {
    const readings: RecentReadingRow[] = [row('r-1', '1.5 °C', true)];
    render(<RecentReadingsStrip readings={readings} />);
    const r = screen.getAllByRole('listitem')[0];
    expect(r.getAttribute('data-out-of-range')).toBe('false');
    expect(r.textContent).toContain('✓');
  });

  it('renders an empty-state copy when no readings are available', () => {
    render(<RecentReadingsStrip readings={[]} />);
    expect(screen.getByText('Sin lecturas recientes.')).toBeInTheDocument();
  });

  it('renders a custom title when provided', () => {
    render(
      <RecentReadingsStrip
        readings={[row('r-1', '1.5 °C', true)]}
        title="Mis lecturas"
      />,
    );
    expect(screen.getByText('Mis lecturas')).toBeInTheDocument();
  });
});
