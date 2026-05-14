import type { Meta, StoryObj } from '@storybook/react';
import { IncidentChronologyRail } from './IncidentChronologyRail';

const meta: Meta<typeof IncidentChronologyRail> = {
  title: 'Recall/IncidentChronologyRail',
  component: IncidentChronologyRail,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    entries: [
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
        label: 'Servicio detenido en 3 locales',
        createdAt: '2026-05-13T02:21:00Z',
        actor: 'Iker',
      },
    ],
  },
};

export const Drawer: Story = {
  args: { ...Default.args, drawer: true },
};
