export type DispatchReceiptStatus =
  | 'delivered'
  | 'retrying'
  | 'failed'
  | 'pending';

export interface DispatchReceiptRow {
  /** Recipient email address. */
  address: string;
  /** Delivery status — `delivered` is the green path; `failed` shows manual re-send affordance. */
  status: DispatchReceiptStatus;
  /** Provider message id for the regulator audit-trail link. */
  providerMessageId?: string | null;
  /** ISO timestamp when the recipient confirmed. */
  deliveredAt?: string | null;
  /** Attempt number (j7 "intento 2/3"). */
  attempt?: number;
  /** Optional error message for failed rows. */
  errorMessage?: string | null;
  /** Optional `audit_log` row reference (J7 §3 "Original audit_log entry"). */
  auditLogRowRef?: { rowId: string; onClick: () => void };
}

export interface DispatchReceiptCardProps {
  rows: DispatchReceiptRow[];
  /** Optional click handler on a `Reenviar manualmente` ghost link per failed row. */
  onManualResend?: (recipientAddress: string) => void;
  className?: string;
}
