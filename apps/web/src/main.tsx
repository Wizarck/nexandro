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
import { OnboardingWizard } from './screens/onboarding/OnboardingWizard';
import { OnboardingBusinessStep } from './screens/onboarding/steps/OnboardingBusinessStep';
import { OnboardingPlaceholderStep } from './screens/onboarding/steps/OnboardingPlaceholderStep';
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
          { path: 'etiquetas', element: <OwnerOrgSettingsScreen /> },
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
      {
        path: 'sede',
        element: (
          <OnboardingPlaceholderStep
            step={2}
            promise="Crear tu sede principal (nombre, dirección, tipo: restaurante / dark kitchen / bar / catering)."
            pending="Multi-sede aterriza con la próxima slice (Configuración → Sedes)."
          />
        ),
      },
      {
        path: 'categorias',
        element: (
          <OnboardingPlaceholderStep
            step={3}
            promise="Elegir entre la taxonomía por defecto (35 categorías traducidas), arrancar vacío, o importar desde CSV."
            pending="La taxonomía por defecto ya viene sembrada en demo. La elección explícita llega cuando se incorpore el flujo no-demo."
          />
        ),
      },
      {
        path: 'administrador',
        element: (
          <OnboardingPlaceholderStep
            step={4}
            promise="Invitar a tu jefe de cocina y a tu equipo (rol OWNER / MANAGER / STAFF) por email."
            pending="Autenticación real + invitaciones (R8 del roadmap) aterriza después. Hoy demo-mode auto-login."
          />
        ),
      },
      {
        path: 'primer-plato',
        element: (
          <OnboardingPlaceholderStep
            step={5}
            promise="Crear tu primer ingrediente + proveedor + precio y ver el coste por gramo en vivo (el 'aha moment' de personas-jtbd.md §3.5)."
            pending="La pantalla de ingredientes existe pero el guiado in-line del wizard llega con la siguiente iteración. Mientras tanto, salta aquí y entra por la barra superior."
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
