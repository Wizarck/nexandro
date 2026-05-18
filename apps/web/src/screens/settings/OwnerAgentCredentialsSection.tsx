import { useState, type FormEvent } from 'react';
import { KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import {
  useAgentCredentialsQuery,
  useCreateAgentCredentialMutation,
  useDeleteAgentCredentialMutation,
  useRevokeAgentCredentialMutation,
} from '../../hooks/useAgentCredentials';
import type { AgentCredentialResponse, AgentRole } from '../../api/agentCredentials';

/**
 * IA · Sprint 3 Block B — surface for `/agent-credentials/*`.
 *
 * Two cards:
 *
 *   1. **Agentes registrados** (live, backend-wired) — register an Ed25519
 *      public key for an MCP/HTTP agent acting on behalf of the org. This
 *      is what the backend actually does (per ADR-AGENT-CRED-1); it is NOT
 *      "the OpenAI/Anthropic API key picker" the audit brief sketched.
 *
 *   2. **Claves de proveedor LLM** (próximamente) — honest placeholder for
 *      the BYO-key flow. No backend exists yet; merging a fake form here
 *      would be GDPR theater + lie about scope. Followup tracked in the
 *      Block B PR body.
 */
export function OwnerAgentCredentialsSection() {
  return (
    <section className="space-y-6" aria-label="IA y agentes">
      <header>
        <h2 className="font-display text-2xl text-ink">IA y agentes</h2>
        <p className="mt-1 text-sm text-mute">
          Registra los agentes con permiso para escribir en tu organización vía MCP / HTTP, y
          (próximamente) declara tu clave de proveedor LLM.
        </p>
      </header>

      <AgentsCard />
      <LlmProviderCard />
    </section>
  );
}

// ============================================================================
// Card 1 — Agentes registrados (live)
// ============================================================================

function AgentsCard() {
  const query = useAgentCredentialsQuery();
  const [formOpen, setFormOpen] = useState(false);

  return (
    <article className="rounded-lg border border-border-subtle p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">
            <ShieldCheck aria-hidden="true" size={14} className="mr-1 inline" />
            Agentes registrados
          </h3>
          <p className="mt-1 text-xs text-mute">
            Cada agente firma sus peticiones con una clave Ed25519. La clave pública se almacena
            aquí para verificar la firma; tú custodias la privada.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-transparent px-3 py-1.5 text-sm font-medium text-mute transition hover:bg-(--color-bg) focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        >
          {formOpen ? 'Cancelar' : 'Registrar agente'}
        </button>
      </header>

      {formOpen && (
        <NewAgentForm onDone={() => setFormOpen(false)} />
      )}

      {query.isLoading && (
        <p className="mt-4 text-sm text-mute">Cargando agentes…</p>
      )}
      {query.error && (
        <p role="alert" className="mt-4 text-sm text-(--color-danger-fg)">
          No se pudo cargar la lista: {query.error.message}
        </p>
      )}
      {query.data && query.data.length === 0 && !query.isLoading && (
        <p className="mt-4 text-sm text-mute">
          Aún no hay agentes registrados.{' '}
          <span className="text-xs">Estado: <Badge tone="muted">sin configurar</Badge></span>
        </p>
      )}
      {query.data && query.data.length > 0 && (
        <AgentTable rows={query.data} />
      )}
    </article>
  );
}

function AgentTable({ rows }: { rows: AgentCredentialResponse[] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-mute">
            <th className="py-2 pr-3 font-medium">Agente</th>
            <th className="py-2 pr-3 font-medium">Rol</th>
            <th className="py-2 pr-3 font-medium">Estado</th>
            <th className="py-2 pr-3 font-medium">Registrado</th>
            <th className="py-2 pr-3 font-medium text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <AgentRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentRow({ row }: { row: AgentCredentialResponse }) {
  const revoke = useRevokeAgentCredentialMutation();
  const del = useDeleteAgentCredentialMutation();
  const revoked = !!row.revokedAt;

  return (
    <tr className="border-b border-border-subtle last:border-0">
      <td className="py-2 pr-3 font-mono text-ink">{row.agentName}</td>
      <td className="py-2 pr-3 text-mute">{row.role}</td>
      <td className="py-2 pr-3">
        {revoked ? (
          <Badge tone="muted">revocado</Badge>
        ) : (
          <Badge tone="success">activo</Badge>
        )}
      </td>
      <td className="py-2 pr-3 text-xs text-mute">
        {new Intl.DateTimeFormat('es-ES', { dateStyle: 'short' }).format(new Date(row.createdAt))}
      </td>
      <td className="py-2 pr-3 text-right">
        {!revoked && (
          <button
            type="button"
            onClick={() => revoke.mutate(row.id)}
            disabled={revoke.isPending}
            className="mr-2 inline-flex items-center gap-1 text-xs text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
          >
            Revocar
          </button>
        )}
        <button
          type="button"
          aria-label={`Eliminar ${row.agentName}`}
          onClick={() => del.mutate(row.id)}
          disabled={del.isPending}
          className="inline-flex items-center gap-1 text-xs text-(--color-danger-fg) hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
        >
          <Trash2 aria-hidden="true" size={12} />
          Eliminar
        </button>
      </td>
    </tr>
  );
}

function NewAgentForm({ onDone }: { onDone: () => void }) {
  const create = useCreateAgentCredentialMutation();
  const [agentName, setAgentName] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [role, setRole] = useState<AgentRole>('STAFF');

  const canSubmit =
    agentName.trim().length > 0 &&
    publicKey.trim().length > 0 &&
    !create.isPending;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    create.mutate(
      { agentName: agentName.trim(), publicKey: publicKey.trim(), role },
      {
        onSuccess: () => {
          setAgentName('');
          setPublicKey('');
          setRole('STAFF');
          onDone();
        },
      },
    );
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 space-y-3 rounded-md border border-border-subtle bg-(--color-bg) p-4"
      aria-label="Nuevo agente"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="agent-name" className="mb-1 block text-sm font-medium text-mute">
            Nombre del agente
          </label>
          <input
            id="agent-name"
            type="text"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            maxLength={64}
            placeholder="hermes, claude-desktop-arturo…"
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
        </div>
        <div>
          <label htmlFor="agent-role" className="mb-1 block text-sm font-medium text-mute">
            Rol
          </label>
          <select
            id="agent-role"
            value={role}
            onChange={(e) => setRole(e.target.value as AgentRole)}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            <option value="STAFF">STAFF</option>
            <option value="MANAGER">MANAGER</option>
            <option value="OWNER">OWNER</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="agent-pubkey" className="mb-1 block text-sm font-medium text-mute">
          Clave pública (Ed25519, base64 SPKI)
        </label>
        <textarea
          id="agent-pubkey"
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          maxLength={4096}
          rows={3}
          placeholder="MCowBQYDK2VwAyEA…"
          className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        />
        <p className="mt-1 text-xs text-mute">
          Pega aquí la clave pública del agente. La privada nunca toca nexandro.
        </p>
      </div>
      {create.error && (
        <p role="alert" className="text-sm text-(--color-danger-fg)">
          No se pudo registrar: {create.error.message}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
        >
          {create.isPending ? 'Registrando…' : 'Registrar agente'}
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// Card 2 — Claves de proveedor LLM (placeholder, no backend)
// ============================================================================

function LlmProviderCard() {
  return (
    <article className="rounded-lg border border-dashed border-border-subtle p-5 opacity-90">
      <h3 className="text-base font-semibold text-ink">
        <KeyRound aria-hidden="true" size={14} className="mr-1 inline" />
        Claves de proveedor LLM{' '}
        <span className="ml-1 text-xs font-normal italic text-mute">próximamente</span>
      </h3>
      <p className="mt-1 text-xs text-mute">
        nexandro es BYO key (trae tu propia clave): tú decides si tu cocina habla con OpenAI,
        Anthropic, Mistral u otro proveedor. La gestión local de claves aterriza con la siguiente
        slice (no hay backend ni gasto incurrido todavía).
      </p>
      <p className="mt-3 text-sm text-mute">
        Hasta entonces, las claves se configuran a nivel de despliegue (variables de entorno) —
        consulta tu runbook de despliegue o pregunta a tu administrador.
      </p>
      <p className="mt-3 text-xs text-mute">
        Estado: <Badge tone="muted">sin configurar</Badge>
      </p>
    </article>
  );
}

// ============================================================================
// Badge primitive (local — small inline status pill)
// ============================================================================

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'success' | 'muted' | 'danger';
}) {
  const bg =
    tone === 'success'
      ? 'bg-(--color-success-bg) text-(--color-success-fg)'
      : tone === 'danger'
        ? 'bg-(--color-danger-bg) text-(--color-danger-fg)'
        : 'bg-(--color-bg) text-mute';
  return (
    <span
      className={`inline-flex items-center rounded-full border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wide ${bg}`}
    >
      {children}
    </span>
  );
}
