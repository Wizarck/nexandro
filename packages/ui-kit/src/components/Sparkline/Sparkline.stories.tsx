import type { Meta, StoryObj } from '@storybook/react';
import { Sparkline } from './Sparkline';

const meta: Meta<typeof Sparkline> = {
  title: 'AI Observability/Sparkline',
  component: Sparkline,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Minimal SVG line chart consumed by j8 ErrorRateWidget. Static — no JS animation. Accessibility: role="img" + caller-supplied aria-label describing trend + peak. Threshold gridline optional.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const stableSeries = Array.from({ length: 24 }, (_, i) => ({
  index: i,
  value: 0.003 + Math.sin(i / 3) * 0.001,
}));

export const Stable: Story = {
  args: {
    data: stableSeries,
    ariaLabel: 'Sparkline 24 horas: tasa estable bajo umbral',
  },
};

export const WithPeak: Story = {
  args: {
    data: [
      ...stableSeries.slice(0, 14),
      { index: 14, value: 0.006 },
      ...stableSeries.slice(15),
    ],
    peak: { index: 14, value: 0.006 },
    ariaLabel: 'Sparkline 24 horas: pico 0,6 % a las 14:00',
  },
};

export const WithThreshold: Story = {
  args: {
    data: stableSeries,
    threshold: 0.01,
    ariaLabel: 'Sparkline 24 horas con umbral verde 1 %',
  },
};

export const Empty: Story = {
  args: {
    data: [],
    ariaLabel: 'Sin actividad en el rango seleccionado',
  },
};
