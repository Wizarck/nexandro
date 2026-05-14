import { useState } from 'react';
import { cn } from '../../lib/cn';
import type {
  AddendumAttachmentInput,
  AddendumComposerProps,
} from './AddendumComposer.types';

/**
 * J7 region #6 — `AddendumComposer`.
 *
 * Per j7.md "Addenda are immutable once attached": after the operator
 * confirms, the textarea is disabled, the file input disappears, and a
 * mute "Adjuntada" eyebrow replaces the confirm pill. The post-confirm
 * state cannot be reversed in-component — a fresh addendum is a fresh
 * mount.
 *
 * The toggle ghost CTA is `--accent` (NOT destructive paprika) per
 * j7.md "Addendum CTA is --accent ghost, not --destructive primary".
 */
export function AddendumComposer({
  maxLength = 10_000,
  confirmLabel = 'Adjuntar al expediente',
  toggleLabel = 'Añadir adenda',
  busy,
  onSubmit,
  className,
}: AddendumComposerProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AddendumAttachmentInput[]>([]);
  const [attached, setAttached] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-variant="addendum-toggle"
        className={cn(
          'rounded-pill px-4 py-2 text-sm font-semibold',
          className,
        )}
        style={{
          backgroundColor: 'transparent',
          color: 'var(--color-mute)',
          border: '1px solid var(--color-accent)',
        }}
      >
        {toggleLabel}
      </button>
    );
  }

  const submit = (): void => {
    if (busy || attached || text.trim().length === 0) return;
    onSubmit({ text, attachments });
    setAttached(true);
  };

  return (
    <form
      className={cn(
        'mt-3 rounded-lg border px-4 py-3 space-y-3',
        className,
      )}
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      data-testid="addendum-composer"
    >
      <label
        className="block text-xs font-semibold tracking-[0.04em]"
        style={{ color: 'var(--color-mute)' }}
        htmlFor="addendum-text"
      >
        Adenda
      </label>
      <textarea
        id="addendum-text"
        value={text}
        maxLength={maxLength}
        disabled={attached || busy}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="w-full rounded-md border px-3 py-2 text-sm"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
          color: 'var(--color-ink)',
        }}
        placeholder="Inspector regional visited, no further action requested."
        data-testid="addendum-textarea"
      />
      {!attached && (
        <div className="flex items-center justify-between gap-2">
          <input
            type="file"
            multiple
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              setAttachments(files.map((file) => ({ file })));
            }}
            className="text-xs"
            data-testid="addendum-file-input"
          />
          <button
            type="submit"
            disabled={busy || text.trim().length === 0}
            data-variant="addendum-confirm"
            className="rounded-pill px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-accent-fg)',
              border: '1px solid var(--color-accent)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      )}
      {attached && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm"
          style={{ color: 'var(--color-mute)' }}
        >
          Adjuntada al expediente. La adenda es inmutable.
        </p>
      )}
    </form>
  );
}
