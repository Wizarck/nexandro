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
      {
        path: 'poc/recipe-builder-j1',
        element: <RecipeBuilderJ1Screen />,
      },
      {
        path: 'poc/cost-investigation-j2',
        element: <CostInvestigationJ2Screen />,
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
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
