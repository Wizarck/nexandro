import type { Meta, StoryObj } from '@storybook/react';
import { HitlQueueList } from './HitlQueueList';
import type { HitlQueueRow } from './HitlQueueList.types';

const NOW = new Date('2026-05-15T15:00:00Z').getTime();

const FOUR: HitlQueueRow[] = [
  {
    itemId: 'itm-1',
    kind: 'invoice',
    hint: 'Mercabarna · Albarán 4471',
    thumbnailUrl: null,
    uploadedAt: NOW - 6 * 60_000,
    overallConfidence: 0.74,
  },
  {
    itemId: 'itm-2',
    kind: 'product',
    hint: 'Atún rojo · Lot 88',
    thumbnailUrl: null,
    uploadedAt: NOW - 35 * 60_000,
    overallConfidence: 0.42,
  },
  {
    itemId: 'itm-3',
    kind: 'invoice',
    hint: 'Aceitunas Sevilla',
    thumbnailUrl: null,
    uploadedAt: NOW - 2 * 3600_000,
    overallConfidence: 0.91,
  },
  {
    itemId: 'itm-4',
    kind: 'product',
    hint: 'Pulpo congelado',
    thumbnailUrl: null,
    uploadedAt: NOW - 5 * 3600_000,
    overallConfidence: 0.6,
  },
];

const meta: Meta<typeof HitlQueueList> = {
  title: 'PhotoIngest/HitlQueueList',
  component: HitlQueueList,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const FourItems: Story = {
  args: {
    rows: FOUR,
    selectedItemId: 'itm-1',
    onSelect: () => undefined,
    onUploadClick: () => undefined,
    now: NOW,
  },
};

export const Empty: Story = {
  args: {
    rows: [],
    selectedItemId: null,
    onSelect: () => undefined,
    onUploadClick: () => undefined,
    now: NOW,
  },
};
