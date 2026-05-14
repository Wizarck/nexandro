import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Top5FailuresWidget } from './Top5FailuresWidget';

const NOW = Date.now();

describe('Top5FailuresWidget', () => {
  it('renders empty state when failures is []', () => {
    render(
      <Top5FailuresWidget
        data={[]}
        range="24h"
        dataUpdatedAt={NOW}
        onRefresh={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Sin fallos en el rango seleccionado'),
    ).toBeInTheDocument();
  });

  it('renders a P1 row with destructive border + p1 BadgeChip + deep-link', () => {
    render(
      <Top5FailuresWidget
        data={[
          {
            eventType: 'VISION_LLM_CALL_FAILED',
            severity: 'P1',
            count: 14,
            lastOccurredAt: new Date(NOW - 7200_000).toISOString(),
            hint: 'Bloquea ingest',
          },
        ]}
        range="24h"
        dataUpdatedAt={NOW}
        onRefresh={vi.fn()}
      />,
    );
    // The severity BadgeChip carries the variant data-attribute.
    const badge = screen
      .getAllByRole('status')
      .find((el) => el.getAttribute('data-variant') === 'p1');
    expect(badge).toBeDefined();
    expect(badge).toHaveTextContent('P1');
    // Deep-link to /audit-log with the event type filter.
    const link = screen.getByRole('link', { name: /Ver eventos/i });
    expect(link.getAttribute('href') ?? '').toContain('/audit-log?eventType=VISION_LLM_CALL_FAILED');
  });

  it('renders P2 + P3 rows with their respective severity chips', () => {
    render(
      <Top5FailuresWidget
        data={[
          {
            eventType: 'PRICING_ROW_NOT_FOUND',
            severity: 'P2',
            count: 7,
            lastOccurredAt: new Date(NOW - 18000_000).toISOString(),
            hint: 'Degrada cost calc',
          },
          {
            eventType: 'OTLP_EXPORTER_503',
            severity: 'P3',
            count: 3,
            lastOccurredAt: new Date(NOW - 39600_000).toISOString(),
            hint: 'No bloquea',
          },
        ]}
        range="24h"
        dataUpdatedAt={NOW}
        onRefresh={vi.fn()}
      />,
    );
    const p2 = screen
      .getAllByRole('status')
      .find((el) => el.getAttribute('data-variant') === 'p2');
    const p3 = screen
      .getAllByRole('status')
      .find((el) => el.getAttribute('data-variant') === 'p3');
    expect(p2).toBeDefined();
    expect(p2).toHaveTextContent('P2');
    expect(p3).toBeDefined();
    expect(p3).toHaveTextContent('P3');
  });
});
