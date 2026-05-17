# Tasks — m3.x-app-bootstrap-and-vps-deploy

## §1 App bootstrap (work-stream A)

- [x] §1.1 — `apps/api/src/database-options.ts` (new) — extract `buildDataSourceOptions(): DataSourceOptions` from the shape currently inline in `data-source.ts`. Reads `DATABASE_URL`, sets entities glob, migrations glob, `migrationsTableName: 'nexandro_migrations'`, `synchronize: false`, `logging` from `TYPEORM_LOGGING`.
- [x] §1.2 — `apps/api/src/data-source.ts` — refactor to consume `buildDataSourceOptions()`. Behaviour unchanged (migrations CLI still works).
- [x] §1.3 — `apps/api/src/app.module.ts` — add `TypeOrmModule.forRootAsync({ useFactory: buildDataSourceOptions })` as the first entry in `imports`. Verify no other module needs an explicit `forRoot` (none should).
- [x] §1.4 — `apps/api/src/otel-bootstrap.ts` — early-return when `process.env.OTEL_SDK_DISABLED === 'true'`. Default behaviour: `OTEL_SDK_DISABLED` defaults to `'true'` only inside the bootstrap smoke spec; in CI / normal dev it stays unset and OTel runs. Document the env semantics in the file header.
- [ ] §1.5 — `apps/api/src/shared/email-dispatch/adapters/noop.ts` (new) — `NoopEmailAdapter` implementing the existing `EmailDispatchAdapter` interface. `dispatch()` returns `Result.ok({ providerMessageId: 'noop' })` and logs at `debug`.
- [ ] §1.6 — `apps/api/src/shared/email-dispatch/email-dispatch.module.ts` — extend the existing provider factory to recognise `EMAIL_DISPATCH_PROVIDER=noop` and select `NoopEmailAdapter`. Default is `noop`.
- [ ] §1.7 — Audit the remaining 4 feature flag homes:
  - `AUDIT_ARCHIVAL_ENABLED` — find where the daily S3 archival cron is registered (PR #174); gate `@Cron` registration on the flag.
  - `PHOTO_STORAGE_ENABLED` — find where the S3 client and 90-day retention cron are constructed (slice #18); gate on the flag.
  - `M3_PO_AGGREGATE_ENABLED` — verify the existing flag is honoured at PO state-transition site.
  - `NEXANDRO_AGENT_ENABLED` — verify the existing flag is honoured at the AgentChat SSE endpoint.
- [x] §1.8 — `apps/api/src/cli/migrate.ts` (new) — minimal entry: `import('./database-options').then(({ buildDataSourceOptions }) => new DataSource(buildDataSourceOptions()).initialize().then(ds => ds.runMigrations()).then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); }))`.
- [x] §1.9 — `apps/api/scripts/migrate-and-start.sh` (new) — `set -euo pipefail; node /app/api/dist/cli/migrate.js; exec node /app/api/dist/main`. Mark executable.
- [x] §1.10 — `apps/api/src/health/health.module.ts`, `health.controller.ts`, `health.controller.spec.ts` (new) — Terminus-backed module: `TypeOrmHealthIndicator` (DB ping) + `MemoryHealthIndicator` (heap < 300MB). Controller route `/health`. Wire into `AppModule.imports`.
- [x] §1.11 — `apps/api/src/main.ts` — add `setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] })` BEFORE `app.useGlobalPipes(...)`. Change `SwaggerModule.setup('api/docs', ...)` → `SwaggerModule.setup('docs', ...)` (the global prefix prepends `/api`).
- [x] §1.12 — `apps/api/src/app.module.ts` — add `ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', '..', 'web', 'dist'), exclude: ['/api/{*splat}', '/health'] })`. Add `@nestjs/serve-static` to `apps/api/package.json`.
- [x] §1.13 — `apps/web/vite.config.ts` — remove the `rewrite` line so `/api/foo` is forwarded as-is. Keep `target: 'http://localhost:3001'` (port unchanged).
- [ ] §1.14 — `apps/api/test/bootstrap.e2e-spec.ts` (new) — bootstrap smoke spec per `specs/app-bootstrap/spec.md` AC. Uses `JEST_INT_DB_URL`. Asserts: app boots, all 25 BCs init, GET /health → 200, GET / → 200 text/html, GET /api/docs → 200, each disabled-by-default flag honoured.

## §2 Single Dockerfile (work-stream B)

- [x] §2.1 — `Dockerfile` (repo root, new) — multi-stage Node 20 alpine per design ADR-SINGLE-IMAGE-OMNIBUS. Stage `build`: `npm ci`, `npx turbo run build --filter=@nexandro/api... --filter=@nexandro/web...`, `npm prune --omit=dev`. Stage `runtime`: copy `apps/api/dist/`, `apps/api/node_modules/`, the workspace package `dist/` outputs, `apps/web/dist/`, `apps/api/scripts/migrate-and-start.sh`. EXPOSE 3001. USER non-root (`node`). HEALTHCHECK `wget -qO- http://127.0.0.1:3001/health || exit 1`. CMD `["/app/api/scripts/migrate-and-start.sh"]`.
- [x] §2.2 — `.dockerignore` (repo root, new) — exclude `node_modules`, `**/dist`, `.git`, `.github`, `.bmad-output`, `_bmad-output`, `_bmad`, `coverage`, `*.log`, `.env*`. Speeds up build context upload.
- [ ] §2.3 — Local gate: `docker build -t nexandro:test .` succeeds; `docker run --rm -e DATABASE_URL=... nexandro:test` starts; `curl localhost:3001/health` returns 200.

## §3 Deployment artifacts (work-stream C)

- [x] §3.1 — `docker-compose.yml` (repo root, new) — community quickstart per `specs/deploy-vps-docker/spec.md`. 2 services: `db` (postgres:16-alpine, named volume `nexandro_pgdata`, env from `.env`, healthcheck `pg_isready`) + `app` (`ghcr.io/wizarck/nexandro:latest`, `depends_on: { db: { condition: service_healthy } }`, ports `0.0.0.0:3000:3001`, env from `.env`).
- [x] §3.2 — `.env.example` (repo root, new) — community defaults: `POSTGRES_USER=nexandro`, `POSTGRES_DB=nexandro`, `POSTGRES_PASSWORD=changeme-please`, `DATABASE_URL=postgresql://nexandro:changeme-please@db:5432/nexandro`, `FRONTEND_URL=http://localhost:3000`, `PORT=3001`. Comments call out the password change requirement.
- [x] §3.3 — `deploy/docker-compose.prod.yml` (new) — operator deployment. Same 2 services as §3.1 but `app.ports: ["127.0.0.1:3201:3001"]` (defense-in-depth bind). `env_file: /opt/nexandro/.env`. `restart: unless-stopped` on both services.
- [x] §3.4 — `deploy/.env.example` (new) — operator-specific values: `FRONTEND_URL=https://nexandro.palafitofood.com`, comments to set `POSTGRES_PASSWORD` from a `pwgen 32 1` invocation.
- [x] §3.5 — `deploy/cloudflared-ingress-trattos.snippet.yml` (new) — the 2-line ingress entry + a comment block describing where to insert (before `- service: http_status:404`) + reload procedure (`cloudflared tunnel ingress validate --config /etc/cloudflared/config.yml && systemctl restart cloudflared`).
- [x] §3.6 — `deploy/README.md` (new) — operator step-by-step procedure per `specs/deploy-vps-docker/spec.md` AC: SSH, `mkdir /opt/nexandro`, scp compose + .env, generate POSTGRES_PASSWORD, `docker compose pull && up -d`, smoke (internal + external probes), insert cloudflared snippet, validate + restart, create Cloudflare DNS CNAME.

## §4 CI + community docs (work-stream D)

- [x] §4.1 — `.github/workflows/build-images.yml` (new) — single job:
  - Triggers: `push: master` (paths `apps/**`, `packages/**`, `Dockerfile`, `deploy/**`) + `workflow_dispatch`.
  - Concurrency group `build-images-${{ github.ref }}` with `cancel-in-progress: true`.
  - Steps: checkout, set up Buildx, login to GHCR via `GITHUB_TOKEN`, `docker buildx build --push --tag ghcr.io/wizarck/nexandro:latest --tag ghcr.io/wizarck/nexandro:sha-${GITHUB_SHA::7} .`.
- [ ] §4.2 — Post-first-push manual: set `ghcr.io/wizarck/nexandro` package visibility to public via the GHCR UI. Document the 1-time step in `deploy/README.md`.
- [x] §4.3 — `README.md` (existing, edit) — replace the "⚠️ Coming soon — currently in Discovery & Architecture phase" Quick Start block with: `git clone https://github.com/Wizarck/nexandro.git`, `cd nexandro`, `cp .env.example .env`, `docker compose up -d`, `open http://localhost:3000`. Preserve the rest of the README (modules table, comparison vs Nexandro Enterprise, contributing, license).

## §5 Local gates

- [ ] §5.1 — `npm test --workspace=apps/api -- --testPathPattern=health` — health module unit specs green.
- [x] §5.2 — `npm run build --workspace=apps/api` — TypeScript compile clean.
- [x] §5.3 — `npm run build --workspace=apps/web` — Vite build emits to `apps/web/dist/`.
- [ ] §5.4 — `docker build -t nexandro:test .` — image builds in <5 min on dev machine.
- [ ] §5.5 — `docker compose -f docker-compose.yml up -d --build` — full stack up; `curl localhost:3000/health` → 200; `curl localhost:3000/` → SPA HTML; `curl localhost:3000/api/docs` → Swagger HTML.
- [ ] §5.6 — INT bootstrap spec on real Postgres: `JEST_INT_DB_URL=... npx jest --config jest-integration.config.ts test/bootstrap.e2e-spec.ts` — green.
- [x] §5.7 — `npx openspec validate "m3.x-app-bootstrap-and-vps-deploy"` — green.

## §6 §4.5.6 AI-reviewer signoff

- [ ] §6.1 — Profile: chore + cross-cutting bootstrap slice; defensively shipped (no behaviour change to existing BCs; only adds infrastructure that lets the existing app run end-to-end as one process).
- [ ] §6.2 — Reviewer self-review:
  - Did the slice add NestJS code anywhere it shouldn't (e.g. inside a BC's domain layer)? **No** — only AppModule, main, new health module, new noop adapter, new cli entry, new bootstrap spec.
  - Are the 6 feature flags all honoured at their default-disabled side without observable production regression? **Verify in §1.7 audit + §1.14 spec.**
  - Does the `__dirname` join in ServeStaticModule resolve in both dev (`apps/api/dist/...`) and container (`/app/api/dist/...`)? **Verify in §5.5.**
  - Does the `/api` global prefix preserve all existing route shapes the web client (`apps/web/src/api/*.ts`) currently uses? **Yes** — all hardcoded paths are `/api/...`; no rewrites needed beyond the vite.config.ts removal.
  - Does the Dockerfile produce an image small enough to be reasonable (~250-400 MB compressed)? **Verify in §2.3.**

## §7 Post-merge VPS deploy (manual, NOT part of `/opsx:apply`)

These steps run AFTER the PR merges and the GHA workflow publishes the first image. They are documented here so the task list is complete; they execute outside the `/opsx:apply` automation.

- [ ] §7.1 — Wait for `.github/workflows/build-images.yml` to complete green on the merge SHA.
- [ ] §7.2 — Set `ghcr.io/wizarck/nexandro` package visibility to public via GHCR UI (one-time).
- [ ] §7.3 — On VPS: `mkdir -p /opt/nexandro`, scp `deploy/docker-compose.prod.yml` and a populated `.env` (with operator-generated `POSTGRES_PASSWORD`).
- [ ] §7.4 — On VPS: `cd /opt/nexandro && docker compose pull && docker compose up -d`. Verify `docker ps` shows both services healthy.
- [ ] §7.5 — On VPS: `curl http://127.0.0.1:3201/health` → 200.
- [ ] §7.6 — Edit `/etc/cloudflared/config.yml` on VPS to insert the snippet from `deploy/cloudflared-ingress-trattos.snippet.yml`. Run `cloudflared tunnel ingress validate --config /etc/cloudflared/config.yml`. If green, `systemctl restart cloudflared`.
- [ ] §7.7 — User creates Cloudflare DNS CNAME `nexandro.palafitofood.com` → `675fa973-4c22-4b1c-9fd4-a52fad422ca4.cfargotunnel.com` (proxied).
- [ ] §7.8 — From desktop: `curl https://nexandro.palafitofood.com/health` → 200. `open https://nexandro.palafitofood.com` shows SPA.
- [ ] §7.9 — `npx openspec archive "m3.x-app-bootstrap-and-vps-deploy"` (archives the proposal + moves specs into `openspec/specs/`).
