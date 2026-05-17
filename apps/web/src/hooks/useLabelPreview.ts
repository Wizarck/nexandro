import { useMemo } from 'react';
import type { LabelPreviewLocale } from '@nexandro/ui-kit';

/**
 * Builds the preview URL pointed at the streaming label PDF endpoint. The
 * actual rendering happens on the server; the iframe pulls the PDF on
 * demand. Vite dev proxy rewrites `/api/*` → `apps/api/`.
 */
export function useLabelPreviewUrl(
  organizationId: string | undefined,
  recipeId: string | undefined,
  locale: LabelPreviewLocale,
): string {
  return useMemo(() => {
    if (!organizationId || !recipeId) return 'about:blank';
    const params = new URLSearchParams({ organizationId, locale });
    return `/api/recipes/${recipeId}/label?${params.toString()}`;
  }, [organizationId, recipeId, locale]);
}
