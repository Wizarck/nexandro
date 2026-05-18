import { useState, type FormEvent } from 'react';
import { Mail, UserPlus } from 'lucide-react';
import { useCurrentOrgId } from '../../lib/currentUser';
import { useInviteUserMutation, useUsersQuery } from '../../hooks/useUsers';
import { USER_ROLES, type UserResponse, type UserRole } from '../../api/users';

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Propietario',
  MANAGER: 'Jefe de cocina',
  STAFF: 'Equipo',
};

/**
 * Equipo · Sprint 3 Block B — backs `/users/*`.
 *
 * Lista de usuarios + alta directa. La auténtica "invitación por email"
 * llega con R8 (auth real); por ahora se genera una contraseña provisional
 * que el Owner comparte fuera de banda y el usuario rota en el primer login.
 * Se avisa explícitamente en la UI para no mentir sobre el alcance.
 */
export function OwnerUsersSection() {
  const orgId = useCurrentOrgId();
  if (!orgId) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Inicia sesión para gestionar el equipo.
      </p>
    );
  }
  return <Content orgId={orgId} />;
}

function Content({ orgId }: { orgId: string }) {
  const query = useUsersQuery(orgId);
  const [formOpen, setFormOpen] = useState(false);
  const [provisional, setProvisional] = useState<{ email: string; password: string } | null>(null);

  return (
    <section className="space-y-6" aria-label="Equipo">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">Equipo</h2>
          <p className="mt-1 text-sm text-mute">
            Quién puede ver y modificar datos de tu cocina. Cada acción queda firmada en el
            registro de auditoría por su autor.
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            <UserPlus aria-hidden="true" size={14} />
            Invitar usuario
          </button>
        )}
      </header>

      {formOpen && (
        <InviteForm
          orgId={orgId}
          onCancel={() => setFormOpen(false)}
          onDone={(result) => {
            setProvisional(result);
            setFormOpen(false);
          }}
        />
      )}

      {provisional && (
        <ProvisionalBanner
          email={provisional.email}
          password={provisional.password}
          onClose={() => setProvisional(null)}
        />
      )}

      {query.isLoading && <p className="text-sm text-mute">Cargando equipo…</p>}
      {query.error && (
        <p role="alert" className="text-sm text-(--color-danger-fg)">
          No se pudo cargar la lista: {query.error.message}
        </p>
      )}
      {query.data && <UsersTable rows={query.data} />}
    </section>
  );
}

function UsersTable({ rows }: { rows: UserResponse[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Aún no hay usuarios. Usa «Invitar usuario» para añadir al primero.
      </p>
    );
  }
  return (
    <article className="rounded-lg border border-border-subtle">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-mute">
              <th className="px-4 py-3 font-medium">
                <Mail aria-hidden="true" size={12} className="mr-1 inline" />
                Email
              </th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3 font-mono text-ink">{row.email}</td>
                <td className="px-4 py-3 text-ink">{row.name}</td>
                <td className="px-4 py-3 text-mute">{ROLE_LABELS[row.role]}</td>
                <td className="px-4 py-3">
                  <span
                    className={[
                      'inline-flex items-center rounded-full border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wide',
                      row.isActive
                        ? 'bg-(--color-success-bg) text-(--color-success-fg)'
                        : 'bg-(--color-bg) text-mute',
                    ].join(' ')}
                  >
                    {row.isActive ? 'activo' : 'inactivo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function InviteForm({
  orgId,
  onCancel,
  onDone,
}: {
  orgId: string;
  onCancel: () => void;
  onDone: (result: { email: string; password: string }) => void;
}) {
  const mutation = useInviteUserMutation(orgId);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('STAFF');
  // Lazy init so the password is generated once per form mount and stays
  // stable through re-renders (the user-visible password must not flicker).
  const [provisionalPassword] = useState<string>(generateProvisionalPassword);

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const canSubmit = name.trim().length > 0 && validEmail && !mutation.isPending;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    const trimmedEmail = email.trim().toLowerCase();
    mutation.mutate(
      {
        name: name.trim(),
        email: trimmedEmail,
        role,
        password: provisionalPassword,
      },
      {
        onSuccess: () => {
          onDone({ email: trimmedEmail, password: provisionalPassword });
          setName('');
          setEmail('');
          setRole('STAFF');
        },
      },
    );
  };

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Invitar usuario"
      className="space-y-3 rounded-lg border border-border-subtle bg-(--color-bg) p-5"
    >
      <h3 className="text-base font-semibold text-ink">Nuevo usuario</h3>
      <p className="text-xs text-mute">
        Mientras llega R8 (auth real), el alta es directa: generamos una contraseña provisional
        que tú compartes con esta persona por canal seguro.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="user-name" className="mb-1 block text-sm font-medium text-mute">
            Nombre
          </label>
          <input
            id="user-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
        </div>
        <div>
          <label htmlFor="user-email" className="mb-1 block text-sm font-medium text-mute">
            Email
          </label>
          <input
            id="user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={320}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
        </div>
      </div>
      <div>
        <label htmlFor="user-role" className="mb-1 block text-sm font-medium text-mute">
          Rol
        </label>
        <select
          id="user-role"
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        >
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {r} · {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      {mutation.error && (
        <p role="alert" className="text-sm text-(--color-danger-fg)">
          No se pudo crear: {mutation.error.message}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-transparent px-3 py-1.5 text-sm font-medium text-mute transition hover:bg-(--color-bg) focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
        >
          {mutation.isPending ? 'Creando…' : 'Crear usuario'}
        </button>
      </div>
    </form>
  );
}

function ProvisionalBanner({
  email,
  password,
  onClose,
}: {
  email: string;
  password: string;
  onClose: () => void;
}) {
  return (
    <article
      role="status"
      className="rounded-lg border border-border-subtle bg-(--color-success-bg) p-4 text-sm text-(--color-success-fg)"
    >
      <p className="font-semibold">Usuario creado para {email}.</p>
      <p className="mt-1 text-ink">
        Comparte la contraseña provisional por canal seguro. Esta es la única vez que la verás:
      </p>
      <p className="mt-2 font-mono text-sm text-ink">{password}</p>
      <button
        type="button"
        onClick={onClose}
        className="mt-3 inline-flex items-center gap-1 text-xs text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
      >
        Entendido, cerrar
      </button>
    </article>
  );
}

// ============================================================================
// Provisional password (8+ chars to satisfy backend MinLength validator)
// ============================================================================

function generateProvisionalPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

