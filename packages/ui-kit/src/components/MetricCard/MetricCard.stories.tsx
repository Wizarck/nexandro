import type { Meta, StoryObj } from '@storybook/react';
import { MetricCard } from './MetricCard';

const meta: Meta<typeof MetricCard> = {
  title: 'AI Observability/MetricCard',
  component: MetricCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Bordered surface panel for j8 widgets. Provides eyebrow + headline + sub + footer + optional refresh button.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    eyebrow: 'ERROR RATE · 24H',
    headline: '0,4 %',
    sub: 'Umbral verde < 1 % · ámbar 1–5 % · rojo > 5 %',
  },
};

export const Wide: Story = {
  args: {
    eyebrow: 'TOP 5 FALLOS · 24H',
    sub: 'Coloreados por severidad',
    wide: true,
    children: <p style={{ color: 'var(--color-mute)' }}>(slot)</p>,
  },
};

export const WithFooter: Story = {
  args: {
    eyebrow: 'COSTE · MES EN CURSO',
    headline: '€ 84,21',
    sub: 'de un presupuesto mensual de € 120,00',
    footer: <span>Actualizado hace 0 min</span>,
  },
};

export const WithRefresh: Story = {
  args: {
    eyebrow: 'COSTE · MES EN CURSO',
    headline: '€ 84,21',
    sub: 'de un presupuesto mensual de € 120,00',
    footer: <span>Actualizado hace 3 min</span>,
    refreshButton: {
      onClick: () => undefined,
      label: 'Refrescar',
    },
  },
};
