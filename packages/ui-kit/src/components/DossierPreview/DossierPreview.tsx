import { useState } from 'react';
import { cn } from '../../lib/cn';
import type { DossierPreviewProps } from './DossierPreview.types';

/**
 * J7 region #4 — read-only PDF preview.
 *
 * Per j7.md "PDF preview uses the browser's native PDF rendering
 * (`<embed>` or `<iframe>` with `Content-Type: application/pdf`). No
 * third-party PDF viewer JS." On browsers that block embedded PDFs
 * (some mobile Safari configurations), the iframe's `onError` flips
 * `fallbackVisible` and the plain-text rendering replaces it.
 *
 * The preview is read-only by visual treatment: every block carries a
 * mute "Dispatched at …" watermark in the gutter via the eyebrow.
 */
export function DossierPreview({
  pdfUrl,
  incidentCode,
  dispatchedAt,
  forceFallback = false,
  plainTextFallback,
  height = 720,
  className,
}: DossierPreviewProps) {
  const [iframeFailed, setIframeFailed] = useState(false);
  const showFallback = forceFallback || iframeFailed;

  return (
    <section
      role="region"
      aria-label={`Dossier ${incidentCode}`}
      className={cn(
        'rounded-lg border overflow-hidden',
        className,
      )}
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
      data-testid="dossier-preview"
    >
      <header
        className="flex items-center justify-between px-4 py-2 text-xs"
        style={{
          color: 'var(--color-mute)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <span>Dossier {incidentCode}</span>
        <span>Dispatched {dispatchedAt}</span>
      </header>
      {!showFallback ? (
        <iframe
          src={pdfUrl}
          title={`Dossier ${incidentCode}`}
          style={{ width: '100%', height, border: 'none' }}
          onError={() => setIframeFailed(true)}
          data-testid="dossier-preview-iframe"
        />
      ) : (
        <div
          data-testid="dossier-preview-fallback"
          className="px-4 py-3 text-sm"
          style={{ color: 'var(--color-ink)' }}
        >
          {plainTextFallback ?? (
            <p style={{ color: 'var(--color-mute)' }}>
              Vista previa no disponible en este dispositivo. Descarga el PDF
              desde el enlace inferior.
            </p>
          )}
        </div>
      )}
      <footer className="px-4 py-2 text-xs" style={{ color: 'var(--color-mute)' }}>
        <a
          href={pdfUrl}
          download
          className="underline-offset-2 hover:underline"
          style={{ color: 'var(--color-accent)' }}
        >
          Descargar PDF
        </a>
      </footer>
    </section>
  );
}
