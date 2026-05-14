import { cn } from '../../lib/cn';
import type { RecipientListProps } from './RecipientList.types';

/**
 * J7 region #5 — re-dispatch picker.
 *
 * Per j7.md edge case "Re-dispatch to a subset of recipients": this is
 * an inline picker (NOT a modal) with checkboxes + optional Marcar
 * todos ghost + a confirm pill. The host owns the redispatch handler.
 */
export function RecipientList({
  entries,
  selected,
  onChange,
  selectAllLabel = 'Marcar todos',
  confirmButton,
  className,
}: RecipientListProps) {
  const allSelected =
    entries.length > 0 && entries.every((e) => selected.includes(e.address));

  const toggle = (addr: string, on: boolean): void => {
    const next = on
      ? Array.from(new Set([...selected, addr]))
      : selected.filter((s) => s !== addr);
    onChange(next);
  };

  const toggleAll = (): void => {
    onChange(allSelected ? [] : entries.map((e) => e.address));
  };

  return (
    <section
      role="region"
      aria-label="Destinatarios"
      className={cn(
        'rounded-lg border px-4 py-3',
        className,
      )}
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
      data-testid="recipient-list"
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs underline-offset-2 hover:underline"
          style={{ color: 'var(--color-mute)' }}
        >
          {selectAllLabel}
        </button>
        <span className="text-xs" style={{ color: 'var(--color-mute)' }}>
          {selected.length} / {entries.length}
        </span>
      </div>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.address} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(entry.address)}
              onChange={(e) => toggle(entry.address, e.target.checked)}
              id={`recipient-${entry.address}`}
              data-testid={`recipient-checkbox-${entry.address}`}
            />
            <label
              htmlFor={`recipient-${entry.address}`}
              className="flex-1 font-mono"
              style={{ color: 'var(--color-ink)' }}
            >
              {entry.address}
              {entry.label ? (
                <span
                  className="ml-2 text-xs"
                  style={{ color: 'var(--color-mute)' }}
                >
                  {entry.label}
                </span>
              ) : null}
            </label>
            {entry.lastStatus && (
              <span
                className="text-xs"
                style={{ color: 'var(--color-mute)' }}
              >
                {entry.lastStatus}
              </span>
            )}
          </li>
        ))}
        {entries.length === 0 && (
          <li className="text-sm" style={{ color: 'var(--color-mute)' }}>
            No hay destinatarios disponibles.
          </li>
        )}
      </ul>
      {confirmButton && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={confirmButton.onClick}
            disabled={confirmButton.disabled || selected.length === 0}
            data-variant="recipient-confirm"
            className="rounded-pill px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-accent-fg)',
              border: '1px solid var(--color-accent)',
            }}
          >
            {confirmButton.label}
          </button>
        </div>
      )}
    </section>
  );
}
