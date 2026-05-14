import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AddendumComposer } from './AddendumComposer';

describe('AddendumComposer', () => {
  it('renders the toggle CTA collapsed by default', () => {
    render(<AddendumComposer onSubmit={() => undefined} />);
    expect(
      screen.getByRole('button', { name: 'Añadir adenda' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('addendum-composer')).not.toBeInTheDocument();
  });

  it('opens the form when the toggle is clicked', () => {
    render(<AddendumComposer onSubmit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir adenda' }));
    expect(screen.getByTestId('addendum-composer')).toBeInTheDocument();
    expect(screen.getByTestId('addendum-textarea')).toBeInTheDocument();
  });

  it('disables the confirm pill while the textarea is empty', () => {
    render(<AddendumComposer onSubmit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir adenda' }));
    const confirm = screen.getByRole('button', {
      name: 'Adjuntar al expediente',
    });
    expect(confirm).toBeDisabled();
  });

  it('invokes onSubmit with the captured text and renders the immutable state', () => {
    const onSubmit = vi.fn();
    render(<AddendumComposer onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir adenda' }));
    const textarea = screen.getByTestId('addendum-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Inspector visited.' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Adjuntar al expediente' }),
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0] as { text: string };
    expect(submitted.text).toBe('Inspector visited.');

    // Post-confirm: textarea is disabled, immutability message renders.
    expect(textarea).toBeDisabled();
    expect(
      screen.getByText(/Adjuntada al expediente. La adenda es inmutable./),
    ).toBeInTheDocument();
    // No more file input visible.
    expect(screen.queryByTestId('addendum-file-input')).not.toBeInTheDocument();
  });

  it('honours the busy state by disabling the confirm pill', () => {
    render(<AddendumComposer onSubmit={() => undefined} busy />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir adenda' }));
    const confirm = screen.getByRole('button', {
      name: 'Adjuntar al expediente',
    });
    expect(confirm).toBeDisabled();
  });
});
