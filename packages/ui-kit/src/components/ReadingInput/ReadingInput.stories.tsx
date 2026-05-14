import type { Meta, StoryObj } from '@storybook/react';
import { ReadingInput } from './ReadingInput';

const meta: Meta<typeof ReadingInput> = {
  title: 'HACCP/ReadingInput',
  component: ReadingInput,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'j10 region #3 — primary reading input. Variants chosen at render time from the CCP `inputType` (FSMS standard config).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const NumericEmpty: Story = {
  args: {
    inputType: 'numeric',
    value: '',
    onChange: () => {},
    unit: '°C',
    placeholder: '-2 a 2',
    'aria-label': 'Valor de la lectura en grados Celsius',
  },
};

export const NumericFilled: Story = {
  args: {
    inputType: 'numeric',
    value: '1.2',
    onChange: () => {},
    unit: '°C',
    'aria-label': 'Valor de la lectura en grados Celsius',
  },
};

export const CheckboxClean: Story = {
  args: { inputType: 'checkbox', value: true, onChange: () => {} },
};

export const CheckboxNotClean: Story = {
  args: { inputType: 'checkbox', value: false, onChange: () => {} },
};

export const MultiSelectAllergens: Story = {
  args: {
    inputType: 'multi-select',
    value: ['gluten'],
    options: [
      { id: 'gluten', label: 'Gluten' },
      { id: 'leche', label: 'Leche' },
      { id: 'huevo', label: 'Huevo' },
      { id: 'sesamo', label: 'Sésamo' },
    ],
    onChange: () => {},
  },
};
