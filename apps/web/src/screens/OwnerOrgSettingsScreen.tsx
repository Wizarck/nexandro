import { useEffect, useState } from 'react';
import {
  LabelFieldsForm,
  RoleGuard,
  type LabelFieldsFormErrors,
  type LabelFieldsFormValues,
} from '@nexandro/ui-kit';
import { ApiError } from '../api/client';
import { useCurrentOrgId, useCurrentRole } from '../lib/currentUser';
import { useOrgLabelFieldsMutation, useOrgLabelFieldsQuery } from '../hooks/useOrgLabelFields';

/**
 * Owner-only settings screen for `organizations.label_fields` (Wave 1.6).
 * Wraps `<LabelFieldsForm>` in a `<RoleGuard role="OWNER">`. The server
 * `@Roles('OWNER')` decorator on the underlying PUT endpoint remains the
 * authoritative permission gate (per ADR-006); the role guard here is a
 * UX optimisation that prevents non-Owners from triggering the GET fetch.
 */
export function OwnerOrgSettingsScreen() {
  const currentRole = useCurrentRole();
  const orgId = useCurrentOrgId();

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <h2 className="mb-4 text-2xl font-semibold text-ink">Configuración de etiquetas</h2>
      <RoleGuard role="OWNER" currentRole={currentRole} fallback={<AccessDenied />}>
        {orgId ? <Inner orgId={orgId} /> : <SignedOut />}
      </RoleGuard>
    </div>
  );
}

function Inner({ orgId }: { orgId: string }) {
  const query = useOrgLabelFieldsQuery(orgId);
  const mutation = useOrgLabelFieldsMutation(orgId);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (mutation.isSuccess) {
      setSavedAt(Date.now());
      const t = setTimeout(() => setSavedAt(null), 3000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [mutation.isSuccess]);

  const onSubmit = (values: LabelFieldsFormValues) => {
    mutation.mutate(values);
  };

  if (query.isPending) {
    return <p className="text-sm text-mute">Cargando configuración…</p>;
  }
  if (query.error) {
    return <p className="text-sm text-(--color-danger-fg)">Error al cargar: {query.error.message}</p>;
  }

  const errors = errorsFromApiResponse(mutation.error);

  return (
    <>
      <LabelFieldsForm
        initialValues={query.data}
        onSubmit={onSubmit}
        submitting={mutation.isPending}
        errors={errors}
      />
      {savedAt !== null && (
        <p role="status" className="mt-4 text-sm text-(--color-success-fg)">
          ✓ Configuración guardada
        </p>
      )}
    </>
  );
}

function AccessDenied() {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6 text-mute">
      <p className="font-medium">Solo el Owner puede modificar la configuración de etiquetas.</p>
      <p className="mt-1 text-xs">Si crees que esto es un error, contacta con el administrador del sistema.</p>
    </div>
  );
}

function SignedOut() {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6 text-mute">
      <p>Inicia sesión para gestionar tu configuración.</p>
    </div>
  );
}

/**
 * Maps an `ApiError.body.errors` (apps/api 422 shape) into the form's
 * `errors` prop. Returns an empty object for non-422 / unknown shapes —
 * the screen surfaces the message at the form level instead.
 */
function errorsFromApiResponse(err: ApiError | null): LabelFieldsFormErrors | undefined {
  if (!err || err.status !== 422 || !err.body || typeof err.body !== 'object') return undefined;
  const body = err.body as { errors?: Record<string, string> };
  return body.errors ?? undefined;
}
