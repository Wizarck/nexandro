import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import '@opentrattos/ui-kit/globals.css';
import { App } from './App';
import { AuditLogScreen } from './screens/AuditLogScreen';
import { OwnerDashboardScreen } from './screens/OwnerDashboardScreen';
import { OwnerOrgSettingsScreen } from './screens/OwnerOrgSettingsScreen';
import { RecipeBuilderJ1Screen } from './screens/RecipeBuilderJ1Screen';
import { CostInvestigationJ2Screen } from './screens/CostInvestigationJ2Screen';
import { AiObsDashboardScreen } from './m3/ai-obs/AiObsDashboardScreen';
import { IncidentSearchFieldScreen } from './screens/j6/IncidentSearchFieldScreen';
import { RecallInvestigateJ6Route, RecallDossierJ7Route } from './m3/recall/recall-routes';
import { HaccpRecordScreen } from './screens/j10/HaccpRecordScreen';
import { AppccExportScreen } from './screens/j9/AppccExportScreen';
import { PhotoIngestReviewScreen } from './screens/j12/PhotoIngestReviewScreen';

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
        element: <OwnerOrgSettingsScreen />,
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
        path: 'recall/investigate',
        element: <IncidentSearchFieldScreen />,
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
      // J7 recall dossier surface uses the standard AppLayout per j7.md.
      {
        path: 'recall/incidents/:incidentId',
        element: <RecallDossierJ7Route />,
      },
    ],
  },
  // J6 crisis surface mounts OUTSIDE App per j6.md "The crisis surface is
  // exempt from the standard top-nav".
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
