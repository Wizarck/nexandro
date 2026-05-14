/**
 * Local formatting helpers for j8 widgets (slice #20 m3-ai-obs-ui).
 * Spanish locale, tabular-nums-friendly.
 */

const EUR_FORMATTER = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PCT_FORMATTER = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const PCT_INT_FORMATTER = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatEur(value: number): string {
  return EUR_FORMATTER.format(value);
}

export function formatPct(value: number): string {
  return PCT_FORMATTER.format(value);
}

export function formatPctInt(value: number): string {
  return PCT_INT_FORMATTER.format(value);
}

/**
 * Returns "Actualizado hace N min" relative to `dataUpdatedAt`. Uses
 * minute granularity; sub-minute renders as "hace 0 min".
 */
export function formatFreshness(dataUpdatedAt: number, now: number = Date.now()): string {
  const deltaMs = Math.max(0, now - dataUpdatedAt);
  const minutes = Math.floor(deltaMs / 60_000);
  return `Actualizado hace ${minutes} min`;
}

/**
 * Returns a human-readable relative time like "hace 2h" / "hace 14h" /
 * "hace 3d". Spanish locale, minute / hour / day granularity.
 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const deltaMs = Math.max(0, now - t);
  const mins = Math.floor(deltaMs / 60_000);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const HOUR_LABELS = Array.from({ length: 24 }, (_, h) =>
  String(h).padStart(2, '0'),
);
