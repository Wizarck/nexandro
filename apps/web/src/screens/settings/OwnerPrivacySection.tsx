import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Download, KeyRound, ShieldCheck, X } from 'lucide-react';
import { StickySaveBar } from '@nexandro/ui-kit';
import { useCurrentOrgId } from '../../lib/currentUser';
import {
  useCancelDeletionMutation,
  useDpoContactMutation,
  useExportMyDataMutation,
  usePrivacyStateQuery,
  useRetentionPolicyMutation,
  useRotateApiTokenMutation,
  useScheduleDeletionMutation,
  useTwoFactorMutation,
} from '../../hooks/usePrivacy';
import type { DpoContact, PrivacyState } from '../../api/privacy';

/**
 * Privacidad y datos — GDPR legal core (Sprint 2 P4, Phase D).
 *
 * Was: placeholder cards with "Próximamente" tags — flagged as GDPR
 * theater in `docs/audit-2026-05-18-v3-detail-09-settings.md` and
 * blocked EU GA.
 *
 * Now: 5 real cards backed by `/privacy/*`:
 *   - Acceso + Portabilidad (RGPD arts. 15 + 20) → ZIP export.
 *   - Retención editable (3 windows) → StickySaveBar dirty-tracking.
 *   - DPO contact upsert.
 *   - 2FA + API token rotation — honest stubs (R8 dependency).
 *   - Eliminación (art. 17) → confirm-modal + 30d grace + cancel banner.
 *
 * Every state mutation triggers a regulatory `PRIVACY_*` audit envelope
 * server-side. The Owner can see the trail in
 * /audit-log filtered on aggregate_type=organization + eventType prefix.
 */
export function OwnerPrivacySection() {
  const orgId = useCurrentOrgId();
  if (!orgId) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Inicia sesión para gestionar tus datos y derechos RGPD.
      </p>
    );
  }
  return <Content orgId={orgId} />;
}

function Content({ orgId }: { orgId: string }) {
  const query = usePrivacyStateQuery(orgId);

  if (query.isLoading) {
    return <p className="text-sm text-mute">Cargando estado de privacidad…</p>;
  }
  if (query.error) {
    return (
      <p role="alert" className="text-sm text-(--color-danger-fg)">
        No se pudo cargar la sección: {query.error.message}
      </p>
    );
  }
  if (!query.data) return null;

  return (
    <section className="space-y-6" aria-label="Privacidad y datos">
      <header>
        <h2 className="font-display text-2xl text-ink">Privacidad y datos</h2>
        <p className="mt-1 text-sm text-mute">
          Lo que nexandro guarda, cómo configurar la retención, y cómo ejercer tus derechos
          RGPD.
        </p>
      </header>

      <DeletionScheduledBanner orgId={orgId} state={query.data} />

      <RightsExportCard orgId={orgId} />

      <RetentionCard orgId={orgId} state={query.data} />

      <DpoContactCard orgId={orgId} state={query.data} />

      <SecurityCard orgId={orgId} />

      <ReferenceCard />

      <DangerZoneCard orgId={orgId} state={query.data} />
    </section>
  );
}

// ============================================================================
// Acceso + Portabilidad (RGPD arts. 15 + 20)
// ============================================================================

function RightsExportCard({ orgId }: { orgId: string }) {
  const mutation = useExportMyDataMutation(orgId);
  return (
    <article className="rounded-lg border border-border-subtle p-5">
      <h3 className="text-base font-semibold text-ink">Acceso + Portabilidad</h3>
      <p className="mt-1 text-xs text-mute">
        RGPD art. 15 + art. 20 · descarga máquina-legible de todos los datos de tu organización.
      </p>
      <p className="mt-3 text-sm text-ink">
        Recibirás un <code>.zip</code> con tus datos en JSON: organización, usuarios, recetas,
        ingredientes, manifiesto de fotos y el registro de auditoría de los últimos 90 días.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
        >
          <Download aria-hidden="true" size={16} />
          {mutation.isPending ? 'Preparando exportación…' : 'Exportar mis datos'}
        </button>
        {mutation.isSuccess && !mutation.isPending && (
          <span role="status" className="text-sm text-(--color-success-fg)">
            ✓ Descarga lista
          </span>
        )}
        {mutation.error && (
          <span role="alert" className="text-sm text-(--color-danger-fg)">
            Error al preparar el export: {mutation.error.message}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-mute">
        Para un histórico más amplio del registro de auditoría, usa{' '}
        <Link to="/audit-log" className="underline hover:text-ink">
          Auditoría → Exportar CSV
        </Link>
        .
      </p>
    </article>
  );
}

// ============================================================================
// Retención editable (3 windows)
// ============================================================================

/** Hard caps mirror RETENTION_BOUNDS in apps/api/src/privacy/application/privacy.service.ts. */
const RETENTION_BOUNDS = {
  audit_log_days: { min: 365, max: 3650 },
  photos_days: { min: 30, max: 730 },
  m3_review_queue_days: { min: 30, max: 3650 },
} as const;

function RetentionCard({ orgId, state }: { orgId: string; state: PrivacyState }) {
  const mutation = useRetentionPolicyMutation(orgId);

  const [auditDays, setAuditDays] = useState(state.retentionPolicy.audit_log_days);
  const [photosDays, setPhotosDays] = useState(state.retentionPolicy.photos_days);
  const [reviewDays, setReviewDays] = useState(state.retentionPolicy.m3_review_queue_days);

  // Re-sync local state when the server-side state changes (e.g. after save).
  useEffect(() => {
    setAuditDays(state.retentionPolicy.audit_log_days);
    setPhotosDays(state.retentionPolicy.photos_days);
    setReviewDays(state.retentionPolicy.m3_review_queue_days);
  }, [
    state.retentionPolicy.audit_log_days,
    state.retentionPolicy.photos_days,
    state.retentionPolicy.m3_review_queue_days,
  ]);

  const dirty = useMemo(() => {
    return (
      auditDays !== state.retentionPolicy.audit_log_days ||
      photosDays !== state.retentionPolicy.photos_days ||
      reviewDays !== state.retentionPolicy.m3_review_queue_days
    );
  }, [
    auditDays,
    photosDays,
    reviewDays,
    state.retentionPolicy.audit_log_days,
    state.retentionPolicy.photos_days,
    state.retentionPolicy.m3_review_queue_days,
  ]);

  const isValid =
    auditDays >= RETENTION_BOUNDS.audit_log_days.min &&
    auditDays <= RETENTION_BOUNDS.audit_log_days.max &&
    photosDays >= RETENTION_BOUNDS.photos_days.min &&
    photosDays <= RETENTION_BOUNDS.photos_days.max &&
    reviewDays >= RETENTION_BOUNDS.m3_review_queue_days.min &&
    reviewDays <= RETENTION_BOUNDS.m3_review_queue_days.max;

  const persist = () => {
    mutation.mutate({
      audit_log_days: auditDays,
      photos_days: photosDays,
      m3_review_queue_days: reviewDays,
    });
  };

  const discard = () => {
    setAuditDays(state.retentionPolicy.audit_log_days);
    setPhotosDays(state.retentionPolicy.photos_days);
    setReviewDays(state.retentionPolicy.m3_review_queue_days);
  };

  return (
    <article className="rounded-lg border border-border-subtle p-5">
      <h3 className="text-base font-semibold text-ink">Períodos de retención</h3>
      <p className="mt-1 text-xs text-mute">
        Cuántos días conservamos cada clase de dato antes de archivado o eliminación física.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <NumberField
          id="ret-audit"
          label="Registro de auditoría (días)"
          help="Legalmente 7 años por defecto (2555 días). Rango 365 – 3650."
          min={RETENTION_BOUNDS.audit_log_days.min}
          max={RETENTION_BOUNDS.audit_log_days.max}
          value={auditDays}
          onChange={setAuditDays}
        />
        <NumberField
          id="ret-photos"
          label="Fotos (días)"
          help="Por defecto 90. Máximo 2 años (730 días)."
          min={RETENTION_BOUNDS.photos_days.min}
          max={RETENTION_BOUNDS.photos_days.max}
          value={photosDays}
          onChange={setPhotosDays}
        />
        <NumberField
          id="ret-review"
          label="Cola de revisión retroactiva (días)"
          help="Por defecto 365. Rango 30 – 3650."
          min={RETENTION_BOUNDS.m3_review_queue_days.min}
          max={RETENTION_BOUNDS.m3_review_queue_days.max}
          value={reviewDays}
          onChange={setReviewDays}
        />
      </div>

      {!isValid && dirty && (
        <p role="alert" className="mt-3 text-xs text-(--color-danger-fg)">
          Revisa los rangos: los valores fuera de límites no se pueden guardar.
        </p>
      )}

      {mutation.error && (
        <p role="alert" className="mt-3 text-sm text-(--color-danger-fg)">
          No se pudieron guardar los cambios: {mutation.error.message}
        </p>
      )}

      <StickySaveBar
        visible={(dirty && isValid) || mutation.isPending}
        onPrimary={persist}
        onSecondary={discard}
        primaryPending={mutation.isPending}
        message={
          mutation.isSuccess && !dirty
            ? '✓ Cambios guardados'
            : undefined
        }
      />
    </article>
  );
}

function NumberField({
  id,
  label,
  help,
  min,
  max,
  value,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-mute">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(NaN);
            return;
          }
          const parsed = Number.parseInt(raw, 10);
          onChange(Number.isFinite(parsed) ? parsed : NaN);
        }}
        className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
      />
      <p className="mt-1 text-xs text-mute">{help}</p>
    </div>
  );
}

// ============================================================================
// DPO contact
// ============================================================================

function DpoContactCard({ orgId, state }: { orgId: string; state: PrivacyState }) {
  const mutation = useDpoContactMutation(orgId);

  const seeded: DpoContact = state.dpoContact ?? { name: '', email: '', phone: '' };
  const [name, setName] = useState(seeded.name);
  const [email, setEmail] = useState(seeded.email);
  const [phone, setPhone] = useState(seeded.phone ?? '');

  useEffect(() => {
    setName(state.dpoContact?.name ?? '');
    setEmail(state.dpoContact?.email ?? '');
    setPhone(state.dpoContact?.phone ?? '');
  }, [state.dpoContact?.name, state.dpoContact?.email, state.dpoContact?.phone]);

  const dirty =
    name !== (state.dpoContact?.name ?? '') ||
    email !== (state.dpoContact?.email ?? '') ||
    phone !== (state.dpoContact?.phone ?? '');

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const canSave = dirty && name.trim().length > 0 && validEmail;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSave) return;
    mutation.mutate({
      name: name.trim(),
      email: email.trim(),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
    });
  };

  const onClear = () => {
    mutation.mutate(null);
  };

  return (
    <article className="rounded-lg border border-border-subtle p-5">
      <h3 className="text-base font-semibold text-ink">Datos del DPO</h3>
      <p className="mt-1 text-xs text-mute">
        Contacto del Data Protection Officer (RGPD art. 37). Aparecerá en exportes oficiales y
        notificaciones a la AEPD.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3" aria-label="Contacto del DPO">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="dpo-name" className="mb-1 block text-sm font-medium text-mute">
              Nombre
            </label>
            <input
              id="dpo-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            />
          </div>
          <div>
            <label htmlFor="dpo-email" className="mb-1 block text-sm font-medium text-mute">
              Email
            </label>
            <input
              id="dpo-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={320}
              className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            />
          </div>
        </div>
        <div>
          <label htmlFor="dpo-phone" className="mb-1 block text-sm font-medium text-mute">
            Teléfono (opcional)
          </label>
          <input
            id="dpo-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={64}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
        </div>
        {mutation.error && (
          <p role="alert" className="text-sm text-(--color-danger-fg)">
            No se pudo guardar: {mutation.error.message}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!canSave || mutation.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
          >
            {mutation.isPending ? 'Guardando…' : 'Guardar contacto del DPO'}
          </button>
          {state.dpoContact && (
            <button
              type="button"
              onClick={onClear}
              disabled={mutation.isPending}
              className="inline-flex items-center gap-1 text-sm text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            >
              Vaciar
            </button>
          )}
          {mutation.isSuccess && !dirty && (
            <span role="status" className="text-sm text-(--color-success-fg)">
              ✓ Guardado
            </span>
          )}
        </div>
      </form>
    </article>
  );
}

// ============================================================================
// Seguridad de la cuenta — honest R8 stubs
// ============================================================================

function SecurityCard({ orgId }: { orgId: string }) {
  const twoFactor = useTwoFactorMutation();
  const rotate = useRotateApiTokenMutation();
  const maskedToken = useMemo(() => maskToken(orgId), [orgId]);
  return (
    <article className="rounded-lg border border-border-subtle p-5">
      <h3 className="text-base font-semibold text-ink">Seguridad de la cuenta</h3>
      <p className="mt-1 text-xs text-mute">
        2FA y rotación de tokens dependen de R8 (auth real). Surface honesto mientras llega.
      </p>

      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">
              <ShieldCheck aria-hidden="true" size={14} className="mr-1 inline" />
              Autenticación de 2 factores (TOTP)
            </p>
            <p className="mt-0.5 text-xs text-mute">
              {twoFactor.data?.message ?? 'Próximamente con R8 auth.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => twoFactor.mutate()}
            disabled={twoFactor.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-transparent px-3 py-1.5 text-sm font-medium text-mute transition hover:bg-(--color-bg) focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
          >
            {twoFactor.isPending ? 'Consultando…' : 'Activar 2FA'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">
              <KeyRound aria-hidden="true" size={14} className="mr-1 inline" />
              Token API actual
            </p>
            <p className="mt-0.5 font-mono text-xs text-mute">{maskedToken}</p>
            <p className="mt-0.5 text-xs text-mute">
              {rotate.data?.message ?? 'Disponible con R8 auth (próximamente).'}
            </p>
          </div>
          <button
            type="button"
            disabled
            title="Disponible con R8 auth (próximamente)"
            className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-transparent px-3 py-1.5 text-sm font-medium text-mute opacity-60 cursor-not-allowed"
          >
            Rotar token
          </button>
        </div>
      </div>
    </article>
  );
}

function maskToken(orgId: string): string {
  // Display-only token derivation — never used as auth. Keeps the UI
  // honest without inventing a fake token.
  const tail = orgId.slice(-4);
  return `nx_•••••••••••••_${tail}`;
}

// ============================================================================
// Reference + summary cards (read-only)
// ============================================================================

function ReferenceCard() {
  return (
    <div className="space-y-3">
      <article className="rounded-lg border border-border-subtle p-5">
        <h3 className="text-base font-semibold text-ink">Tus derechos RGPD</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
          <li>
            <strong>Acceso + portabilidad (arts. 15 + 20)</strong> · usa la tarjeta de arriba.
          </li>
          <li>
            <strong>Eliminación (art. 17)</strong> · usa la sección «Eliminar organización» al
            final. Plazo de 30 días para arrepentirte.
          </li>
          <li>
            <strong>Rectificación (art. 16)</strong> · todos los registros operativos son
            editables; los registros de auditoría sólo son corregibles vía addendum (preserva la
            trazabilidad).
          </li>
          <li>
            <strong>Oposición / limitación (arts. 18 + 21)</strong> · contacta con tu DPO
            interno; nexandro no realiza profiling automatizado sobre tus clientes finales.
          </li>
        </ul>
      </article>

      <article className="rounded-lg border border-border-subtle p-5">
        <h3 className="text-base font-semibold text-ink">¿Qué guarda nexandro?</h3>
        <p className="mt-2 text-sm text-ink">
          Datos operativos de tu cocina: ingredientes, recetas, lotes, fotos de receiving,
          lecturas HACCP, eventos de auditoría. Identidad de usuarios (email + rol + acciones).
          Ningún dato de cliente final ni datos sensibles de empleados más allá de la firma en
          lecturas HACCP.
        </p>
        <p className="mt-2 text-xs text-mute">
          Detalle completo en{' '}
          <Link to="/audit-log" className="underline hover:text-ink">
            Auditoría
          </Link>
          : cada evento muestra qué datos fueron escritos.
        </p>
      </article>
    </div>
  );
}

// ============================================================================
// Danger zone — schedule deletion + confirm modal
// ============================================================================

function DangerZoneCard({ orgId, state }: { orgId: string; state: PrivacyState }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const schedule = useScheduleDeletionMutation(orgId);

  return (
    <article
      className="rounded-lg border-2 border-(--color-danger-border) p-5"
      style={{ borderColor: 'var(--color-danger-border, #b85b35)' }}
    >
      <h3 className="flex items-center gap-2 text-base font-semibold text-(--color-danger-fg)">
        <AlertTriangle aria-hidden="true" size={16} />
        Eliminar organización
      </h3>
      <p className="mt-1 text-sm text-ink">
        Programa la eliminación física de tu organización y todos sus datos. Hay un plazo de
        gracia de 30 días para cancelar antes de que se ejecute físicamente.
      </p>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={!!state.deletionScheduledAt}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-(--color-danger-bg) px-4 py-2 text-sm font-semibold text-(--color-danger-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
        style={{ backgroundColor: 'var(--color-danger-bg, #f4d2c4)' }}
      >
        Solicitar eliminación
      </button>
      {state.deletionScheduledAt && (
        <p className="mt-3 text-xs text-mute">
          Ya hay una eliminación programada — usa el banner superior para cancelarla.
        </p>
      )}

      {confirmOpen && (
        <ConfirmDeleteModal
          orgName="esta organización"
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            schedule.mutate(undefined, {
              onSuccess: () => setConfirmOpen(false),
            });
          }}
          pending={schedule.isPending}
          error={schedule.error?.message ?? null}
        />
      )}
    </article>
  );
}

function ConfirmDeleteModal({
  orgName,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  orgName: string;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [typed, setTyped] = useState('');
  const canConfirm = typed.trim() === orgName.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border-strong bg-(--color-surface) p-6 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h4
            id="confirm-delete-title"
            className="flex items-center gap-2 text-base font-semibold text-(--color-danger-fg)"
          >
            <AlertTriangle aria-hidden="true" size={16} />
            Confirmar eliminación
          </h4>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
        <p className="mt-3 text-sm text-ink">
          Esta acción programa la eliminación física en 30 días. Para confirmar, escribe{' '}
          <code className="rounded bg-(--color-bg) px-1 py-0.5 text-xs">{orgName}</code> abajo:
        </p>
        <input
          autoFocus
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-label={`Escribe ${orgName} para confirmar`}
          className="mt-3 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-(--color-danger-fg)">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-transparent px-3 py-1.5 text-sm font-medium text-mute transition hover:bg-(--color-bg) focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm || pending}
            className="inline-flex items-center gap-2 rounded-md bg-(--color-danger-fg) px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-danger-fg, #8a3318)' }}
          >
            {pending ? 'Programando…' : 'Programar eliminación'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Scheduled-deletion banner (top of section)
// ============================================================================

function DeletionScheduledBanner({
  orgId,
  state,
}: {
  orgId: string;
  state: PrivacyState;
}) {
  const cancel = useCancelDeletionMutation(orgId);
  if (!state.deletionScheduledAt) return null;

  const scheduledDate = new Date(state.deletionScheduledAt);
  const formatted = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(scheduledDate);

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-(--color-danger-border) bg-(--color-danger-bg) p-4"
      style={{
        borderColor: 'var(--color-danger-border, #b85b35)',
        backgroundColor: 'var(--color-danger-bg, #f4d2c4)',
      }}
    >
      <div className="flex items-start gap-3 text-sm text-(--color-danger-fg)">
        <AlertTriangle aria-hidden="true" size={20} />
        <div>
          <p className="font-semibold">Esta organización se eliminará el {formatted}.</p>
          <p className="mt-0.5 text-xs">
            Cuando pase esa fecha, todos los datos se borran físicamente y no podrás recuperarlos.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => cancel.mutate()}
        disabled={cancel.isPending}
        className="inline-flex items-center gap-1 rounded-md border border-(--color-danger-fg) bg-(--color-surface) px-3 py-1.5 text-sm font-semibold text-(--color-danger-fg) transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
        style={{ borderColor: 'var(--color-danger-fg, #8a3318)' }}
      >
        {cancel.isPending ? 'Cancelando…' : 'Cancelar eliminación'}
      </button>
    </div>
  );
}
