import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CorrectiveActionPicker } from './CorrectiveActionPicker';

const ACTIONS = [
  { id: 'a-recool', label: 'Re-enfriar producto en cámara secundaria' },
  { id: 'a-discard', label: 'Descartar producto + revisar refrigeración' },
];

describe('CorrectiveActionPicker', () => {
  it('renders all corrective action options', () => {
    render(
      <CorrectiveActionPicker
        actions={ACTIONS}
        selectedActionId={null}
        onSelectAction={() => {}}
        notes=""
        onChangeNotes={() => {}}
      />,
    );
    expect(
      screen.getByText('Re-enfriar producto en cámara secundaria'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Descartar producto + revisar refrigeración'),
    ).toBeInTheDocument();
  });

  it('fires onSelectAction when the operator picks an option', () => {
    const onSelectAction = vi.fn();
    render(
      <CorrectiveActionPicker
        actions={ACTIONS}
        selectedActionId={null}
        onSelectAction={onSelectAction}
        notes=""
        onChangeNotes={() => {}}
      />,
    );
    const select = screen.getByLabelText('Acción correctiva (FR12)');
    fireEvent.change(select, { target: { value: 'a-recool' } });
    expect(onSelectAction).toHaveBeenCalledWith('a-recool');
  });

  it('fires onSelectAction(null) when the operator clears the selection', () => {
    const onSelectAction = vi.fn();
    render(
      <CorrectiveActionPicker
        actions={ACTIONS}
        selectedActionId="a-recool"
        onSelectAction={onSelectAction}
        notes=""
        onChangeNotes={() => {}}
      />,
    );
    const select = screen.getByLabelText('Acción correctiva (FR12)');
    fireEvent.change(select, { target: { value: '' } });
    expect(onSelectAction).toHaveBeenCalledWith(null);
  });

  it('fires onChangeNotes when the textarea changes', () => {
    const onChangeNotes = vi.fn();
    render(
      <CorrectiveActionPicker
        actions={ACTIONS}
        selectedActionId={null}
        onSelectAction={() => {}}
        notes=""
        onChangeNotes={onChangeNotes}
      />,
    );
    const textarea = screen.getByLabelText('Notas de la acción correctiva');
    fireEvent.change(textarea, { target: { value: 'lote 0518' } });
    expect(onChangeNotes).toHaveBeenCalledWith('lote 0518');
  });

  it('renders the override radio as disabled (inert in this slice)', () => {
    render(
      <CorrectiveActionPicker
        actions={ACTIONS}
        selectedActionId={null}
        onSelectAction={() => {}}
        notes=""
        onChangeNotes={() => {}}
        overrideOpen
      />,
    );
    const radio = screen.getByRole('radio') as HTMLInputElement;
    expect(radio.disabled).toBe(true);
  });
});
