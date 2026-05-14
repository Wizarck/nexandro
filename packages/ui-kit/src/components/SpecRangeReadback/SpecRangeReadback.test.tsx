import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpecRangeReadback } from './SpecRangeReadback';

describe('SpecRangeReadback', () => {
  it('renders idle state with the spec range when value is empty', () => {
    render(
      <SpecRangeReadback specMin={-2} specMax={2} currentValue="" unit="°C" />,
    );
    const region = screen.getByRole('status');
    expect(region.getAttribute('data-status')).toBe('idle');
    expect(region.textContent).toContain('Rango aceptable: -2 a 2 °C');
  });

  it('renders in-spec state with Dentro de rango when value is inside the range', () => {
    render(
      <SpecRangeReadback
        specMin={-2}
        specMax={2}
        currentValue="1.2"
        unit="°C"
      />,
    );
    const region = screen.getByRole('status');
    expect(region.getAttribute('data-status')).toBe('in-spec');
    expect(region.textContent).toContain('Dentro de rango (-2 a 2 °C)');
  });

  it('renders out-of-spec state when value is above the upper bound', () => {
    render(
      <SpecRangeReadback
        specMin={-2}
        specMax={2}
        currentValue="3.5"
        unit="°C"
      />,
    );
    const region = screen.getByRole('status');
    expect(region.getAttribute('data-status')).toBe('out-of-spec');
    expect(region.textContent).toContain('Fuera de rango');
    expect(region.textContent).toContain('acción correctiva');
  });

  it('renders out-of-spec state when value is below the lower bound', () => {
    render(
      <SpecRangeReadback
        specMin={-2}
        specMax={2}
        currentValue="-5"
        unit="°C"
      />,
    );
    expect(screen.getByRole('status').getAttribute('data-status')).toBe(
      'out-of-spec',
    );
  });

  it('renders idle state when value is NaN', () => {
    render(
      <SpecRangeReadback
        specMin={-2}
        specMax={2}
        currentValue="abc"
        unit="°C"
      />,
    );
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('idle');
  });

  it('boundary value equal to specMin is in-spec', () => {
    render(
      <SpecRangeReadback specMin={-2} specMax={2} currentValue="-2" unit="°C" />,
    );
    expect(screen.getByRole('status').getAttribute('data-status')).toBe(
      'in-spec',
    );
  });

  it('boundary value equal to specMax is in-spec', () => {
    render(
      <SpecRangeReadback specMin={-2} specMax={2} currentValue="2" unit="°C" />,
    );
    expect(screen.getByRole('status').getAttribute('data-status')).toBe(
      'in-spec',
    );
  });

  it('uses aria-live=polite so screen readers announce status transitions', () => {
    render(
      <SpecRangeReadback
        specMin={-2}
        specMax={2}
        currentValue="1"
        unit="°C"
      />,
    );
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });
});
