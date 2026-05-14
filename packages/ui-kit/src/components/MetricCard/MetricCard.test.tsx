import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MetricCard } from './MetricCard';

describe('MetricCard', () => {
  it('renders eyebrow + headline + sub', () => {
    render(
      <MetricCard
        eyebrow="ERROR RATE · 24H"
        headline="0,4 %"
        sub="Umbral verde < 1 %"
      />,
    );
    expect(screen.getByText('ERROR RATE · 24H')).toBeInTheDocument();
    expect(screen.getByText('0,4 %')).toBeInTheDocument();
    expect(screen.getByText('Umbral verde < 1 %')).toBeInTheDocument();
  });

  it('uses eyebrow as accessible name when aria-label is omitted', () => {
    render(<MetricCard eyebrow="Tasa de error" />);
    expect(screen.getByLabelText('Tasa de error')).toBeInTheDocument();
  });

  it('honours explicit aria-label', () => {
    render(<MetricCard eyebrow="ERROR" aria-label="Tasa de error widget" />);
    expect(screen.getByLabelText('Tasa de error widget')).toBeInTheDocument();
  });

  it('renders footer when supplied', () => {
    render(
      <MetricCard
        eyebrow="ERR"
        footer={<span>Actualizado hace 0 min</span>}
      />,
    );
    expect(screen.getByText('Actualizado hace 0 min')).toBeInTheDocument();
  });

  it('renders refresh button + fires onClick on activation', () => {
    const onClick = vi.fn();
    render(
      <MetricCard
        eyebrow="ERR"
        refreshButton={{ onClick, label: 'Refrescar' }}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Refrescar' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies col-span-full when wide is true', () => {
    const { container } = render(<MetricCard eyebrow="ERR" wide />);
    expect(container.querySelector('section')?.className).toMatch(/col-span-full/);
  });
});
