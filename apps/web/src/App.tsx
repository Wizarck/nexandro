import { Link, Outlet } from 'react-router-dom';
import { AgentChatWidget, RoleGuard } from '@opentrattos/ui-kit';
import { useAgentChat } from './hooks/useAgentChat';
import { useCurrentRole } from './lib/currentUser';

const AGENT_ENABLED = String(import.meta.env.VITE_OPENTRATTOS_AGENT_ENABLED ?? '')
  .trim()
  .toLowerCase() === 'true';

const ORG_ID = String(import.meta.env.VITE_DEMO_ORG_ID ?? '');

export function App() {
  const { send } = useAgentChat();
  const currentRole = useCurrentRole();
  return (
    <div className="min-h-full">
      <header className="border-b border-border-strong bg-surface px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-ink">openTrattOS</h1>
          <nav className="flex items-center gap-4 text-sm text-mute">
            <Link to="/poc/owner-dashboard" className="hover:text-ink">
              PoC: Owner dashboard
            </Link>
            <RoleGuard role="OWNER" currentRole={currentRole}>
              <Link to="/owner-settings" className="hover:text-ink">
                Configuración
              </Link>
            </RoleGuard>
            <RoleGuard role={['OWNER', 'MANAGER']} currentRole={currentRole}>
              <Link to="/audit-log" className="hover:text-ink">
                Auditoría
              </Link>
            </RoleGuard>
            <RoleGuard role={['OWNER', 'MANAGER']} currentRole={currentRole}>
              <Link to="/ai-obs/dashboard" className="hover:text-ink">
                AI obs
              </Link>
            </RoleGuard>
            <RoleGuard role={['OWNER', 'MANAGER']} currentRole={currentRole}>
              <Link to="/recall/investigate" className="hover:text-ink">
                Recall
              </Link>
            </RoleGuard>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <AgentChatWidget
        agentEnabled={AGENT_ENABLED}
        organizationId={ORG_ID}
        userId=""
        onSend={send}
      />
    </div>
  );
}
