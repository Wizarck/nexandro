#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer, readOptionsFromEnv } from './index.js';

/**
 * Stdio bootstrap for the MCP server `nexandro`.
 *
 * Kept in a separate module from `index.ts` so the test runner can import
 * `buildServer` without triggering the stdio handshake. The package's
 * `bin` field + Dockerfile entrypoint both point at this file's compiled
 * output (`dist/server.js`).
 */
async function main(): Promise<void> {
  const { server } = buildServer(readOptionsFromEnv());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('mcp-server-nexandro failed to start:', err);
  process.exit(1);
});
