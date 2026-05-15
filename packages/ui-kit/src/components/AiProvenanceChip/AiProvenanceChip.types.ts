export interface AiProvenanceChipProps {
  modelVersion: string;
  promptVersion: string;
  overallConfidence: number;
  auditLogId: string;
  onOpenAuditLog?: (auditLogId: string) => void;
  className?: string;
}
