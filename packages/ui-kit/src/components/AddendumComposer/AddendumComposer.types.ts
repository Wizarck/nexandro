export interface AddendumAttachmentInput {
  /** File-input File reference; the host converts to base64 before submit. */
  file: File;
}

export interface AddendumComposerProps {
  /** Maximum text length (defaults to 10 000). */
  maxLength?: number;
  /** Confirm pill label (defaults to 'Adjuntar al expediente'). */
  confirmLabel?: string;
  /** Toggle label that opens the composer (defaults to 'Añadir adenda'). */
  toggleLabel?: string;
  /** When true, the composer is in a busy / submitting state. */
  busy?: boolean;
  /** Fired on confirm with the captured text + attachments. */
  onSubmit: (input: {
    text: string;
    attachments: AddendumAttachmentInput[];
  }) => void;
  className?: string;
}

export interface AddendumComposerState {
  open: boolean;
  text: string;
  attachments: AddendumAttachmentInput[];
  attached: boolean;
}
