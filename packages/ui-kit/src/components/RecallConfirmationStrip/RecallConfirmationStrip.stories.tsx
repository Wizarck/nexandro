import type { Meta, StoryObj } from '@storybook/react';
import { RecallConfirmationStrip } from './RecallConfirmationStrip';

const meta: Meta<typeof RecallConfirmationStrip> = {
  title: 'Recall/RecallConfirmationStrip',
  component: RecallConfirmationStrip,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Confirm: Story = {
  args: {
    mode: 'confirm',
    message: '¿Cortar servicio en 3 locales + enviar dossier a 2 destinatarios?',
  },
};

export const Receipt: Story = {
  args: {
    mode: 'receipt',
    message: 'Dossier dispatched · 02:21 CEST',
    receiptLink: { label: 'ver dossier →', onClick: () => undefined },
  },
};
