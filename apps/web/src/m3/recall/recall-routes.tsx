import { useParams, useSearchParams } from 'react-router-dom';
import { RecallDossierJ7Screen } from '../../screens/RecallDossierJ7Screen';
import { RecallInvestigateJ6Screen } from '../../screens/RecallInvestigateJ6Screen';

const DEMO_ORG_ID = String(import.meta.env.VITE_DEMO_ORG_ID ?? '');

/**
 * `/recall/investigate/:incidentId` route adapter — reads URL params +
 * passes the demo org id through. Production swaps the env-derived org
 * for the authenticated session's org once the auth bootstrap surface
 * lands.
 */
export function RecallInvestigateJ6Route() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const [search] = useSearchParams();
  const organizationId =
    search.get('organizationId') ?? DEMO_ORG_ID;
  if (!incidentId || !organizationId) return null;
  return (
    <RecallInvestigateJ6Screen
      organizationId={organizationId}
      incidentId={incidentId}
    />
  );
}

/**
 * `/recall/incidents/:incidentId` route adapter — J7 post-crisis surface.
 */
export function RecallDossierJ7Route() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const [search] = useSearchParams();
  const organizationId =
    search.get('organizationId') ?? DEMO_ORG_ID;
  if (!incidentId || !organizationId) return null;
  return (
    <RecallDossierJ7Screen
      organizationId={organizationId}
      incidentId={incidentId}
    />
  );
}
