# MCP server `nexandro` — separable image per ADR-013.
#
# Build: docker build -t nexandro/mcp-server:0.1.0 packages/mcp-server-nexandro/
# Run:   docker run --rm -i \
#          -e NEXANDRO_API_BASE_URL=http://host.docker.internal:3000 \
#          -e NEXANDRO_AGENT_NAME=claude-desktop \
#          nexandro/mcp-server:0.1.0
#
# This image speaks the Model Context Protocol over stdio (the SDK's default
# transport for desktop clients). When wiring into a remote-MCP gateway,
# adjust the entry to use the StreamableHTTPServerTransport.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm install --no-audit --no-fund --omit=dev=false \
 && npm run build \
 && npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
USER node
ENTRYPOINT ["node", "dist/server.js"]
