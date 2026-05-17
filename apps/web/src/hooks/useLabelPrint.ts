import { useMutation } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';
import type { LabelPreviewLocale } from '@nexandro/ui-kit';

export interface PrintLabelInput {
  recipeId: string;
  organizationId: string;
  locale: LabelPreviewLocale;
  copies?: number;
  printerId?: string;
}

export interface PrintLabelResponse {
  ok: boolean;
  jobId?: string;
}

interface WriteEnvelope<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

/**
 * Fires `POST /recipes/:id/print` to dispatch the rendered label via the
 * org-configured `printAdapter`. Returns the typed response or surfaces the
 * structured `ApiError` (caller maps it to a `LabelApiError` for inline UI).
 */
export function useLabelPrint() {
  return useMutation<PrintLabelResponse, ApiError, PrintLabelInput>({
    mutationFn: async ({ recipeId, organizationId, locale, copies, printerId }) => {
      const wrap = await api<WriteEnvelope<PrintLabelResponse>>(
        `/recipes/${recipeId}/print`,
        {
          method: 'POST',
          body: JSON.stringify({ organizationId, locale, copies, printerId }),
        },
      );
      return wrap.data;
    },
  });
}
