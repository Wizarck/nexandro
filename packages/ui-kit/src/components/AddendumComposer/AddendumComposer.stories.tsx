import type { Meta, StoryObj } from '@storybook/react';
import { AddendumComposer } from './AddendumComposer';

const meta: Meta<typeof AddendumComposer> = {
  title: 'Recall/AddendumComposer',
  component: AddendumComposer,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onSubmit: () => undefined,
  },
};

export const Busy: Story = {
  args: {
    onSubmit: () => undefined,
    busy: true,
  },
};
