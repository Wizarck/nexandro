import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders an svg with role="img" + the supplied ariaLabel', () => {
    render(
      <Sparkline
        data={[
          { index: 0, value: 0.1 },
          { index: 1, value: 0.2 },
        ]}
        ariaLabel="Sparkline 24 horas: pico 0,6 % a las 14:00"
      />,
    );
    const svg = screen.getByRole('img');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg).toHaveAccessibleName('Sparkline 24 horas: pico 0,6 % a las 14:00');
  });

  it('renders the threshold gridline when threshold is supplied', () => {
    const { container } = render(
      <Sparkline
        data={[
          { index: 0, value: 0.005 },
          { index: 1, value: 0.012 },
        ]}
        threshold={0.01}
        ariaLabel="trend"
      />,
    );
    // Dashed line element renders only when threshold provided.
    expect(container.querySelector('line[stroke-dasharray]')).not.toBeNull();
  });

  it('does not render the threshold gridline when threshold is omitted', () => {
    const { container } = render(
      <Sparkline
        data={[
          { index: 0, value: 0.1 },
          { index: 1, value: 0.2 },
        ]}
        ariaLabel="trend"
      />,
    );
    expect(container.querySelector('line[stroke-dasharray]')).toBeNull();
  });

  it('renders the peak marker when peak is supplied', () => {
    const { container } = render(
      <Sparkline
        data={[
          { index: 0, value: 0.1 },
          { index: 1, value: 0.4 },
          { index: 2, value: 0.2 },
        ]}
        peak={{ index: 1, value: 0.4 }}
        ariaLabel="trend"
      />,
    );
    expect(container.querySelector('circle')).not.toBeNull();
  });

  it('does not render the peak marker when peak is null', () => {
    const { container } = render(
      <Sparkline
        data={[{ index: 0, value: 0.1 }]}
        peak={null}
        ariaLabel="trend"
      />,
    );
    expect(container.querySelector('circle')).toBeNull();
  });

  it('handles empty data gracefully (no path, no peak)', () => {
    const { container } = render(<Sparkline data={[]} ariaLabel="no data" />);
    expect(container.querySelector('path')).toBeNull();
    expect(container.querySelector('circle')).toBeNull();
    // The svg itself still renders so the layout doesn't shift.
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('exposes ariaLabel through a nested <title> for SR fallback', () => {
    const { container } = render(
      <Sparkline data={[{ index: 0, value: 0.1 }]} ariaLabel="trend explanation" />,
    );
    const title = container.querySelector('title');
    expect(title?.textContent).toBe('trend explanation');
  });
});
