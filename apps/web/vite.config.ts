import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  server: {
    port: 5173,
    proxy: {
      // Forward /api/* to NestJS during dev so the browser sees a single
      // origin and CORS doesn't bite. NO rewrite — NestJS now sets a
      // global `/api` prefix in production (ADR-VITE-PROXY-NO-REWRITE,
      // m3.x-app-bootstrap-and-vps-deploy slice §1.13). Dev and prod
      // see identical URLs. Web client BASE_URL='/api' is unchanged.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
