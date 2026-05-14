import type { Meta, StoryObj } from '@storybook/react';
import { RecentReadingsStrip } from './RecentReadingsStrip';

const meta: Meta<typeof RecentReadingsStrip> = {
  title: 'HACCP/RecentReadingsStrip',
  component: RecentReadingsStrip,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'j10 region #8 — right-sidebar strip showing the last 5 readings. Read-only per j10 §Decisions.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const NOW = '2026-05-13T15:28:00Z';

export const TypicalAllInSpec: Story = {
  args: {
    readings: [
      { id: 'r-1', display: '1.5 °C', recordedAt: NOW, actor: 'Carmen', inSpec: true },
      { id: 'r-2', display: '1.8 °C', recordedAt: '2026-05-12T15:33:00Z', actor: 'Carmen', inSpec: true },
      { id: 'r-3', display: '1.4 °C', recordedAt: '2026-05-11T15:14:00Z', actor: 'Carmen', inSpec: true },
      { id: 'r-4', display: '1.6 °C', recordedAt: '2026-05-10T15:30:00Z', actor: 'Carmen', inSpec: true },
      { id: 'r-5', display: '1.3 °C', recordedAt: '2026-05-09T15:11:00Z', actor: 'Iñaki', inSpec: true },
    ],
  },
};

export const WithOneOutOfSpec: Story = {
  args: {
    readings: [
      { id: 'r-1', display: '1.5 °C', recordedAt: NOW, actor: 'Carmen', inSpec: true },
      { id: 'r-2', display: '1.8 °C', recordedAt: '2026-05-12T15:33:00Z', actor: 'Carmen', inSpec: true },
      { id: 'r-3', display: '3.2 °C', recordedAt: '2026-05-11T15:51:00Z', actor: 'Iñaki', inSpec: false },
      { id: 'r-4', display: '1.4 °C', recordedAt: '2026-05-10T15:14:00Z', actor: 'Carmen', inSpec: true },
      { id: 'r-5', display: '1.6 °C', recordedAt: '2026-05-09T15:30:00Z', actor: 'Carmen', inSpec: true },
    ],
  },
};

export const Empty: Story = { args: { readings: [] } };
