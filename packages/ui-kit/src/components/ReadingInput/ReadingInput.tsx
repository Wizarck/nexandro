import { cn } from '../../lib/cn';
import type { ReadingInputProps } from './ReadingInput.types';

/**
 * j10 region #3 — type-aware reading input (slice #10 m3-haccp-ui).
 *
 * One component, three variants chosen by `inputType`:
 *  - `numeric` (cooling curve final temp, hot-hold temp, etc): a
 *    decimal-aware `<input type="number">`, 60 px tall, tabular-nums.
 *  - `checkbox` (visual inspection — clean / not-clean): two large
 *    `<button>`s with `aria-pressed`.
 *  - `multi-select` (allergen contamination check): chip list with
 *    single-tap toggle per option.
 *
 * Per ADR-J10-READING-INPUT-IS-TYPE-AWARE (design.md), one component
 * keeps the form layout consistent across CCP variants. Variant is a
 * render-time choice driven by `Ccp.inputType` (FSMS standard config).
 *
 * Touch target heights are above the 48 px standard (60 px numeric,
 * 56 px checkbox/chip) because the operator may have wet/oily hands.
 */
export function ReadingInput(props: ReadingInputProps) {
  if (props.inputType === 'numeric') {
    return <NumericInput {...props} />;
  }
  if (props.inputType === 'checkbox') {
    return <CheckboxInput {...props} />;
  }
  return <MultiSelectInput {...props} />;
}

function NumericInput(
  props: Extract<ReadingInputProps, { inputType: 'numeric' }>,
) {
  const { id, value, onChange, unit, placeholder, className, 'aria-label': ariaLabel } = props;
  return (
    <div
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-md border',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
      data-input-type="numeric"
    >
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-64 border-none bg-transparent px-4 text-center text-2xl font-semibold outline-none tabular-nums"
        style={{
          color: 'var(--color-ink)',
          height: '60px',
          fontVariantNumeric: 'tabular-nums lining-nums',
        }}
      />
      {unit && (
        <span
          className="inline-flex items-center border-l px-4 text-lg font-medium"
          style={{
            backgroundColor: 'var(--color-surface-2)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-mute)',
          }}
        >
          {unit}
        </span>
      )}
    </div>
  );
}

function CheckboxInput(
  props: Extract<ReadingInputProps, { inputType: 'checkbox' }>,
) {
  const { value, onChange, className, 'aria-label': ariaLabel } = props;
  return (
    <div
      role="group"
      aria-label={ariaLabel ?? 'Inspección visual'}
      className={cn('inline-flex items-stretch gap-2', className)}
      data-input-type="checkbox"
    >
      <button
        type="button"
        aria-pressed={value === true}
        onClick={() => onChange(true)}
        className="rounded-md border px-4 text-base font-medium"
        style={{
          height: '56px',
          backgroundColor:
            value === true ? 'var(--color-accent)' : 'var(--color-surface)',
          color:
            value === true ? 'var(--color-accent-fg)' : 'var(--color-ink)',
          borderColor:
            value === true
              ? 'var(--color-accent)'
              : 'var(--color-border)',
        }}
      >
        Limpio
      </button>
      <button
        type="button"
        aria-pressed={value === false}
        onClick={() => onChange(false)}
        className="rounded-md border px-4 text-base font-medium"
        style={{
          height: '56px',
          backgroundColor:
            value === false ? 'var(--color-destructive)' : 'var(--color-surface)',
          color:
            value === false ? 'var(--color-accent-fg)' : 'var(--color-ink)',
          borderColor:
            value === false
              ? 'var(--color-destructive)'
              : 'var(--color-border)',
        }}
      >
        No limpio
      </button>
    </div>
  );
}

function MultiSelectInput(
  props: Extract<ReadingInputProps, { inputType: 'multi-select' }>,
) {
  const { value, options, onChange, className, 'aria-label': ariaLabel } = props;
  const selected = new Set(value);
  const toggle = (id: string) => {
    if (selected.has(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };
  return (
    <div
      role="group"
      aria-label={ariaLabel ?? 'Selecciona alérgenos'}
      className={cn('inline-flex flex-wrap gap-2', className)}
      data-input-type="multi-select"
    >
      {options.map((opt) => {
        const isOn = selected.has(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={isOn}
            onClick={() => toggle(opt.id)}
            className="rounded-pill border px-4 text-sm font-medium"
            style={{
              height: '40px',
              backgroundColor: isOn
                ? 'var(--color-accent-soft)'
                : 'var(--color-surface)',
              color: isOn ? 'var(--color-accent-press)' : 'var(--color-ink)',
              borderColor: isOn
                ? 'var(--color-accent)'
                : 'var(--color-border)',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
