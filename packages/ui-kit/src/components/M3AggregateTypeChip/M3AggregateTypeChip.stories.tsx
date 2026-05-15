import type { Meta, StoryObj } from '@storybook/react';
import { M3AggregateTypeChip } from './M3AggregateTypeChip';

const meta: Meta<typeof M3AggregateTypeChip> = {
  title: 'PhotoIngest/M3AggregateTypeChip',
  component: M3AggregateTypeChip,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Invoice: Story = { args: { kind: 'invoice' } };
export const Product: Story = { args: { kind: 'product' } };
