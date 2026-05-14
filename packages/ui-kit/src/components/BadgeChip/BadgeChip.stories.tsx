import type { Meta, StoryObj } from '@storybook/react';
import { BadgeChip } from './BadgeChip';

const meta: Meta<typeof BadgeChip> = {
  title: 'AI Observability/BadgeChip',
  component: BadgeChip,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Pill-shaped status chip consumed across j8 (BudgetStatusWidget tier, Top5FailuresWidget severity, AnomalyChip).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const TierInfo: Story = { args: { variant: 'info', children: 'Info · 30 %' } };
export const TierWarn: Story = { args: { variant: 'warn', children: 'Warn · 70 %' } };
export const TierError: Story = { args: { variant: 'error', children: 'Error · 92 %' } };
export const TierFatal: Story = { args: { variant: 'fatal', children: 'Fatal · 100 %' } };
export const SeverityP1: Story = { args: { variant: 'p1', children: 'P1' } };
export const SeverityP2: Story = { args: { variant: 'p2', children: 'P2' } };
export const SeverityP3: Story = { args: { variant: 'p3', children: 'P3' } };
export const Neutral: Story = { args: { variant: 'neutral', children: '—' } };
