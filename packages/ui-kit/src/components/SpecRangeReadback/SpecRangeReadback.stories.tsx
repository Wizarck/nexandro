import type { Meta, StoryObj } from '@storybook/react';
import { SpecRangeReadback } from './SpecRangeReadback';

const meta: Meta<typeof SpecRangeReadback> = {
  title: 'HACCP/SpecRangeReadback',
  component: SpecRangeReadback,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'j10 region #4 — live readback. Derives in/out-of-spec from props client-side; `aria-live="polite"` for screen-reader users.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { specMin: -2, specMax: 2, currentValue: '', unit: '°C' },
};

export const InSpec: Story = {
  args: { specMin: -2, specMax: 2, currentValue: '1.2', unit: '°C' },
};

export const OutOfSpec: Story = {
  args: { specMin: -2, specMax: 2, currentValue: '3.5', unit: '°C' },
};
