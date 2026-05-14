import type { ReactNode } from 'react';

/**
 * J7 region #4 — `DossierPreview`. Renders the as-dispatched PDF
 * inline (no edit affordances) plus a plain-text fallback for
 * browsers that block embedded PDFs.
 */
export interface DossierPreviewProps {
  /** URL to the PDF (e.g. `/api/m3/recall/incidents/:id/dossier.pdf?organizationId=…`). */
  pdfUrl: string;
  /** Visible dossier identifier (incident code). */
  incidentCode: string;
  /** Timestamp the dossier was first dispatched. */
  dispatchedAt: string;
  /** When true the iframe stays hidden; falls back to plainTextFallback. */
  forceFallback?: boolean;
  /** Plain-text fallback content rendered when the iframe fails (or forceFallback). */
  plainTextFallback?: ReactNode;
  /** Width/height hints — defaults match the j7 mock. */
  height?: number | string;
  className?: string;
}
