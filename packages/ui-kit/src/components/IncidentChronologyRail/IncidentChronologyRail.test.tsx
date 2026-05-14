import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IncidentChronologyRail } from './IncidentChronologyRail';

describe('IncidentChronologyRail', () => {
  it('renders each entry with timestamp + label', () => {
    render(
      <IncidentChronologyRail
        entries={[
          {
            id: 'r1',
            eventType: 'RECALL_INVESTIGATION_OPENED',
            label: 'Investigación iniciada',
            createdAt: '2026-05-13T02:14:00Z',
            actor: 'Iker',
          },
          {
            id: 'r2',
            eventType: 'RECALL_86_FLAG_DISPATCHED',
            label: '86-flag dispatched',
            createdAt: '2026-05-13T02:21:00Z',
            actor: 'Iker',
          },
        ]}
      />,
    );
    expect(screen.getByText('Investigación iniciada')).toBeInTheDocument();
    expect(screen.getByText('86-flag dispatched')).toBeInTheDocument();
    expect(screen.getAllByText(/Iker/)).toHaveLength(2);
  });

  it('falls back to eventType when label is missing', () => {
    render(
      <IncidentChronologyRail
        entries={[
          {
            id: 'r1',
            eventType: 'RECALL_ADDENDUM_ATTACHED',
            createdAt: '2026-05-13T03:00:00Z',
          },
        ]}
      />,
    );
    expect(screen.getByText('RECALL_ADDENDUM_ATTACHED')).toBeInTheDocument();
  });

  it('renders the empty hint when entries is empty', () => {
    render(<IncidentChronologyRail entries={[]} />);
    expect(screen.getByText('Sin eventos registrados.')).toBeInTheDocument();
  });

  it('renders with aria-live=polite on the log region', () => {
    render(
      <IncidentChronologyRail entries={[]} title="Cronología del incidente" />,
    );
    const log = screen.getByRole('log', { name: 'Cronología del incidente' });
    expect(log).toHaveAttribute('aria-live', 'polite');
  });

  it('toggles data-drawer when drawer prop is set', () => {
    const { rerender } = render(<IncidentChronologyRail entries={[]} />);
    expect(screen.getByTestId('chronology-rail')).toHaveAttribute(
      'data-drawer',
      'false',
    );
    rerender(<IncidentChronologyRail entries={[]} drawer />);
    expect(screen.getByTestId('chronology-rail')).toHaveAttribute(
      'data-drawer',
      'true',
    );
  });
});
