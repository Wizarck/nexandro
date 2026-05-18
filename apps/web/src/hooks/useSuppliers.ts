import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../api/client';
import {
  createSupplier,
  deactivateSupplier,
  listSuppliers,
  updateSupplier,
  type CreateSupplierPayload,
  type SupplierResponse,
  type UpdateSupplierPayload,
} from '../api/suppliers';

const key = (orgId: string | undefined): readonly unknown[] => ['suppliers', orgId];

export function useSuppliersQuery(orgId: string | undefined) {
  return useQuery<SupplierResponse[], ApiError>({
    queryKey: key(orgId),
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return listSuppliers(orgId);
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useCreateSupplierMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<SupplierResponse, ApiError, Omit<CreateSupplierPayload, 'organizationId'>>({
    mutationFn: (payload) => {
      if (!orgId) throw new Error('orgId required');
      return createSupplier({ ...payload, organizationId: orgId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(orgId) });
    },
  });
}

export function useUpdateSupplierMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<SupplierResponse, ApiError, { id: string; patch: UpdateSupplierPayload }>({
    mutationFn: ({ id, patch }) => updateSupplier(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(orgId) });
    },
  });
}

export function useDeleteSupplierMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<{ id: string }, ApiError, string>({
    mutationFn: deactivateSupplier,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(orgId) });
    },
  });
}
