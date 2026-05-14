import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { RecipientList } from './RecipientList';
import type { RecipientListEntry } from './RecipientList.types';

const ENTRIES: RecipientListEntry[] = [
  { address: 'ops@example.org', label: 'Aseguradora' },
  { address: 'inspector@example.eu', label: 'Sanidad' },
];

function Harness({
  initialSelected = [] as string[],
  onChange,
}: {
  initialSelected?: string[];
  onChange?: (next: string[]) => void;
}) {
  const [selected, setSelected] = useState(initialSelected);
  return (
    <RecipientList
      entries={ENTRIES}
      selected={selected}
      onChange={(next) => {
        setSelected(next);
        onChange?.(next);
      }}
    />
  );
}

describe('RecipientList', () => {
  it('renders each recipient with checkbox + label', () => {
    render(<Harness />);
    expect(screen.getByLabelText(/ops@example.org/)).toBeInTheDocument();
    expect(screen.getByLabelText(/inspector@example.eu/)).toBeInTheDocument();
  });

  it('toggling a checkbox updates the selection', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(
      screen.getByTestId('recipient-checkbox-ops@example.org'),
    );
    expect(onChange).toHaveBeenCalledWith(['ops@example.org']);
  });

  it('"Marcar todos" selects all when none are selected', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todos' }));
    expect(onChange).toHaveBeenCalledWith([
      'ops@example.org',
      'inspector@example.eu',
    ]);
  });

  it('"Marcar todos" deselects all when all are selected', () => {
    const onChange = vi.fn();
    render(
      <Harness
        initialSelected={['ops@example.org', 'inspector@example.eu']}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todos' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('confirm button disabled when nothing is selected', () => {
    const onClick = vi.fn();
    render(
      <RecipientList
        entries={ENTRIES}
        selected={[]}
        onChange={() => undefined}
        confirmButton={{ label: 'Reenviar', onClick }}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Reenviar' });
    expect(confirm).toBeDisabled();
  });

  it('confirm button fires onClick once', () => {
    const onClick = vi.fn();
    render(
      <RecipientList
        entries={ENTRIES}
        selected={['ops@example.org']}
        onChange={() => undefined}
        confirmButton={{ label: 'Reenviar', onClick }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
