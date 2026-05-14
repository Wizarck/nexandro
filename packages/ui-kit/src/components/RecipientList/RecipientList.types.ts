export interface RecipientListEntry {
  /** Recipient email address. Used as the row key. */
  address: string;
  /** Optional label for the row (e.g. supplier role or "Insurer"). */
  label?: string;
  /** Optional last-delivery status used for the inline annotation. */
  lastStatus?: 'delivered' | 'retrying' | 'failed' | 'pending';
}

export interface RecipientListProps {
  /** Full list of candidate recipients (the original dossier list). */
  entries: RecipientListEntry[];
  /** Currently-selected addresses (controlled). */
  selected: string[];
  /** Selection change callback. */
  onChange: (next: string[]) => void;
  /** Optional "Marcar todos" affordance label (defaults to 'Marcar todos'). */
  selectAllLabel?: string;
  /** Optional confirm CTA. */
  confirmButton?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  className?: string;
}
