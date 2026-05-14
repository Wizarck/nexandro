import type { Meta, StoryObj } from '@storybook/react';
import { CorrectiveActionPicker } from './CorrectiveActionPicker';

const ACTIONS = [
  { id: 'a-recool', label: 'Re-enfriar producto en cámara secundaria' },
  { id: 'a-discard', label: 'Descartar producto + revisar refrigeración' },
  { id: 'a-isolate', label: 'Alertar Manager y aislar lote' },
  { id: 'a-other', label: 'Otra (especificar en notas)' },
];

const meta: Meta<typeof CorrectiveActionPicker> = {
  title: 'HACCP/CorrectiveActionPicker',
  component: CorrectiveActionPicker,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'j10 region #5 — mounts inline below the readback when the reading is out-of-spec. Parent controls the mount.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    actions: ACTIONS,
    selectedActionId: null,
    onSelectAction: () => {},
    notes: '',
    onChangeNotes: () => {},
  },
};

export const WithSelection: Story = {
  args: {
    actions: ACTIONS,
    selectedActionId: 'a-recool',
    onSelectAction: () => {},
    notes: 'Lote 0518 trasladado a cámara secundaria a las 15:33.',
    onChangeNotes: () => {},
  },
};
