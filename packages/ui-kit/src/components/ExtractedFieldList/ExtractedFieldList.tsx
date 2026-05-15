import { cn } from '../../lib/cn';
import {
  ConfidenceBandBadge,
  deriveBand,
} from '../ConfidenceBandBadge';
import type {
  ExtractedField,
  ExtractedFieldListProps,
} from './ExtractedFieldList.types';

/**
 * j12 ExtractedFieldList (slice #17b m3-photo-ingest-review-ui).
 *
 * Vertical list of fields with the 3 confidence visual variants per
 * ADR-034 + j12 region #4:
 *  - `>= 0.85`: `--success` dot + value in `--ink`.
 *  - `0.60 <= c < 0.85`: `--mute` dot + value + `revisar` ghost.
 *  - `< 0.60`: `--destructive` dot + empty value + destructive border
 *              on the input + `Manual · campo requerido (extracción
 *              rechazada)` mandatory eyebrow.
 *
 * Editing converts the badge to `editado por operador`. The reject-
 * band gate is enforced by the parent screen (CTA disabled when any
 * reject-band `operatorValue` is empty); this component just
 * surfaces the visual cue + accessibility hint.
 *
 * Reciprocal box ↔ field link state is lifted to the screen per
 * ADR-J12-RECIPROCAL-LINK-CLIENT-SIDE. The component receives
 * `highlightedField` + `onFieldHover` and is otherwise dumb.
 */
const REJECT_EYEBROW =
  'Manual · campo requerido (extracción rechazada)';

export function ExtractedFieldList({
  fields,
  onFieldChange,
  highlightedField,
  onFieldHover,
  readOnly = false,
  className,
}: ExtractedFieldListProps) {
  return (
    <ul
      aria-label="Campos extraídos"
      aria-disabled={readOnly ? true : undefined}
      data-readonly={readOnly ? 'true' : 'false'}
      className={cn('flex flex-col gap-3', className)}
    >
      {fields.map((field) => (
        <FieldRow
          key={field.fieldName}
          field={field}
          highlighted={field.fieldName === highlightedField}
          readOnly={readOnly}
          onChange={(v) => onFieldChange(field.fieldName, v)}
          onHover={() => onFieldHover?.(field.fieldName)}
          onLeave={() => onFieldHover?.(null)}
        />
      ))}
    </ul>
  );
}

function FieldRow({
  field,
  highlighted,
  readOnly,
  onChange,
  onHover,
  onLeave,
}: {
  field: ExtractedField;
  highlighted: boolean;
  readOnly: boolean;
  onChange: (value: string) => void;
  onHover: () => void;
  onLeave: () => void;
}) {
  const band = deriveBand(field.confidence);
  const isReject = band === 'reject';
  const edited = field.operatorValue !== field.extractedValue;

  return (
    <li
      data-field-name={field.fieldName}
      data-band={band}
      data-highlighted={highlighted ? 'true' : 'false'}
      onPointerEnter={onHover}
      onPointerLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      className="rounded-md border p-3"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: highlighted
          ? 'var(--color-accent)'
          : 'var(--color-border)',
        borderLeftWidth: highlighted ? '3px' : '1px',
        borderLeftColor: highlighted
          ? 'var(--color-accent)'
          : 'var(--color-border)',
      }}
    >
      {isReject && (
        <div
          className="mb-1 text-xs font-medium"
          style={{ color: 'var(--color-destructive)' }}
        >
          {REJECT_EYEBROW}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`field-${field.fieldName}`}
          className="text-sm font-medium"
          style={{ color: 'var(--color-mute)' }}
        >
          {field.label}
        </label>
        {edited ? (
          <span
            role="status"
            data-band="edited"
            className="rounded-pill border px-2 py-0.5 text-xs"
            style={{
              color: 'var(--color-accent-press)',
              borderColor: 'var(--color-accent)',
              backgroundColor: 'var(--color-accent-soft)',
            }}
          >
            editado por operador
          </span>
        ) : (
          <ConfidenceBandBadge confidence={field.confidence} />
        )}
      </div>
      {readOnly ? (
        <div
          id={`field-${field.fieldName}`}
          role="textbox"
          aria-readonly="true"
          aria-label={field.label}
          className="mt-2 w-full rounded-md border px-2 py-2 text-sm"
          style={{
            color: 'var(--color-ink)',
            backgroundColor: 'var(--color-surface-2)',
            borderColor: 'var(--color-border)',
          }}
        >
          {field.operatorValue || (
            <span style={{ color: 'var(--color-mute)' }}>—</span>
          )}
        </div>
      ) : (
        <input
          id={`field-${field.fieldName}`}
          type="text"
          value={field.operatorValue}
          onChange={(e) => onChange(e.target.value)}
          aria-label={field.label}
          aria-required={isReject ? true : undefined}
          className="mt-2 w-full rounded-md border px-2 py-2 text-sm"
          style={{
            color: 'var(--color-ink)',
            backgroundColor: 'var(--color-bg)',
            borderColor: isReject
              ? 'var(--color-destructive)'
              : 'var(--color-border)',
          }}
        />
      )}
    </li>
  );
}
