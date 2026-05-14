import type { Meta, StoryObj } from '@storybook/react';
import { CcpPicker } from './CcpPicker';
import type { Ccp } from './CcpPicker.types';

const NOW = Date.now();
const CCPS: Ccp[] = [
  {
    id: 'ccp-1',
    name: 'Cooling curve · cámara entrante',
    fsmsRef: 'FSMS-2026-v2',
    inputType: 'numeric',
    spec: { min: -2, max: 2, unit: '°C' },
    lastReading: { display: '1.5 °C', recordedAt: '2026-05-13T15:28:00Z', actor: 'Carmen' },
    dueBy: new Date(NOW + 30 * 60_000).toISOString(),
  },
  {
    id: 'ccp-2',
    name: 'Hot-hold ensalada',
    fsmsRef: 'FSMS-2026-v2',
    inputType: 'numeric',
    spec: { min: 60, max: 75, unit: '°C' },
    lastReading: { display: '62 °C', recordedAt: '2026-05-13T13:10:00Z', actor: 'Iñaki' },
    dueBy: new Date(NOW + 12 * 60_000).toISOString(),
  },
  {
    id: 'ccp-3',
    name: 'Cleaning · pase pescado',
    fsmsRef: 'FSMS-2026-v2',
    inputType: 'checkbox',
    lastReading: { display: 'Limpio', recordedAt: '2026-05-13T11:45:00Z', actor: 'Mikel' },
  },
];

const meta: Meta<typeof CcpPicker> = {
  title: 'HACCP/CcpPicker',
  component: CcpPicker,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'j10 region #2 — CCP picker. Open list collapses to a one-line summary on selection.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const OpenList: Story = {
  args: { ccps: CCPS, selectedId: null, onSelect: () => {} },
};

export const CollapsedAfterSelection: Story = {
  args: { ccps: CCPS, selectedId: 'ccp-1', onSelect: () => {} },
};

export const WithOverdue: Story = {
  args: {
    ccps: [
      ...CCPS,
      {
        id: 'ccp-4',
        name: 'Refrigeración · cámara saliente',
        fsmsRef: 'FSMS-2026-v2',
        inputType: 'numeric',
        spec: { min: -2, max: 2, unit: '°C' },
        dueBy: new Date(NOW - 90 * 60_000).toISOString(),
      },
    ],
    selectedId: null,
    onSelect: () => {},
  },
};
