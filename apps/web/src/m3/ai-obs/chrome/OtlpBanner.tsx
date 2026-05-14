import type { OtlpExporter } from '../api/aiObs.types';

interface OtlpBannerProps {
  exporter: OtlpExporter;
}

/**
 * j8 chrome #4 — sticky-feel footer banner showing the active OTLP
 * exporter endpoint. Per ADR-WIDGET-CATALOGUE, always renders so the
 * operator knows where telemetry is going. Links point to existing
 * Owner settings pages — no new settings surface introduced here.
 */
export function OtlpBanner({ exporter }: OtlpBannerProps) {
  return (
    <div
      role="region"
      aria-label="OTLP exporter status"
      className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-(--color-border) bg-(--color-surface) px-6 py-3"
      style={{
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        borderLeft: '3px solid var(--color-accent)',
      }}
    >
      <div>
        <div
          className="text-xs uppercase tracking-wider text-(--color-mute)"
          style={{ color: 'var(--color-mute)' }}
        >
          OTLP integration
        </div>
        <div className="mt-0.5 text-sm">
          <strong>Exporter {exporter.status === 'active' ? 'activo' : exporter.status}</strong>{' '}
          → {exporter.endpoint} · todos los spans{' '}
          <code className="font-mono text-xs">gen_ai.*</code> se stream-ean también ahí.
        </div>
      </div>
      <div className="flex gap-2">
        <a
          href="/owner-settings#otlp"
          className="inline-flex h-9 items-center px-4 text-sm text-(--color-accent-press) underline-offset-2 hover:underline"
          style={{ color: 'var(--color-accent-press)' }}
        >
          Ver configuración →
        </a>
        <a
          href="/owner-settings#otlp"
          className="inline-flex h-9 items-center px-4 text-sm text-(--color-accent-press) underline-offset-2 hover:underline"
          style={{ color: 'var(--color-accent-press)' }}
        >
          Cambiar endpoint
        </a>
      </div>
    </div>
  );
}
