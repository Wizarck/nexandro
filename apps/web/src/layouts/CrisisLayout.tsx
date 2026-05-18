import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * J6 crisis layout per j6.md §28+§82 "The crisis surface is exempt from
 * the standard top-nav".
 *
 * Routes that begin `/recall/investigate*` mount on this shell — no header,
 * no sidebar, no global notifications. The shell is the whole viewport so
 * the operator's eye lands on the one decision in front of them.
 *
 * Anatomy:
 *   - 4 px `--destructive` (paprika) top rule
 *   - OPTIONAL eyebrow header: "Investigación de incidente · HH:MM CEST ·
 *     ventana legal HH:MM:SS" with live tabular-nums countdown
 *   - children (`<main>`)
 *   - footer eyebrow `Reg. (CE) 178/2002 art. 19 · plazo 4 h`
 *
 * The countdown defaults to mount-time + 4h (when no real incident is
 * being tracked yet — e.g. the search-only landing surface). Pass
 * `showHeader={false}` from screens that render their own countdown
 * (RecallInvestigateJ6Screen has its own via useCountdownToDeadline).
 *
 * Other M3 surfaces (J7, J8, …) use the standard AppLayout.
 */

interface CrisisLayoutProps {
  children: ReactNode;
  /** Render the eyebrow header + countdown. Defaults to true. */
  showHeader?: boolean;
}

const WINDOW_MS = 4 * 60 * 60 * 1000;

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatClock(d: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Madrid',
  }).format(d);
}

export function CrisisLayout({ children, showHeader = true }: CrisisLayoutProps) {
  const openedAt = useMemo(() => Date.now(), []);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!showHeader) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [showHeader]);

  const remaining = openedAt + WINDOW_MS - now;
  const isOverdue = remaining <= 0;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-ink)',
      }}
      data-testid="crisis-layout"
    >
      {/* 4 px paprika top rule */}
      <div
        aria-hidden
        style={{
          height: '4px',
          backgroundColor: 'var(--color-destructive)',
        }}
      />

      {/* Eyebrow header + countdown + exit link.
          Master feedback 2026-05-18: the surface had no way out. j6.md §28
          says "exempt from top-nav" (the operator's eye must land on the
          one decision), but "exempt from nav" ≠ "no exit". A single
          discreet "Salir" link on the left preserves focus while letting
          the operator back out when the surface was opened by mistake or
          when the incident is resolved. */}
      {showHeader && (
        <header
          role="banner"
          className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-border px-4 py-2 sm:px-6"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <Link
            to="/owner-dashboard"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-mute hover:bg-(--color-bg) hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            aria-label="Salir del modo crisis y volver al panel"
            title="Salir del modo crisis"
          >
            <ArrowLeft aria-hidden="true" size={14} />
            <span className="hidden sm:inline">Salir</span>
          </Link>
          <p
            className="text-center text-xs uppercase tracking-[0.08em]"
            style={{ color: 'var(--color-mute)' }}
          >
            <span>Investigación de incidente</span>
            <span aria-hidden="true"> · </span>
            <span className="hidden sm:inline">{formatClock(new Date(now))} CEST</span>
            <span aria-hidden="true" className="hidden sm:inline"> · </span>
            <span>
              ventana legal{' '}
              <strong
                className="font-mono tabular-nums text-sm font-bold"
                style={{
                  color: 'var(--color-destructive)',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0',
                  marginLeft: '0.25rem',
                }}
                aria-label={
                  isOverdue
                    ? 'Ventana legal expirada'
                    : `Tiempo restante ${formatCountdown(remaining)}`
                }
              >
                {formatCountdown(remaining)}
              </strong>
            </span>
          </p>
          {/* Empty cell to balance the grid. */}
          <span aria-hidden="true" />
        </header>
      )}

      <main className="flex-1 px-4 py-3 pb-24">{children}</main>

      {/* Regulation footer — defensible by inspector / lawyer */}
      <footer
        role="contentinfo"
        className="border-t border-border px-6 py-2"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <p
          className="text-center text-[10px] uppercase tracking-[0.08em]"
          style={{ color: 'var(--color-mute)' }}
        >
          Reg. (CE) 178/2002 art. 19 · plazo 4 h
        </p>
      </footer>
    </div>
  );
}
