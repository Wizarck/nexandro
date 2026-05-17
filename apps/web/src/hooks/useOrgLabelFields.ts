import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LabelFieldsFormValues } from '@nexandro/ui-kit';
import { ApiError } from '../api/client';
import { getOrgLabelFields, putOrgLabelFields } from '../api/orgLabelFields';

const STALE_5_MIN = 5 * 60 * 1000;

/** GET /organizations/:id/label-fields. Owner+Manager. */
export function useOrgLabelFieldsQuery(organizationId: string | undefined) {
  return useQuery<LabelFieldsFormValues, ApiError>({
    queryKey: ['org-label-fields', organizationId],
    queryFn: () => {
      if (!organizationId) throw new Error('organizationId required');
      return getOrgLabelFields(organizationId);
    },
    enabled: !!organizationId,
    staleTime: STALE_5_MIN,
  });
}

/**
 * PUT /organizations/:id/label-fields. Owner only.
 *
 * On success, invalidates the matching query so the form re-fetches the
 * canonical persisted shape (defensive against any server-side coercion).
 */
export function useOrgLabelFieldsMutation(organizationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<LabelFieldsFormValues, ApiError, LabelFieldsFormValues>({
    mutationFn: (values) => {
      if (!organizationId) throw new Error('organizationId required');
      return putOrgLabelFields(organizationId, values);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-label-fields', organizationId] });
    },
  });
}
