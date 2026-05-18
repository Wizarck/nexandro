import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Mail, ShieldCheck, Sparkles } from 'lucide-react';
import {
  useAcceptInvitationMutation,
  useInvitationLookupQuery,
} from '../../hooks/useInvitations';
import type { UserRole } from '../../api/users';

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Propietario',
  MANAGER: 'Encargado',
  STAFF: 'Personal',
};

/**
 * Sprint 4 W2-2b — public landing for an invitee.
 *
 * Mounted OUTSIDE the App layout so there's no top-nav competing with
 * the persona's eye (same treatment as `OnboardingWizard`). The token
 * is the auth — no RoleGuard, no auth check.
 *
 * Flow:
 *   1. Read token from `:token` route param.
 *   2. `GET /users/invitations/lookup?token=...` on mount.
 *      404 → render the "enlace inválido" error state.
 *      200 → render the welcome card with email + org + role + expires.
 *   3. Password + confirm form. Min 8 chars (backend validates the same).
 *   4. `POST /users/invitations/accept` → navigate to `/owner-dashboard`.
 *      Conflicts (already accepted / revoked / expired) get a precise
 *      error message inline; everything else surfaces the API error
 *      string so the persona can copy it for support.
 *
 * Session handoff: the backend returns a placeholder session payload
 * until R8 ships real JWT issuance. For now we just redirect to the
 * dashboard; the demo-time auth (VITE_DEMO_*) keeps Owner-only surfaces
 * accessible without a real session.
 */
export function InvitationAcceptScreen() {
  const { token } = useParams<{ token: string }>();
  return (
    <div
      className="min-h-screen bg-(--color-bg)"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <header className="border-b border-border-strong bg-surface px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <h1 className="text-lg font-semibold text-ink">nexandro · aceptar invitación</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <section className="rounded-lg border border-border-subtle bg-surface p-5 sm:p-8">
          {token ? <Body token={token} /> : <InvalidLinkCard />}
        </section>
      </main>
    </div>
  );
}

function Body({ token }: { token: string }) {
  const lookup = useInvitationLookupQuery(token);

  if (lookup.isLoading) {
    return (
      <p role="status" className="text-sm text-mute">
        Cargando invitación…
      </p>
    );
  }
  if (lookup.error) {
    return <InvalidLinkCard />;
  }
  if (!lookup.data) {
    // Defensive — react-query should never land here with no error + no data.
    return <InvalidLinkCard />;
  }
  return <AcceptForm token={token} lookup={lookup.data} />;
}

function AcceptForm({
  token,
  lookup,
}: {
  token: string;
  lookup: {
    email: string;
    role: UserRole;
    orgName: string;
    invitedByName: string;
    expiresAt: string;
  };
}) {
  const navigate = useNavigate();
  const mutation = useAcceptInvitationMutation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const minLengthOk = password.length >= 8;
  const matches = password.length > 0 && password === confirm;
  const canSubmit = minLengthOk && matches && !mutation.isPending;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate(
      { token, password },
      {
        onSuccess: () => {
          navigate('/owner-dashboard');
        },
      },
    );
  };

  return (
    <div className="space-y-6" aria-label="Aceptar invitación">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--color-accent-soft)">
          <Sparkles aria-hidden="true" size={20} className="text-(--color-accent)" />
        </div>
        <div>
          <h2 className="font-display text-2xl text-ink">
            Bienvenido a {lookup.orgName}
          </h2>
          <p className="mt-1 text-sm text-mute">
            {lookup.invitedByName} te ha invitado a unirte como{' '}
            <strong className="text-ink">{ROLE_LABELS[lookup.role]}</strong>.
          </p>
        </div>
      </div>

      <dl className="grid gap-3 rounded-md border border-border-subtle bg-(--color-bg) p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-mute">
            <Mail aria-hidden="true" size={12} className="mr-1 inline" />
            Email
          </dt>
          <dd className="mt-1 font-mono text-ink">{lookup.email}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-mute">
            <ShieldCheck aria-hidden="true" size={12} className="mr-1 inline" />
            Caduca
          </dt>
          <dd className="mt-1 text-ink">{formatExpiresAt(lookup.expiresAt)}</dd>
        </div>
      </dl>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label htmlFor="accept-password" className="mb-1 block text-sm font-medium text-mute">
            Contraseña (mínimo 8 caracteres)
          </label>
          <input
            id="accept-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            maxLength={200}
            required
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
        </div>
        <div>
          <label htmlFor="accept-confirm" className="mb-1 block text-sm font-medium text-mute">
            Repite la contraseña
          </label>
          <input
            id="accept-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            maxLength={200}
            required
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
          {confirm.length > 0 && !matches && (
            <p className="mt-1 text-xs text-(--color-danger-fg)">
              Las contraseñas no coinciden.
            </p>
          )}
        </div>
        {mutation.error && (
          <p role="alert" className="text-sm text-(--color-danger-fg)">
            {mapAcceptError(mutation.error.message)}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
          >
            {mutation.isPending ? 'Creando cuenta…' : 'Aceptar invitación'}
          </button>
        </div>
      </form>
    </div>
  );
}

function InvalidLinkCard() {
  return (
    <article role="alert" className="space-y-3 text-sm">
      <h2 className="font-display text-xl text-ink">Enlace no válido</h2>
      <p className="text-mute">
        Enlace expirado, revocado o ya usado. Contacta con tu administrador.
      </p>
    </article>
  );
}

function mapAcceptError(message: string): string {
  // The API client surfaces "API 409 on /users/invitations/accept" or
  // "API 404 ...". We map the well-known codes to friendly Spanish copy
  // and fall back to the raw message for everything else (server logs
  // already carry the structured error code).
  if (/40[49]/.test(message)) {
    return 'Enlace expirado, revocado o ya usado. Contacta con tu administrador.';
  }
  if (/400/.test(message)) {
    return 'La contraseña debe tener al menos 8 caracteres.';
  }
  return `No se pudo aceptar la invitación: ${message}`;
}

function formatExpiresAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
