import { cn } from '../../lib/cn';
import type { Ccp, CcpPickerProps } from './CcpPicker.types';

/**
 * j10 region #2 — CCP picker (slice #10 m3-haccp-ui).
 *
 * Two visual states driven by `selectedId`:
 *  - Open list (`selectedId == null`): vertical rows, each a button with
 *    CCP name + last reading + due-by countdown.
 *  - Collapsed (`selectedId != null`): single bordered row with the
 *    selected CCP name + a `cambiar →` button that re-opens the list.
 *
 * Per ADR-J10-CCP-PICKER-COLLAPSES (design.md): once the CCP is chosen,
 * the picker is no longer load-bearing on the surface. Collapsing
 * removes a column from the eye's scan and gives the input + readback
 * more room.
 */
export function CcpPicker({
  ccps,
  selectedId,
  onSelect,
  className,
}: CcpPickerProps) {
  const selected = selectedId
    ? ccps.find((c) => c.id === selectedId) ?? null
    : null;

  if (selected) {
    return (
      <div
        className={cn(
          'mt-4 flex items-center justify-between rounded-md border px-4 py-3 text-sm',
          className,
        )}
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-ink)',
        }}
        data-state="collapsed"
        aria-label="CCP seleccionado"
      >
        <span>{selected.name}</span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="bg-transparent text-sm font-medium"
          style={{ color: 'var(--color-accent-press)' }}
        >
          cambiar →
        </button>
      </div>
    );
  }

  return (
    <ul
      className={cn(
        'mt-4 list-none divide-y rounded-md border p-0',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
      data-state="open"
      aria-label="Lista de PCC del día"
    >
      {ccps.map((ccp) => (
        <CcpRow key={ccp.id} ccp={ccp} onSelect={() => onSelect(ccp.id)} />
      ))}
    </ul>
  );
}

/** Threshold for the amber "due soon" treatment per audit v2 A-2. */
const DUE_SOON_MS = 2 * 60 * 60 * 1000;

function CcpRow({ ccp, onSelect }: { ccp: Ccp; onSelect: () => void }) {
  const now = Date.now();
  const dueAt = ccp.dueBy ? Date.parse(ccp.dueBy) : null;
  const overdue = dueAt != null && dueAt < now;
  const dueSoon = !overdue && dueAt != null && dueAt - now < DUE_SOON_MS;
  const dueLabel = ccp.dueBy ? formatDueBy(ccp.dueBy, overdue) : null;
  const lastReadingAgo = ccp.lastReading?.recordedAt
    ? formatHace(ccp.lastReading.recordedAt)
    : null;

  // Three-state severity (audit v2 A-2): overdue → paprika; due-soon → amber
  // warn-bg; ok → no rule. Carmen's eye picks the right colour in <1s.
  const severityColor = overdue
    ? 'var(--color-destructive)'
    : dueSoon
      ? 'var(--color-status-below-target-fg)'
      : null;
  const severityBg = overdue
    ? 'var(--color-warn-bg)'
    : dueSoon
      ? 'var(--color-warn-bg)'
      : 'transparent';

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="relative flex w-full items-center justify-between bg-transparent py-3 pl-5 pr-4 text-left text-sm"
        style={{
          color: 'var(--color-ink)',
          // Per audit 2026-05-18 L1-2 + v2 A-2: 3 px left-edge severity rule.
          // overdue = paprika, due-soon (≤2h) = amber, ok = transparent.
          borderLeft: overdue
            ? '3px solid var(--color-destructive)'
            : dueSoon
              ? '3px solid var(--color-status-below-target-fg)'
              : '3px solid transparent',
        }}
        data-overdue={overdue ? 'true' : 'false'}
        data-due-soon={dueSoon ? 'true' : 'false'}
        data-ccp-id={ccp.id}
      >
        <span className="flex flex-col">
          <span style={{ color: 'var(--color-ink)' }}>{ccp.name}</span>
          {ccp.lastReading ? (
            <span
              className="mt-1 text-xs"
              style={{ color: 'var(--color-mute)' }}
            >
              Última{lastReadingAgo ? ` ${lastReadingAgo}` : ''}: {ccp.lastReading.display}
              {ccp.lastReading.actor ? ` · ${ccp.lastReading.actor}` : ''}
            </span>
          ) : (
            <span
              className="mt-1 text-xs italic"
              style={{ color: 'var(--color-mute)' }}
            >
              Sin lectura registrada
            </span>
          )}
        </span>
        <span className="ml-3 flex items-center gap-3">
          {dueLabel && (
            <span
              className="rounded-pill border px-2 py-0.5 text-xs font-medium"
              style={{
                borderColor: severityColor ?? 'var(--color-border)',
                color: severityColor ?? 'var(--color-mute)',
                backgroundColor: severityBg,
              }}
            >
              {dueLabel}
            </span>
          )}
          <span
            aria-hidden="true"
            className="text-xs font-medium"
            style={{ color: 'var(--color-accent-press)' }}
          >
            Registrar →
          </span>
        </span>
      </button>
    </li>
  );
}

function formatDueBy(dueByIso: string, overdue: boolean): string {
  const deltaMs = Date.parse(dueByIso) - Date.now();
  const minutes = Math.round(Math.abs(deltaMs) / 60_000);
  if (overdue) {
    if (minutes < 60) return `Vencido hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    return `Vencido hace ${hours} h`;
  }
  if (minutes < 60) return `Vence en ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `Vence en ${hours} h`;
}

/** "hace 2h 15m" / "hace 18 min" / "hace 3 d". */
function formatHace(iso: string): string {
  const deltaMs = Date.now() - Date.parse(iso);
  if (Number.isNaN(deltaMs) || deltaMs < 0) return '';
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'hace <1 min';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  if (hours < 24) {
    return remainMin > 0 ? `hace ${hours}h ${remainMin}m` : `hace ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}
