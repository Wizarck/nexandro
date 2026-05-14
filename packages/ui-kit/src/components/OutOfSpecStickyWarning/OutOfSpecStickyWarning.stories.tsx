import type { Meta, StoryObj } from '@storybook/react';
import { OutOfSpecStickyWarning } from './OutOfSpecStickyWarning';

const meta: Meta<typeof OutOfSpecStickyWarning> = {
  title: 'HACCP/OutOfSpecStickyWarning',
  component: OutOfSpecStickyWarning,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'j10 region #9 — sticky alert when a prior reading is out-of-spec without a linked corrective action.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: {} };

export const WithVerPreviaLink: Story = {
  args: {
    ctaLabel: 'Ver previa →',
    onSeePrior: () => {},
  },
};
