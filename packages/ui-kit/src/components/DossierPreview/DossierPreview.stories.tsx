import type { Meta, StoryObj } from '@storybook/react';
import { DossierPreview } from './DossierPreview';

const meta: Meta<typeof DossierPreview> = {
  title: 'Recall/DossierPreview',
  component: DossierPreview,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    pdfUrl: '/sample-dossier.pdf',
    incidentCode: 'IR-2026-0007',
    dispatchedAt: '2026-05-13T02:21:00Z',
  },
};

export const FallbackOnly: Story = {
  args: {
    pdfUrl: '/sample-dossier.pdf',
    incidentCode: 'IR-2026-0007',
    dispatchedAt: '2026-05-13T02:21:00Z',
    forceFallback: true,
    plainTextFallback: (
      <pre style={{ whiteSpace: 'pre-wrap' }}>
        Cronología del incidente · IR-2026-0007 …
      </pre>
    ),
  },
};
