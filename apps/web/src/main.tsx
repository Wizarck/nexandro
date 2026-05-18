import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import '@nexandro/ui-kit/globals.css';
import { App } from './App';
import { AuditLogScreen } from './screens/AuditLogScreen';
import { OwnerDashboardScreen } from './screens/OwnerDashboardScreen';
import { OwnerOrgSettingsScreen } from './screens/OwnerOrgSettingsScreen';
import { OwnerSettingsShell } from './screens/settings/OwnerSettingsShell';
import { OwnerBusinessSection } from './screens/settings/OwnerBusinessSection';
import { OwnerPrivacySection } from './screens/settings/OwnerPrivacySection';
import { OwnerAgentCredentialsSection } from './screens/settings/OwnerAgentCredentialsSection';
import { OwnerLocationsSection } from './screens/settings/OwnerLocationsSection';
import { OwnerUsersSection } from './screens/settings/OwnerUsersSection';
import { OwnerCatalogSection } from './screens/settings/OwnerCatalogSection';
import { OwnerFsmsStandardsSection } from './screens/settings/OwnerFsmsStandardsSection';
import { OwnerExternalCatalogSection } from './screens/settings/OwnerExternalCatalogSection';
import { OnboardingWizard } from './screens/onboarding/OnboardingWizard';
import { OnboardingBusinessStep } from './screens/onboarding/steps/OnboardingBusinessStep';
import { OnboardingRedirectStep } from './screens/onboarding/steps/OnboardingRedirectStep';
import { OnboardingComplete } from './screens/onboarding/OnboardingComplete';
import { Navigate } from 'react-router-dom';
import { RecipeBuilderJ1Screen } from './screens/RecipeBuilderJ1Screen';
import { CostInvestigationJ2Screen } from './screens/CostInvestigationJ2Screen';
import { AiObsDashboardScreen } from './m3/ai-obs/AiObsDashboardScreen';
import { IncidentSearchFieldScreen } from './screens/j6/IncidentSearchFieldScreen';
import { RecallInvestigateJ6Route, RecallDossierJ7Route } from './m3/recall/recall-routes';
import { HaccpRecordScreen } from './screens/j10/HaccpRecordScreen';
import { AppccExportScreen } from './screens/j9/AppccExportScreen';
import { PhotoIngestReviewScreen } from './screens/j12/PhotoIngestReviewScreen';
import { ProcurementScreen } from './screens/j11/ProcurementScreen';
import { ReviewQueueScreen } from './screens/ReviewQueueScreen';
import { RecallTraceTreeScreen } from './screens/j6/RecallTraceTreeScreen';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        path: 'owner-dashboard',
        element: <OwnerDashboardScreen />,
      },
      {
        path: 'owner-settings',
        element: <OwnerSettingsShell />,
        children: [
          // Default: redirect to Negocio (audit L2-1).
          { index: true, element: <Navigate to="/owner-settings/negocio" replace /> },
          { path: 'negocio', element: <OwnerBusinessSection /> },
          // Sprint 3 Block B — 4 Settings-críticos surfaces wiring existing
          // backend controllers that had no FE representation (audit 2026-05-18).
          { path: 'sedes', element: <OwnerLocationsSection /> },
          { path: 'equipo', element: <OwnerUsersSection /> },
          { path: 'catalogo', element: <OwnerCatalogSection /> },
          // Sprint 4 W1-B — 2 reference-data tabs wiring controllers that had
          // zero frontend representation (FSMS standards + OFF external
          // catalog mirror health/sync).
          { path: 'normativa-haccp', element: <OwnerFsmsStandardsSection /> },
          { path: 'catalogo-externo', element: <OwnerExternalCatalogSection /> },
          { path: 'etiquetas', element: <OwnerOrgSettingsScreen /> },
          { path: 'ia', element: <OwnerAgentCredentialsSection /> },
          { path: 'privacidad', element: <OwnerPrivacySection /> },
        ],
      },
      {
        path: 'audit-log',
        element: <AuditLogScreen />,
      },
      // M2 escandallo surfaces — promoted out of /poc/* per Sprint 3
      // audit (2026-05-18). J1 + J2 were canonical M2 MVP screens that
      // stayed behind /poc/* URLs and never reached top-nav. Old paths
      // kept as redirects so deep links from emails / audit-logs don't 404.
      {
        path: 'recipes',
        element: <RecipeBuilderJ1Screen />,
      },
      {
        path: 'recipes/cost-drift',
        element: <CostInvestigationJ2Screen />,
      },
      {
        path: 'poc/recipe-builder-j1',
        element: <Navigate to="/recipes" replace />,
      },
      {
        path: 'poc/cost-investigation-j2',
        element: <Navigate to="/recipes/cost-drift" replace />,
      },
      // M3 standalone trace surface — Wave 2.5 #12 had no route registration
      // (the embedded copy lives inside RecallInvestigateJ6Screen). Sprint 3
      // audit (2026-05-18) restored it as a standalone "trace any lot
      // without opening an incident" surface — useful for forensic lookups
      // that don't need the 4 h crisis window.
      {
        path: 'recall/trace',
        element: <RecallTraceTreeScreen />,
      },
      {
        path: 'ai-obs/dashboard',
        element: <AiObsDashboardScreen />,
      },
      {
        path: 'haccp/record',
        element: <HaccpRecordScreen />,
      },
      {
        path: 'compliance/export',
        element: <AppccExportScreen />,
      },
      {
        path: 'photo-ingest/review',
        element: <PhotoIngestReviewScreen />,
      },
      {
        path: 'm3/review-queue',
        element: <ReviewQueueScreen />,
      },
      // Sprint 3 Block C — j11 Procurement minimum-viable shell (3 read-only
      // tabs behind ?tab=po|gr|recon). Full j11.md surface (drawers,
      // bulk-confirm, Hermes pre-fill, Owner approval gates) is followup.
      {
        path: 'procurement',
        element: <ProcurementScreen />,
      },
      // J7 recall dossier surface uses the standard AppLayout per j7.md.
      {
        path: 'recall/incidents/:incidentId',
        element: <RecallDossierJ7Route />,
      },
    ],
  },
  // J6 crisis surfaces mount OUTSIDE App per j6.md §28+§82 "The crisis
  // surface is exempt from the standard top-nav". Both the search landing
  // (no incident yet) and the incident-investigate routes use CrisisLayout
  // — moved out of the App children list per audit 2026-05-18 L1-1.
  {
    path: '/recall/investigate',
    element: <IncidentSearchFieldScreen />,
  },
  {
    path: '/recall/investigate/:incidentId',
    element: <RecallInvestigateJ6Route />,
  },
  // Onboarding wizard — outside App so the persona's eye lands on the
  // 5-step flow without competing with normal top-nav (audit L2-3 +
  // personas-jtbd.md §3).
  {
    path: '/onboarding',
    element: <OnboardingWizard />,
    children: [
      { index: true, element: <Navigate to="/onboarding/negocio" replace /> },
      { path: 'negocio', element: <OnboardingBusinessStep /> },
      // Sprint 4 W1-C (2026-05-18): steps 2-5 were Sprint 1 placeholders
      // ("próximamente"). Now that Sprint 3 Block B landed sedes / equipo /
      // catalogo and Block A promoted /recipes out of /poc/*, each step
      // hands off to the real surface via OnboardingRedirectStep.
      {
        path: 'sede',
        element: (
          <OnboardingRedirectStep
            step={2}
            promise="Crear tu sede principal (nombre, dirección, tipo: restaurante / dark kitchen / bar / catering)."
            targetPath="/owner-settings/sedes"
            targetLabel="Sedes"
          />
        ),
      },
      {
        path: 'categorias',
        element: (
          <OnboardingRedirectStep
            step={3}
            promise="Elegir entre la taxonomía por defecto (35 categorías traducidas), arrancar vacío, o importar desde CSV."
            targetPath="/owner-settings/catalogo"
            targetLabel="Catálogo"
          />
        ),
      },
      {
        path: 'administrador',
        element: (
          <OnboardingRedirectStep
            step={4}
            promise="Invitar a tu jefe de cocina y a tu equipo (rol OWNER / MANAGER / STAFF) por email."
            targetPath="/owner-settings/equipo"
            targetLabel="Equipo"
          />
        ),
      },
      {
        path: 'primer-plato',
        element: (
          <OnboardingRedirectStep
            step={5}
            promise="Crear tu primer ingrediente + proveedor + precio y ver el coste por gramo en vivo (el 'aha moment' de personas-jtbd.md §3.5)."
            targetPath="/recipes"
            targetLabel="Escandallos"
          />
        ),
      },
      { path: 'listo', element: <OnboardingComplete /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
