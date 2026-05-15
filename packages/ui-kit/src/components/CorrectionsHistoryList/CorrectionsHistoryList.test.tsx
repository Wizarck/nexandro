import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CorrectionsHistoryList } from './CorrectionsHistoryList';
import type { CorrectionsHistoryEntry } from './CorrectionsHistoryList.types';

const ENTRY_OLD: CorrectionsHistoryEntry = {
  correctionId: 'old-1',
  correctedAt: '2026-05-14T10:00:00.000Z',
  correctedByUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  reason: 'Recount tras inventario',
  fieldsChanged: 2,
};

const ENTRY_NEWER: CorrectionsHistoryEntry = {
  correctionId: 'new-1',
  correctedAt: '2026-05-15T09:00:00.000Z',
  correctedByUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  reason: null,
  fieldsChanged: 1,
};

describe('CorrectionsHistoryList', () => {
  it('renders an empty-state when entries is []', () => {
    render(<CorrectionsHistoryList entries={[]} />);
    expect(screen.getByTestId('corrections-history-empty')).toHaveTextContent(
      'Sin correcciones previas',
    );
  });

  it('renders a single entry with timestamp, user ellipsis, fields chip, and reason', () => {
    render(<CorrectionsHistoryList entries={[ENTRY_OLD]} />);
    const items = screen.getAllByTestId('corrections-history-entry');
    expect(items).toHaveLength(1);
    // Elided user id (first 8 chars).
    expect(items[0]).toHaveTextContent('aaaaaaaa…');
    // Pluralised "campos" chip for fieldsChanged=2.
    expect(items[0]).toHaveTextContent('2 campos');
    expect(items[0]).toHaveTextContent('Recount tras inventario');
    const time = items[0].querySelector('time');
    expect(time).not.toBeNull();
    expect(time!.getAttribute('datetime')).toBe('2026-05-14T10:00:00.000Z');
  });

  it('renders multiple entries newest-first (reverses backend oldest-first order)', () => {
    render(<CorrectionsHistoryList entries={[ENTRY_OLD, ENTRY_NEWER]} />);
    const items = screen.getAllByTestId('corrections-history-entry');
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute('data-correction-id')).toBe('new-1');
    expect(items[1].getAttribute('data-correction-id')).toBe('old-1');
  });

  it('truncates long reasons but exposes the full text via the title attribute', () => {
    const long = 'a'.repeat(120);
    render(
      <CorrectionsHistoryList
        entries={[{ ...ENTRY_OLD, reason: long }]}
      />,
    );
    const item = screen.getByTestId('corrections-history-entry');
    const p = item.querySelector('p');
    expect(p).not.toBeNull();
    // Displayed text is 60 chars + ellipsis.
    expect(p!.textContent).toBe(`${long.slice(0, 60)}…`);
    expect(p!.getAttribute('title')).toBe(long);
  });

  it('uses singular "campo" when fieldsChanged is 1', () => {
    render(<CorrectionsHistoryList entries={[ENTRY_NEWER]} />);
    const item = screen.getByTestId('corrections-history-entry');
    expect(item).toHaveTextContent('1 campo');
    expect(item).not.toHaveTextContent('1 campos');
  });
});
