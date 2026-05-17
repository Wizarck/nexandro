import type { LabelData } from './types';

/**
 * Renders a `LabelData` to a PDF Buffer using `@react-pdf/renderer`. Server-
 * side only.
 *
 * Implementation note: both `@react-pdf/renderer` and the `LabelDocument`
 * component are loaded LAZILY via dynamic imports so that simply importing
 * the package barrel does NOT pull `@react-pdf` (an ESM-only transitive
 * dependency tree) into the consumer's module graph. This keeps Jest unit
 * runners in `apps/api/` and `packages/ui-kit/` working without ESM
 * configuration plumbing.
 *
 * Pre-launch external legal review per ADR-019 §Risk gates production
 * exposure of this output via `NEXANDRO_LABELS_PROD_ENABLED`.
 */
export async function renderLabelToPdf(data: LabelData): Promise<Buffer> {
  // Dynamic imports — evaluated only when this function is actually called.
  const [React, renderer, labelComponentModule] = await Promise.all([
    import('react'),
    import('@react-pdf/renderer'),
    import('./components/LabelDocument'),
  ]);
  const element = React.createElement(labelComponentModule.LabelDocument, { data });
  return renderer.renderToBuffer(element as never);
}
