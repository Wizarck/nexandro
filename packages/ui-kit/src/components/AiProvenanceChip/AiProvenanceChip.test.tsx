import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AiProvenanceChip } from './AiProvenanceChip';

describe('AiProvenanceChip', () => {
  it('renders model + prompt + confidence + audit_log', () => {
    render(
      <AiProvenanceChip
        modelVersion="gpt-oss-vision-72b"
        promptVersion="2.3"
        overallConfidence={0.742}
        auditLogId="AL-2026-189617"
      />,
    );
    const chip = screen.getByRole('button');
    expect(chip.textContent).toContain('gpt-oss-vision-72b');
    expect(chip.textContent).toContain('prompt v2.3');
    expect(chip.textContent).toContain('0.74');
    expect(chip.textContent).toContain('AL-2026-189617');
  });

  it('formats overallConfidence to two decimals', () => {
    render(
      <AiProvenanceChip
        modelVersion="m"
        promptVersion="1"
        overallConfidence={0.6}
        auditLogId="AL-1"
      />,
    );
    expect(screen.getByRole('button').textContent).toContain('0.60');
  });

  it('fires onOpenAuditLog when clicked', () => {
    const onOpenAuditLog = vi.fn();
    render(
      <AiProvenanceChip
        modelVersion="m"
        promptVersion="1"
        overallConfidence={0.74}
        auditLogId="AL-2026-189617"
        onOpenAuditLog={onOpenAuditLog}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onOpenAuditLog).toHaveBeenCalledWith('AL-2026-189617');
  });

  it('disables itself when no onOpenAuditLog handler is provided', () => {
    render(
      <AiProvenanceChip
        modelVersion="m"
        promptVersion="1"
        overallConfidence={0.74}
        auditLogId="AL-1"
      />,
    );
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });
});
