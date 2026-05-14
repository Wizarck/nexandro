import { cn } from '../../lib/cn';
import type { CorrectiveActionPickerProps } from './CorrectiveActionPicker.types';

/**
 * j10 region #5 — corrective-action picker (slice #10 m3-haccp-ui).
 *
 * Mounts inline below the spec-range readback when the reading is
 * out-of-spec. Per ADR-J10-CORRECTIVE-ACTION-IS-A-GATE (design.md):
 *  - the parent component decides mount (this component does NOT
 *    self-gate on a status prop),
 *  - the primary CTA stays disabled until `selectedActionId != null`,
 *  - the override path (`<details>` "Razón documentada sin corrective")
 *    is rendered for visual parity with the j10 mock but is inert in
 *    this slice; Owner-approval surface lands in M3.x.
 */
export function CorrectiveActionPicker({
  actions,
  selectedActionId,
  onSelectAction,
  notes,
  onChangeNotes,
  overrideOpen,
  onToggleOverride,
  className,
}: CorrectiveActionPickerProps) {
  return (
    <section
      className={cn('mt-6 rounded-md border p-4', className)}
      style={{
        backgroundColor: 'var(--color-warn-bg)',
        borderColor: 'var(--color-destructive)',
        borderLeftWidth: '3px',
      }}
      aria-label="Acción correctiva requerida"
      data-component="corrective-action-picker"
    >
      <p
        className="text-xs"
        style={{ color: 'var(--color-mute)', marginBottom: '4px' }}
      >
        Esto crea una entrada vinculada en audit_log con tu lectura como
        contexto.
      </p>
      <label
        htmlFor="corrective-action-select"
        className="block text-sm font-medium"
        style={{ color: 'var(--color-mute)', marginBottom: '8px' }}
      >
        Acción correctiva (FR12)
      </label>
      <select
        id="corrective-action-select"
        value={selectedActionId ?? ''}
        onChange={(e) =>
          onSelectAction(e.target.value === '' ? null : e.target.value)
        }
        className="w-full rounded-md border px-3 text-base"
        style={{
          height: '48px',
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-ink)',
        }}
      >
        <option value="">— Selecciona acción —</option>
        {actions.map((action) => (
          <option key={action.id} value={action.id}>
            {action.label}
          </option>
        ))}
      </select>
      <textarea
        value={notes}
        onChange={(e) => onChangeNotes(e.target.value)}
        placeholder="Notas opcionales: contexto, producto afectado, hora de la acción…"
        aria-label="Notas de la acción correctiva"
        className="mt-2 w-full rounded-md border p-3 text-base"
        style={{
          minHeight: '80px',
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-ink)',
          resize: 'vertical',
        }}
      />
      <details
        className="mt-3 border-t border-dashed pt-3 text-xs"
        style={{ borderColor: 'var(--color-border)' }}
        open={overrideOpen ?? false}
        onToggle={(e) => {
          if (onToggleOverride) {
            onToggleOverride((e.target as HTMLDetailsElement).open);
          }
        }}
      >
        <summary
          className="cursor-pointer"
          style={{ color: 'var(--color-mute)' }}
        >
          ¿Razón documentada sin corrective? (ej. defrost programado)
        </summary>
        <div
          className="mt-2 rounded-md border p-2"
          style={{
            backgroundColor: 'var(--color-bg)',
            borderColor: 'var(--color-border)',
          }}
        >
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="haccp-override"
              disabled
              style={{ marginTop: '2px' }}
            />
            <span>
              Override "out-of-spec" sin corrective · requiere razón +
              aprobación Owner
            </span>
          </label>
        </div>
      </details>
    </section>
  );
}
