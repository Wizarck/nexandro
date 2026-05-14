import type { Meta, StoryObj } from '@storybook/react';
import { RecallActionBar } from './RecallActionBar';

const meta: Meta<typeof RecallActionBar> = {
  title: 'Recall/RecallActionBar',
  component: RecallActionBar,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Detener servicio + Generar dossier',
    eyebrow: 'Investigación de incidente · 02:14 CEST · ventana legal 04:00',
    onActivate: () => undefined,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Despachando…',
    disabled: true,
    onActivate: () => undefined,
  },
};
