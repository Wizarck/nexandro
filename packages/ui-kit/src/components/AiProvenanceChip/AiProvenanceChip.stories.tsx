import type { Meta, StoryObj } from '@storybook/react';
import { AiProvenanceChip } from './AiProvenanceChip';

const meta: Meta<typeof AiProvenanceChip> = {
  title: 'PhotoIngest/AiProvenanceChip',
  component: AiProvenanceChip,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    modelVersion: 'gpt-oss-vision-72b',
    promptVersion: '2.3',
    overallConfidence: 0.74,
    auditLogId: 'AL-2026-189617',
    onOpenAuditLog: () => undefined,
  },
};
