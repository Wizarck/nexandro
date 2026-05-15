import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HitlQueueList } from './HitlQueueList';
import type { HitlQueueRow } from './HitlQueueList.types';

const FIXED_NOW = new Date('2026-05-15T15:00:00Z').getTime();

const SAMPLE_ROWS: HitlQueueRow[] = [
  {
    itemId: 'itm-1',
    kind: 'invoice',
    hint: 'Mercabarna · Albarán 4471',
    thumbnailUrl: null,
    uploadedAt: FIXED_NOW - 6 * 60_000,
    overallConfidence: 0.74,
  },
  {
    itemId: 'itm-2',
    kind: 'product',
    hint: 'Atún rojo · Lot 88',
    thumbnailUrl: null,
    uploadedAt: FIXED_NOW - 35 * 60_000,
    overallConfidence: 0.42,
  },
];

describe('HitlQueueList', () => {
  it('renders all rows and the upload CTA', () => {
    render(
      <HitlQueueList
        rows={SAMPLE_ROWS}
        selectedItemId={null}
        onSelect={vi.fn()}
        now={FIXED_NOW}
      />,
    );
    expect(screen.getByText(/Mercabarna/)).toBeInTheDocument();
    expect(screen.getByText(/Atún rojo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Subir foto' })).toBeInTheDocument();
  });

  it('fires onSelect with the item id when a row is clicked', () => {
    const onSelect = vi.fn();
    render(
      <HitlQueueList
        rows={SAMPLE_ROWS}
        selectedItemId={null}
        onSelect={onSelect}
        now={FIXED_NOW}
      />,
    );
    fireEvent.click(screen.getByText(/Mercabarna/));
    expect(onSelect).toHaveBeenCalledWith('itm-1');
  });

  it('marks the selected row with data-selected="true"', () => {
    render(
      <HitlQueueList
        rows={SAMPLE_ROWS}
        selectedItemId="itm-2"
        onSelect={vi.fn()}
        now={FIXED_NOW}
      />,
    );
    const selected = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('data-selected') === 'true');
    expect(selected?.textContent).toContain('Atún rojo');
  });

  it('fires onUploadClick when the CTA is clicked', () => {
    const onUploadClick = vi.fn();
    render(
      <HitlQueueList
        rows={SAMPLE_ROWS}
        selectedItemId={null}
        onSelect={vi.fn()}
        onUploadClick={onUploadClick}
        now={FIXED_NOW}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Subir foto' }));
    expect(onUploadClick).toHaveBeenCalled();
  });

  it('renders an empty state when rows is empty', () => {
    render(
      <HitlQueueList
        rows={[]}
        selectedItemId={null}
        onSelect={vi.fn()}
        now={FIXED_NOW}
      />,
    );
    expect(
      screen.getByText('No hay elementos pendientes de revisión.'),
    ).toBeInTheDocument();
  });

  it('formats time-since-upload in minutes', () => {
    render(
      <HitlQueueList
        rows={SAMPLE_ROWS}
        selectedItemId={null}
        onSelect={vi.fn()}
        now={FIXED_NOW}
      />,
    );
    expect(screen.getByText('hace 6 min')).toBeInTheDocument();
    expect(screen.getByText('hace 35 min')).toBeInTheDocument();
  });
});
