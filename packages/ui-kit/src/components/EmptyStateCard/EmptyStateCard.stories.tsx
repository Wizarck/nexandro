import type { Meta, StoryObj } from '@storybook/react';
import { EmptyStateCard } from './EmptyStateCard';

const meta: Meta<typeof EmptyStateCard> = {
  title: 'AI Observability/EmptyStateCard',
  component: EmptyStateCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Onboarding-friendly empty state for j8 widgets (slice #20 m3-ai-obs-ui). Per ADR-EMPTY-STATE, first-time orgs see this card instead of an error or broken placeholder.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstTimeOrg: Story = {
  args: {
    title: 'Sin actividad en los últimos 30 días',
    body: 'Tu primera capacidad AI será visible aquí en cuanto se ejecute. Configura un provider para empezar.',
    ctaHref: '/owner-settings#ai-providers',
    ctaLabel: 'Configurar AI providers →',
  },
};

export const NoFailuresInRange: Story = {
  args: {
    title: 'Sin fallos en el rango seleccionado',
    body: 'La selección actual no contiene errores. Cambia el rango si quieres ver más histórico.',
  },
};

export const TitleOnly: Story = {
  args: {
    title: 'Sin datos',
  },
};
