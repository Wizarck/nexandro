import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorRateWidget } from './ErrorRateWidget';

const updated = Date.now();

describe('ErrorRateWidget', () => {
  it('renders green semaphore + ✓ glyph for value < 1 %', () => {
    render(
      <ErrorRateWidget
        data={{ value: 0.004, series: [{ index: 0, value: 0.004 }], peak: null }}
        dataUpdatedAt={updated}
        onRefresh={vi.fn()}
      />,
    );
    // The semaphore glyph is rendered with aria-hidden=true; we read by text.
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByLabelText('Estado: dentro de umbral')).toBeInTheDocument();
  });

  it('renders amber semaphore + ⚠ for 1–5 %', () => {
    render(
      <ErrorRateWidget
        data={{ value: 0.023, series: [], peak: null }}
        dataUpdatedAt={updated}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('⚠')).toBeInTheDocument();
    expect(screen.getByLabelText('Estado: cerca del umbral')).toBeInTheDocument();
  });

  it('renders red semaphore + ✗ for > 5 %', () => {
    render(
      <ErrorRateWidget
        data={{ value: 0.071, series: [], peak: null }}
        dataUpdatedAt={updated}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('✗')).toBeInTheDocument();
    expect(screen.getByLabelText('Estado: fuera de umbral — investiga')).toBeInTheDocument();
  });

  it('sparkline aria-label discloses the peak', () => {
    render(
      <ErrorRateWidget
        data={{
          value: 0.005,
          series: [
            { index: 0, value: 0.003 },
            { index: 1, value: 0.006 },
          ],
          peak: { index: 1, value: 0.006 },
        }}
        dataUpdatedAt={updated}
        onRefresh={vi.fn()}
      />,
    );
    // The Sparkline's role="img" has the aria-label.
    const sparkline = screen.getByRole('img');
    expect(sparkline.getAttribute('aria-label') ?? '').toContain('pico');
  });

  it('manual refresh button fires onRefresh on click', () => {
    const onRefresh = vi.fn();
    render(
      <ErrorRateWidget
        data={{ value: 0.004, series: [], peak: null }}
        dataUpdatedAt={updated}
        onRefresh={onRefresh}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refrescar' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows the freshness badge with minute granularity', () => {
    const twoMinAgo = Date.now() - 120_000;
    render(
      <ErrorRateWidget
        data={{ value: 0.004, series: [], peak: null }}
        dataUpdatedAt={twoMinAgo}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText(/Actualizado hace 2 min/)).toBeInTheDocument();
  });
});
