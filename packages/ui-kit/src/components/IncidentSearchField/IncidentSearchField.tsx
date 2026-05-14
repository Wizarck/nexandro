import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/cn';
import type {
  IncidentSearchFieldProps,
  IncidentSearchHit,
} from './IncidentSearchField.types';

/**
 * Debounce window per j6.md edge case row: "Search runs on every
 * keystroke after 200 ms debounce". Tight enough that the panicked
 * operator with three letters typed sees results immediately on pause,
 * loose enough to spare a network round-trip per keystroke.
 */
const DEBOUNCE_MS = 200;

/**
 * Multi-anchor incident search field for the J6 recall investigation
 * surface (slice #11 m3-incident-search-multi-anchor). Combobox semantics
 * inherited from `IngredientPicker`; the row layout is tailored for the
 * crisis-mode operator (label + supportingText + receivedAt formatted
 * as `relative time`).
 *
 * Per j6.md §2: touch target ≥ 56 px (above the standard 48 px). Padding
 * on the input wrapper achieves this on mobile viewports.
 *
 * Per j6.md §3: results are surfaced by props (this component is
 * presentational); ranking + 8-cap + symptom-match scoring live in
 * `apps/api/src/recall/application/incident-search.service.ts`.
 *
 * The component fires `onSelect(hit)` when the operator commits a
 * selection (mouse click or Enter on the active item). Slice #11
 * partial j6 screen logs the hit to the console; slice #12 pivots the
 * trace tree off the selected hit's id.
 */
export function IncidentSearchField({
  hits,
  onSearch,
  onSelect,
  loading = false,
  placeholder = 'Lote, proveedor, ingrediente, síntoma…',
  emptyStateCopy = 'Sin coincidencias. Refina la búsqueda — o reporta sin lote conocido.',
  value,
  className,
  'aria-label': ariaLabel = 'Incident search',
}: IncidentSearchFieldProps) {
  const listboxId = useId();
  const [internalValue, setInternalValue] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value !== undefined) setInternalValue(value);
  }, [value]);

  function handleChange(next: string) {
    setInternalValue(next);
    setOpen(true);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch(next.trim()), DEBOUNCE_MS);
  }

  function commitSelection(hit: IncidentSearchHit) {
    onSelect(hit);
    setInternalValue(hit.label);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      if (open && activeIndex >= 0 && hits[activeIndex]) {
        e.preventDefault();
        commitSelection(hits[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className={cn('relative w-full', className)}>
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border bg-surface px-3 py-3',
          'border-border focus-within:border-accent',
        )}
        style={{ borderWidth: '1px', borderStyle: 'solid' }}
      >
        <Search aria-hidden="true" size={18} className="text-mute" />
        <input
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 && hits[activeIndex]
              ? `${listboxId}-opt-${kindAndId(hits[activeIndex])}`
              : undefined
          }
          value={internalValue}
          placeholder={placeholder}
          autoFocus
          className="flex-1 bg-transparent text-base text-ink outline-none placeholder:text-mute"
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 100)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={`${ariaLabel} results`}
          className={cn(
            'absolute left-0 right-0 top-full z-10 mt-1 max-h-96 overflow-y-auto',
            'rounded-md border border-border bg-surface shadow-lg',
          )}
          style={{ borderWidth: '1px', borderStyle: 'solid' }}
        >
          {loading ? (
            <li
              className="px-3 py-2 text-sm text-mute"
              role="option"
              aria-selected={false}
            >
              Buscando…
            </li>
          ) : hits.length === 0 ? (
            <li
              className="px-3 py-2 text-sm text-mute"
              role="option"
              aria-selected={false}
              aria-disabled={true}
            >
              {emptyStateCopy}
            </li>
          ) : (
            hits.map((hit, i) => (
              <li
                key={kindAndId(hit)}
                id={`${listboxId}-opt-${kindAndId(hit)}`}
                role="option"
                aria-selected={i === activeIndex}
                className={cn(
                  'cursor-pointer px-3 py-2 text-sm',
                  i === activeIndex
                    ? 'bg-accent-soft text-ink'
                    : 'text-ink hover:bg-surface-2',
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitSelection(hit)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="font-medium"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {hit.label}
                  </span>
                  <span className="text-xs text-mute">
                    {kindLabel(hit.kind)}
                  </span>
                </div>
                {hit.supportingText && (
                  <div className="mt-0.5 text-xs text-mute">
                    {hit.supportingText}
                  </div>
                )}
                {hit.receivedAt && (
                  <div className="mt-0.5 text-xs text-mute">
                    {formatRelative(hit.receivedAt)}
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function kindAndId(hit: IncidentSearchHit): string {
  return `${hit.kind}-${hit.id}`;
}

function kindLabel(kind: IncidentSearchHit['kind']): string {
  switch (kind) {
    case 'lot':
      return 'lote';
    case 'supplier':
      return 'proveedor';
    case 'ingredient':
      return 'ingrediente';
    case 'aggregate':
      return 'evento';
  }
}

/**
 * Natural-language relative time per j6.md §3 ("el martes 09:30" form).
 * `Intl.RelativeTimeFormat` covers the recent-window pivot; longer
 * windows fall back to a short Spanish date.
 *
 * Pure function; safe to call with any ISO timestamp.
 */
function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60_000);
  const fmt = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });
  if (Math.abs(diffMin) < 60) return fmt.format(diffMin, 'minute');
  const diffHour = Math.round(diffMs / 3_600_000);
  if (Math.abs(diffHour) < 24) return fmt.format(diffHour, 'hour');
  const diffDay = Math.round(diffMs / 86_400_000);
  if (Math.abs(diffDay) < 14) return fmt.format(diffDay, 'day');
  return new Intl.DateTimeFormat('es-ES', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
