import { cn } from '../../lib/cn';
import type { TransparencyBannerProps } from './TransparencyBanner.types';

/**
 * j9 region #1 (trust banner) — slice #15 m3-appcc-i18n-ui.
 *
 * Static `--mute` italic paragraph carrying the verbatim FR25 trust-
 * principle text. Reusable for every cover-page-contract surface in
 * the future. The text is a const inside this file; consumers cannot
 * override it via props (ADR-J9-TRANSPARENCY-BANNER-IS-VERBATIM).
 *
 * The locked text (Sprint 2 P1-6 — v3 BLOCKER #2): the operator-facing
 * `audit_log` database token is now `registro de auditoría inmutable` per
 * audit 2026-05-18-v3-detail-06. `capítulo 0` is retained verbatim because
 * the inspector reads the cover page in that vocabulary.
 *   "El expediente contiene el registro de auditoría inmutable sin editar
 *    como capítulo 0; el resto son vistas estructuradas sobre ese mismo
 *    registro. No producimos resumen ejecutivo."
 *
 * Marta (APPCC inspector) reads the cover page first; this text must
 * appear on the cover AND on this surface so Iker (operator) and Marta
 * see the contract: the bundle is the raw immutable audit register +
 * derivative views, NOT a curated executive summary. A polished marketing
 * rewrite would be wrong — the inspector wants to be told what they will
 * not get.
 */
export const TRANSPARENCY_BANNER_TEXT =
  'El expediente contiene el registro de auditoría inmutable sin editar como capítulo 0; el resto son vistas estructuradas sobre ese mismo registro. No producimos resumen ejecutivo.';

export function TransparencyBanner({
  className,
}: TransparencyBannerProps = {}) {
  return (
    <div
      role="note"
      className={cn(
        'my-4 rounded-r-md border-l-4 px-5 py-3 text-sm italic',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-surface)',
        borderLeftColor: 'var(--color-accent)',
        color: 'var(--color-mute)',
      }}
      data-component="transparency-banner"
    >
      {TRANSPARENCY_BANNER_TEXT}
    </div>
  );
}
