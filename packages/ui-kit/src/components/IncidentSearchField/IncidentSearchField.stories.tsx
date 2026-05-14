import type { Meta, StoryObj } from '@storybook/react';
import { IncidentSearchField } from './IncidentSearchField';
import type { IncidentSearchHit } from './IncidentSearchField.types';

const NOW = new Date('2026-05-14T12:00:00Z').toISOString();
const YESTERDAY = new Date('2026-05-13T10:00:00Z').toISOString();
const LAST_WEEK = new Date('2026-05-07T09:00:00Z').toISOString();

const HITS: IncidentSearchHit[] = [
  {
    kind: 'lot',
    id: '550e8400-e29b-41d4-a716-446655440000',
    label: 'LOT-2026-0512-A',
    supportingText: 'Recibido 2026-05-12',
    receivedAt: YESTERDAY,
    symptomMatchScore: 0.5,
  },
  {
    kind: 'lot',
    id: '550e8400-e29b-41d4-a716-446655440001',
    label: 'LOT-2026-0507-B',
    supportingText: 'Recibido 2026-05-07',
    receivedAt: LAST_WEEK,
    symptomMatchScore: 0.0,
  },
  {
    kind: 'supplier',
    id: '550e8400-e29b-41d4-a716-446655440002',
    label: 'Pescados Alborada',
    supportingText: 'ES',
    receivedAt: null,
    symptomMatchScore: 0,
  },
  {
    kind: 'ingredient',
    id: '550e8400-e29b-41d4-a716-446655440003',
    label: 'Lubina fresca',
    supportingText: 'WEIGHT',
    receivedAt: null,
    symptomMatchScore: 0,
  },
];

const meta: Meta<typeof IncidentSearchField> = {
  title: 'Recall/IncidentSearchField',
  component: IncidentSearchField,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Multi-anchor incident search field for the J6 recall investigation screen. 200ms debounce, combobox + listbox semantics, 8-result cap enforced by the backend service.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { hits: [], onSearch: () => undefined, onSelect: () => undefined },
};

export const WithHits: Story = {
  args: { hits: HITS, onSearch: () => undefined, onSelect: () => undefined },
  parameters: {
    docs: {
      description: {
        story: 'Populated dropdown with mixed-kind hits. Lots first (recency), then suppliers + ingredients (null receivedAt, NULLS LAST).',
      },
    },
  },
};

export const Loading: Story = {
  args: {
    hits: [],
    loading: true,
    value: 'pescado',
    onSearch: () => undefined,
    onSelect: () => undefined,
  },
};

export const Empty: Story = {
  args: {
    hits: [],
    value: 'xyzqwerty',
    onSearch: () => undefined,
    onSelect: () => undefined,
  },
};
