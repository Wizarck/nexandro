import { cn } from '../../lib/cn';
import type { AiProvenanceChipProps } from './AiProvenanceChip.types';

/**
 * j12 AiProvenanceChip (slice #17b m3-photo-ingest-review-ui).
 *
 * EU AI Act Article 13 transparency (FR41). The chip surfaces:
 *   Modelo: {modelVersion} · prompt v{promptVersion} ·
 *   confianza global {overallConfidence} · audit_log {auditLogId} →
 *
 * Per j12 §EU AI Act provenance chip: operators (and downstream
 * regulators reading audit_log) MUST be able to identify what produced
 * the output. Burying it in metadata would meet the letter but miss
 * the spirit; the chip is visible per item.
 */
export function AiProvenanceChip({
  modelVersion,
  promptVersion,
  overallConfidence,
  auditLogId,
  onOpenAuditLog,
  className,
}: AiProvenanceChipProps) {
  const confidenceText = overallConfidence.toFixed(2);
  const handleClick = () => onOpenAuditLog?.(auditLogId);
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!onOpenAuditLog}
      aria-label={`Procedencia AI: modelo ${modelVersion}, prompt v${promptVersion}, confianza global ${confidenceText}, audit log ${auditLogId}`}
      data-component="ai-provenance-chip"
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        onOpenAuditLog ? 'cursor-pointer underline-offset-2 hover:underline' : '',
        className,
      )}
      style={{
        color: 'var(--color-mute)',
        background: 'transparent',
        border: 'none',
        padding: 0,
      }}
    >
      Modelo: {modelVersion} · prompt v{promptVersion} · confianza global{' '}
      {confidenceText} · audit_log {auditLogId} →
    </button>
  );
}
