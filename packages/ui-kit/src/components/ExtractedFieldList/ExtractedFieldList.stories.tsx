import type { Meta, StoryObj } from '@storybook/react';
import { ExtractedFieldList } from './ExtractedFieldList';
import type { ExtractedField } from './ExtractedFieldList.types';

const TYPICAL: ExtractedField[] = [
  {
    fieldName: 'supplier',
    label: 'Proveedor',
    extractedValue: 'Mercabarna',
    operatorValue: 'Mercabarna',
    confidence: 0.91,
  },
  {
    fieldName: 'albaran',
    label: 'Albarán nº',
    extractedValue: '4471',
    operatorValue: '4471',
    confidence: 0.74,
  },
  {
    fieldName: 'total',
    label: 'Total',
    extractedValue: '',
    operatorValue: '',
    confidence: 0.42,
  },
];

const ALL_REJECT: ExtractedField[] = [
  { ...TYPICAL[0]!, confidence: 0.4, operatorValue: '', extractedValue: '' },
  { ...TYPICAL[1]!, confidence: 0.31, operatorValue: '', extractedValue: '' },
  { ...TYPICAL[2]!, confidence: 0.2 },
];

const meta: Meta<typeof ExtractedFieldList> = {
  title: 'PhotoIngest/ExtractedFieldList',
  component: ExtractedFieldList,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const TypicalMix: Story = {
  args: {
    fields: TYPICAL,
    onFieldChange: () => undefined,
  },
};

export const AllReject: Story = {
  args: {
    fields: ALL_REJECT,
    onFieldChange: () => undefined,
  },
};
