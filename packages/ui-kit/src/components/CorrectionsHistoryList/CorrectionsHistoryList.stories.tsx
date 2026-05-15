import type { Meta, StoryObj } from '@storybook/react';
import { CorrectionsHistoryList } from './CorrectionsHistoryList';
import type { CorrectionsHistoryEntry } from './CorrectionsHistoryList.types';

const ONE: CorrectionsHistoryEntry[] = [
  {
    correctionId: '11111111-1111-4111-8111-111111111111',
    correctedAt: '2026-05-14T10:23:00.000Z',
    correctedByUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    reason: 'Recount tras inventario físico',
    fieldsChanged: 2,
  },
];

const MULTIPLE: CorrectionsHistoryEntry[] = [
  ...ONE,
  {
    correctionId: '22222222-2222-4222-8222-222222222222',
    correctedAt: '2026-05-15T09:14:00.000Z',
    correctedByUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    reason: null,
    fieldsChanged: 1,
  },
  {
    correctionId: '33333333-3333-4333-8333-333333333333',
    correctedAt: '2026-05-15T11:50:00.000Z',
    correctedByUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    reason:
      'Corrección retroactiva al detectar discrepancia en la cantidad recibida después de re-pesar el palé en la zona de recepción esta mañana',
    fieldsChanged: 3,
  },
];

const meta: Meta<typeof CorrectionsHistoryList> = {
  title: 'photo-ingest/CorrectionsHistoryList',
  component: CorrectionsHistoryList,
};
export default meta;
type Story = StoryObj<typeof CorrectionsHistoryList>;

export const Empty: Story = {
  args: { entries: [] },
};

export const SingleEntry: Story = {
  args: { entries: ONE },
};

export const MultipleEntries: Story = {
  args: { entries: MULTIPLE },
};
