# openTrattOS — single omnibus image per ADR-028 + ADR-SINGLE-IMAGE-OMNIBUS.
#
# Slice m3.x-app-bootstrap-and-vps-deploy §2.1.
#
# Stage 1: Build api + web from the turbo workspace.
# Stage 2: Runtime — Node 20 alpine that runs migrations then NestJS.
#          NestJS serves the SPA via @nestjs/serve-static (apps/api/src/app.module.ts),
#          so no edge proxy is needed inside the container.

# =====================================================================
# Stage 1 — build
# =====================================================================
FROM node:20-alpine AS build

WORKDIR /workspace

# Copy package manifests for the whole workspace so npm ci sees the
# graph. Order: lockfile + root package.json first (best Docker layer
# caching), then per-workspace package.json files.
COPY package.json package-lock.json turbo.json tsconfig*.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/label-renderer/package.json ./packages/label-renderer/
COPY packages/types/package.json ./packages/types/
COPY packages/ui-kit/package.json ./packages/ui-kit/

# Install with dev deps (turbo build + tsc + vite need them).
RUN npm ci --no-audit --no-fund

# Now copy source for the workspaces this image needs.
COPY apps/api ./apps/api
COPY apps/web ./apps/web
COPY packages ./packages

# Build api and web (turbo will respect the workspace dependency graph
# so @opentrattos/types, contracts, label-renderer, ui-kit get built
# transitively before consumers).
RUN npx turbo run build --filter=@opentrattos/api... --filter=@opentrattos/web...

# Prune dev deps now that the build is complete.
RUN npm prune --omit=dev

# =====================================================================
# Stage 2 — runtime
# =====================================================================
FROM node:20-alpine AS runtime

# wget for the HEALTHCHECK directive; sh + bash compatibility comes
# from busybox (alpine ships ash).
RUN apk add --no-cache wget

WORKDIR /app

# Workspace-root node_modules — turbo + npm hoist most deps here.
# Node's resolver walks up from /app/api/dist/cli/, so finding
# reflect-metadata + typeorm + @nestjs/* at /app/node_modules works
# regardless of which workspace directly required them.
COPY --from=build /workspace/node_modules ./node_modules

# api runtime artefacts
COPY --from=build /workspace/apps/api/dist ./api/dist
COPY --from=build /workspace/apps/api/node_modules ./api/node_modules
COPY --from=build /workspace/apps/api/package.json ./api/package.json
COPY --from=build /workspace/apps/api/scripts ./api/scripts

# Workspace package dist outputs that apps/api/dist transitively requires
# at runtime (the api's relative imports resolve to packages/*/dist).
COPY --from=build /workspace/packages/types/dist ./packages/types/dist
COPY --from=build /workspace/packages/types/package.json ./packages/types/package.json
COPY --from=build /workspace/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /workspace/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /workspace/packages/label-renderer/dist ./packages/label-renderer/dist
COPY --from=build /workspace/packages/label-renderer/package.json ./packages/label-renderer/package.json

# Vite SPA static output. ServeStaticModule's relative join in
# apps/api/src/app.module.ts resolves __dirname/../../web/dist — at
# runtime that's /app/api/dist/<subdir>/../../web/dist == /app/web/dist.
COPY --from=build /workspace/apps/web/dist ./web/dist

# Make the migrate-and-start script executable + drop to non-root.
RUN chmod +x ./api/scripts/migrate-and-start.sh \
 && chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1

CMD ["./api/scripts/migrate-and-start.sh"]
