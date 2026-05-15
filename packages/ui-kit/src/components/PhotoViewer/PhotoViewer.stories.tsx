import type { Meta, StoryObj } from '@storybook/react';
import { PhotoViewer } from './PhotoViewer';

const meta: Meta<typeof PhotoViewer> = {
  title: 'PhotoIngest/PhotoViewer',
  component: PhotoViewer,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithBoxes: Story = {
  args: {
    photoUrl: 'https://placehold.co/400x300/png',
    boundingBoxes: [
      { fieldName: 'supplier', x: 20, y: 20, w: 120, h: 24, label: 'Proveedor' },
      { fieldName: 'total', x: 220, y: 220, w: 80, h: 24, label: 'Total' },
    ],
    highlightedField: 'total',
  },
};

export const Fallback: Story = {
  args: {
    photoUrl: null,
    boundingBoxes: [],
    onReupload: () => undefined,
  },
};
