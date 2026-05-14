import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DispatchReceiptCard } from './DispatchReceiptCard';

describe('DispatchReceiptCard', () => {
  it('renders a row per recipient with status glyph + label', () => {
    render(
      <DispatchReceiptCard
        rows={[
          {
            address: 'ops@example.org',
            status: 'delivered',
            providerMessageId: 'msg-1',
            deliveredAt: '02:21:14',
          },
          {
            address: 'inspector@example.eu',
            status: 'retrying',
            attempt: 2,
          },
          {
            address: 'broken@example.org',
            status: 'failed',
            errorMessage: 'SMTP 550',
          },
        ]}
      />,
    );
    expect(screen.getByText('ops@example.org')).toBeInTheDocument();
    expect(screen.getByText(/02:21:14/)).toBeInTheDocument();
    expect(screen.getByText(/intento 2\/3/)).toBeInTheDocument();
    expect(screen.getByText('fallo final')).toBeInTheDocument();
  });

  it('shows Reenviar manualmente only on failed rows when onManualResend is set', () => {
    const onManualResend = vi.fn();
    render(
      <DispatchReceiptCard
        rows={[
          { address: 'ok@example.org', status: 'delivered' },
          { address: 'broken@example.org', status: 'failed' },
        ]}
        onManualResend={onManualResend}
      />,
    );
    const buttons = screen.getAllByRole('button', {
      name: 'Reenviar manualmente',
    });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onManualResend).toHaveBeenCalledWith('broken@example.org');
  });

  it('renders the empty hint when rows is empty', () => {
    render(<DispatchReceiptCard rows={[]} />);
    expect(
      screen.getByText('Sin destinatarios registrados.'),
    ).toBeInTheDocument();
  });

  it('exposes the audit_log row link when supplied', () => {
    const onClick = vi.fn();
    render(
      <DispatchReceiptCard
        rows={[
          {
            address: 'ops@example.org',
            status: 'delivered',
            auditLogRowRef: {
              rowId: '00000000-1111-2222-3333-444444444444',
              onClick,
            },
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /audit_log 00000000/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
