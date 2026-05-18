import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, MessageCircle, ShieldCheck, Trash2 } from 'lucide-react';
import {
  useAgentCredentialsQuery,
  useCreateAgentCredentialMutation,
  useDeleteAgentCredentialMutation,
  useRevokeAgentCredentialMutation,
} from '../../hooks/useAgentCredentials';
import type { AgentCredentialResponse, AgentRole } from '../../api/agentCredentials';
import {
  useClearLlmCredentialMutation,
  useLlmCredentialsStatus,
  useTestLlmCredentialMutation,
  useUpsertLlmCredentialMutation,
} from '../../hooks/useLlmCredentials';
import { LLM_PROVIDERS, type LlmProvider } from '../../api/llmCredentials';
import { useCurrentOrgId } from '../../lib/currentUser';

/**
 * IA · Sprint 3 Block B + Sprint 4 W2-1b — surface for agent attribution +
 * BYO LLM provider keys.
 *
 * Two cards:
 *
 *   1. **Agentes registrados** (live) — register an Ed25519 public key for
 *      an MCP/HTTP agent acting on behalf of the org per ADR-AGENT-CRED-1.
 *      This is NOT "the OpenAI/Anthropic API key picker".
 *
 *   2. **Claves de proveedor LLM** (live, Sprint 4 W2-1b) — BYO key for
 *      OpenAI / Anthropic / Mistral. The cleartext key NEVER leaves the
 *      PUT request body; the backend encrypts immediately (AES-256-GCM)
 *      and only exposes `{ provider, hasKey, lastTested* }` afterwards.
 */
export function OwnerAgentCredentialsSection() {
  return (
    <section className="space-y-6" aria-label="IA y agentes">
      <header>
        <h2 className="font-display text-2xl text-ink">IA y agentes</h2>
        <p className="mt-1 text-sm text-mute">
          Registra los agentes con permiso para escribir en tu organización vía MCP / HTTP y
          declara tu clave de proveedor LLM (BYO key).
        </p>
      </header>

      <AgentsCard />
      <LlmProviderCard />
      <WhatsappIntegrationCard />
    </section>
  );
}

// ============================================================================
// Card 3 — WhatsApp integration (Sprint 4 W4, skeleton-only)
// ============================================================================
//
// Honest discoverability card for the j5.md WhatsApp recipe-creation
// flow. The backend webhook + persistence ship in this PR; the
// end-to-end flow requires Meta WhatsApp Business API setup (account,
// app review, phone-number registration, secret + token generation)
// which the operator must do outside nexandro. Status reads env-derived
// hints via the BFF (deferred to a follow-up backend endpoint); for
// Sprint 4 W4 we surface the static "no configurada" state pointing at
// the assessment doc.

function WhatsappIntegrationCard() {
  return (
    <article className="rounded-lg border border-border-subtle p-5" aria-label="Integración WhatsApp">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">
            <MessageCircle aria-hidden="true" size={14} className="mr-1 inline" />
            Integración WhatsApp
          </h3>
          <p className="mt-1 text-xs text-mute">
            Permite a tu jefe de cocina enviar mensajes al número de tu organización
            («Risotto de setas, 400g champiñones…») y crear borradores de receta sin
            abrir la tablet. Diseño en{' '}
            <a
              href="https://github.com/Wizarck/nexandro/blob/master/docs/ux/j5.md"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            >
              docs/ux/j5.md
            </a>
            .
          </p>
        </div>
        <span
          className="inline-flex items-center rounded-full border border-border-strong px-2 py-0.5 text-xs font-medium text-mute"
          title="Estado: requiere configuración externa de Meta Business"
        >
          no configurada
        </span>
      </header>

      <div className="mt-4 space-y-3 text-sm text-ink">
        <p>
          La integración requiere configuración externa en Meta Business que <strong>no</strong> se puede
          automatizar desde nexandro:
        </p>
        <ul className="list-disc pl-5 text-xs text-mute space-y-1">
          <li>Cuenta Meta Business + app WhatsApp Business API (revisión por Meta, 1-5 días)</li>
          <li>Número de teléfono registrado y verificado (SMS o llamada)</li>
          <li>URL de webhook con HTTPS válido (nexandro.palafitofood.com sirve)</li>
          <li>Verify token + App secret + Access token (variables de entorno en tu deploy)</li>
        </ul>
        <p className="text-xs text-mute">
          <strong>Coste estimado</strong>: ~€0,01–0,05 por conversación según país (Meta cobra
          por «conversación de 24h», no por mensaje).
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <a
            href="https://github.com/Wizarck/nexandro/blob/master/docs/sprint4-j5-whatsapp-assessment.md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-transparent px-3 py-1.5 text-sm font-medium text-mute transition hover:bg-(--color-bg) focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            Ver runbook de configuración
          </a>
          <a
            href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-transparent px-3 py-1.5 text-sm font-medium text-mute transition hover:bg-(--color-bg) focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            Docs Meta WhatsApp Cloud API
          </a>
        </div>
      </div>
    </article>
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
// Card 2 — Claves de proveedor LLM (Sprint 4 W2-1b, backend-wired)
// ============================================================================

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  mistral: 'Mistral',
};

function LlmProviderCard() {
  const orgId = useCurrentOrgId();
  const status = useLlmCredentialsStatus(orgId);
  const upsert = useUpsertLlmCredentialMutation(orgId);
  const testMutation = useTestLlmCredentialMutation(orgId);
  const clearMutation = useClearLlmCredentialMutation(orgId);

  const [formOpen, setFormOpen] = useState(false);

  if (!orgId) {
    return (
      <article className="rounded-lg border border-border-subtle p-5">
        <h3 className="text-base font-semibold text-ink">
          <KeyRound aria-hidden="true" size={14} className="mr-1 inline" />
          Claves de proveedor LLM
        </h3>
        <p className="mt-3 text-sm text-mute">
          Inicia sesión para configurar tu clave de proveedor LLM.
        </p>
      </article>
    );
  }

  const data = status.data;
  const hasKey = !!data?.hasKey;
  const showForm = formOpen || !hasKey;

  const handleClear = () => {
    if (clearMutation.isPending) return;
    clearMutation.mutate(undefined, {
      onSuccess: () => setFormOpen(false),
    });
  };

  const handleTest = () => {
    if (testMutation.isPending) return;
    testMutation.mutate();
  };

  return (
    <article className="rounded-lg border border-border-subtle p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">
            <KeyRound aria-hidden="true" size={14} className="mr-1 inline" />
            Claves de proveedor LLM
          </h3>
          <p className="mt-1 text-xs text-mute">
            nexandro es BYO key (trae tu propia clave): tú decides si tu cocina habla con OpenAI,
            Anthropic o Mistral. La clave se cifra al persistir (AES-256-GCM) y nunca se devuelve
            en claro.
          </p>
        </div>
        {hasKey && !formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-transparent px-3 py-1.5 text-sm font-medium text-mute transition hover:bg-(--color-bg) focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            Reemplazar
          </button>
        )}
      </header>

      {status.isLoading && (
        <p className="mt-4 text-sm text-mute">Cargando estado de la clave…</p>
      )}
      {status.error && (
        <p role="alert" className="mt-4 text-sm text-(--color-danger-fg)">
          No se pudo cargar el estado: {status.error.message}
        </p>
      )}

      {data && (
        <div className="mt-4 space-y-3">
          <LlmStatusLine status={data} />

          {hasKey && !formOpen && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testMutation.isPending}
                className="inline-flex items-center gap-2 rounded-md border border-border-strong bg-transparent px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-(--color-bg) focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
              >
                {testMutation.isPending ? 'Probando…' : 'Probar conexión'}
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={clearMutation.isPending}
                className="inline-flex items-center gap-1 text-xs text-(--color-danger-fg) hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
              >
                <Trash2 aria-hidden="true" size={12} />
                Eliminar
              </button>
            </div>
          )}

          {showForm && (
            <LlmProviderForm
              initialProvider={data.provider ?? 'openai'}
              isPending={upsert.isPending}
              error={upsert.error}
              onCancel={hasKey ? () => setFormOpen(false) : undefined}
              onSubmit={(payload) =>
                upsert.mutate(payload, {
                  onSuccess: () => setFormOpen(false),
                })
              }
            />
          )}

          {testMutation.data && !showForm && (
            <TestResultLine status={testMutation.data} />
          )}
          {testMutation.error && !showForm && (
            <p role="alert" className="text-sm text-(--color-danger-fg)">
              No se pudo probar: {testMutation.error.message}
            </p>
          )}
          {clearMutation.error && (
            <p role="alert" className="text-sm text-(--color-danger-fg)">
              No se pudo eliminar: {clearMutation.error.message}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function LlmStatusLine({
  status,
}: {
  status: {
    provider: LlmProvider | null;
    hasKey: boolean;
    lastTestedAt: string | null;
    lastTestResult: 'success' | 'failure' | null;
  };
}) {
  if (!status.hasKey) {
    return (
      <p className="text-xs text-mute">
        Estado: <Badge tone="muted">sin configurar</Badge>
      </p>
    );
  }
  const providerLabel = status.provider ? PROVIDER_LABELS[status.provider] : '—';
  const tested = status.lastTestedAt
    ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(
        new Date(status.lastTestedAt),
      )
    : null;
  return (
    <p className="text-xs text-mute">
      <Badge tone="success">configurado</Badge>{' '}
      <span className="ml-1 text-mute">
        {providerLabel}
        {tested ? (
          <>
            {' · '}último test {tested}
            {status.lastTestResult === 'success' ? (
              <span className="ml-1 text-(--color-success-fg)" aria-label="funciona">
                ✓ funciona
              </span>
            ) : status.lastTestResult === 'failure' ? (
              <span className="ml-1 text-(--color-danger-fg)" aria-label="fallo">
                ✗ fallo
              </span>
            ) : null}
          </>
        ) : (
          ' · sin probar todavía'
        )}
      </span>
    </p>
  );
}

function TestResultLine({
  status,
}: {
  status: {
    lastTestResult: 'success' | 'failure' | null;
    lastTestError: string | null;
  };
}) {
  if (status.lastTestResult === 'success') {
    return (
      <p className="text-sm text-(--color-success-fg)">
        <span aria-hidden="true">✓</span> Conexión correcta
      </p>
    );
  }
  if (status.lastTestResult === 'failure') {
    return (
      <p className="text-sm text-(--color-danger-fg)">
        <span aria-hidden="true">✗</span> Falló la conexión
        {status.lastTestError ? (
          <span className="ml-1 text-xs text-mute">({status.lastTestError})</span>
        ) : null}
      </p>
    );
  }
  return null;
}

function LlmProviderForm({
  initialProvider,
  isPending,
  error,
  onSubmit,
  onCancel,
}: {
  initialProvider: LlmProvider;
  isPending: boolean;
  error: { message: string } | null;
  onSubmit: (payload: { provider: LlmProvider; apiKey: string }) => void;
  onCancel?: () => void;
}) {
  const [provider, setProvider] = useState<LlmProvider>(initialProvider);
  const [apiKey, setApiKey] = useState('');
  const [revealed, setRevealed] = useState(false);

  const canSubmit = apiKey.trim().length > 0 && !isPending;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    const trimmed = apiKey.trim();
    onSubmit({ provider, apiKey: trimmed });
    // Drop the cleartext from local state immediately. If the mutation
    // fails the operator must paste again — by design (defence in depth).
    setApiKey('');
    setRevealed(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border border-border-subtle bg-(--color-bg) p-4"
      aria-label="Configurar clave LLM"
    >
      <div>
        <label htmlFor="llm-provider" className="mb-1 block text-sm font-medium text-mute">
          Proveedor LLM
        </label>
        <select
          id="llm-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as LlmProvider)}
          className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        >
          {LLM_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="llm-api-key" className="mb-1 block text-sm font-medium text-mute">
          Clave API
        </label>
        <div className="relative">
          <input
            id="llm-api-key"
            type={revealed ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            maxLength={1024}
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-…"
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 pr-10 font-mono text-xs text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Ocultar clave' : 'Mostrar clave'}
            aria-pressed={revealed}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            {revealed ? (
              <EyeOff aria-hidden="true" size={14} />
            ) : (
              <Eye aria-hidden="true" size={14} />
            )}
          </button>
        </div>
        <p className="mt-1 text-xs text-mute">
          La clave se cifra al persistir y nunca se devuelve en claro. Si la pierdes, vuelve a
          pegarla aquí.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-(--color-danger-fg)">
          No se pudo guardar: {error.message}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-transparent px-3 py-1.5 text-sm font-medium text-mute transition hover:bg-(--color-bg) focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
        >
          {isPending ? 'Guardando…' : 'Guardar clave'}
        </button>
      </div>
    </form>
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
