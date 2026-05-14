import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { RecipientList } from './RecipientList';

const meta: Meta<typeof RecipientList> = {
  title: 'Recall/RecipientList',
  component: RecipientList,
};

export default meta;
type Story = StoryObj<typeof meta>;

function Wrapper() {
  const entries = [
    { address: 'info-claims@aseguradora.es', label: 'Aseguradora' },
    { address: 'inspector.regional@sanidad.eu', label: 'Sanidad' },
  ];
  const [selected, setSelected] = useState<string[]>([entries[0].address]);
  return (
    <RecipientList
      entries={entries}
      selected={selected}
      onChange={setSelected}
      confirmButton={{ label: 'Reenviar a seleccionados', onClick: () => undefined }}
    />
  );
}

export const Default: Story = { render: () => <Wrapper /> };
