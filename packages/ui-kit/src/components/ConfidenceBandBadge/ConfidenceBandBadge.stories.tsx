import type { Meta, StoryObj } from '@storybook/react';
import { ConfidenceBandBadge } from './ConfidenceBandBadge';

const meta: Meta<typeof ConfidenceBandBadge> = {
  title: 'PhotoIngest/ConfidenceBandBadge',
  component: ConfidenceBandBadge,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const AutoFill: Story = { args: { confidence: 0.91 } };
export const FlagForReview: Story = { args: { confidence: 0.74 } };
export const Reject: Story = { args: { confidence: 0.42 } };
