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
