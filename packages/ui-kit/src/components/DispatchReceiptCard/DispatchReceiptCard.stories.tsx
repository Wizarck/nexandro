import type { Meta, StoryObj } from '@storybook/react';
import { DispatchReceiptCard } from './DispatchReceiptCard';

const meta: Meta<typeof DispatchReceiptCard> = {
  title: 'Recall/DispatchReceiptCard',
  component: DispatchReceiptCard,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    rows: [
      {
        address: 'info-claims@aseguradora.es',
        status: 'delivered',
        deliveredAt: '02:21:14',
      },
      {
        address: 'inspector.regional@sanidad.eu',
        status: 'delivered',
        deliveredAt: '02:21:09',
      },
    ],
  },
};

export const WithFailure: Story = {
  args: {
    rows: [
      { address: 'ok@example.org', status: 'delivered', deliveredAt: '02:21:14' },
      {
        address: 'broken@example.org',
        status: 'failed',
        errorMessage: 'SMTP 550',
      },
    ],
    onManualResend: () => undefined,
  },
};
