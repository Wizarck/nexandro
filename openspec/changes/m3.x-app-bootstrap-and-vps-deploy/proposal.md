# m3.x-app-bootstrap-and-vps-deploy

## Problem

The monolith does not boot end-to-end as a single process today, and there are no deployment artifacts to ship it anywhere.

Two coupled gaps:

1. **AppModule has no `TypeOrmModule.forRoot()`**. 25 BC modules (Iam, Ingredients, Suppliers, Recipes, Menus, Cost, ExternalCatalog, Dashboard, Labels, AiSuggestions, AuditLog, AgentChat, AgentCredentials, Inventory, CostSnapshot, AiObservability, EmailDispatch, Procurement, PhotoStorage, PhotoIngestion, PhotoIngestionRouting, PhotoIngestionRevocation, ReviewQueue, Recall, Haccp, ComplianceExport, I18nM3Export) all call `TypeOrmModule.forFeature([...])` for their repositories, but the only `TypeOrmModule.forRoot()` calls in `apps/api/src/` live inside `*.int.spec.ts` test harnesses (`audit-log-int-harness.ts:90`, `revocation-int-harness.ts:110`, plus 8 individual specs). `apps/api/src/data-source.ts` is read only by `typeorm-ts-node-commonjs migration:*` CLI invocations — it does not feed any runtime DataSource. A `node dist/main` invocation against a real Postgres URL fails at module init the moment any `@InjectRepository(...)` resolves.
2. **No production deployment artifacts exist**. There is no production `Dockerfile` for `apps/api/` or `apps/web/`, no `docker-compose.prod.yml`, no edge proxy config (Caddyfile), no GHCR build workflow, no `.env.example` documenting runtime contract, no documented procedure for deploying to the VPS, and no cloudflared ingress snippet. The only Dockerfile in the repo is for the separable MCP server package (`packages/mcp-server-nexandro/Dockerfile`, ADR-013), which is a different concern.

The combined effect: M3 shipped 22/22 main slices + M3.x followups (PR #174) without ever running as a single process against a real Postgres, and with no path to put the result in front of an operator.

## Root cause

The OpenSpec slice flow encourages each BC to be verified by INT specs against a real Postgres provisioned by the slice's own TestingModule (per `m2-audit-log-emitter-migration` and the H2a/H2b harnesses). That gives high confidence per-BC, but no slice has owned the cross-cutting concern of:

- Wiring all BCs into a single boot graph against a single shared DataSource.
- Auditing which BCs require external credentials (S3 archival, SMTP/SendGrid/Postmark, OTel exporter, etc.) and providing a "disabled" code path for environments that don't have them.
- Producing the Dockerfiles + compose + edge config + CI workflow + procedure docs that operationalize the result.

Memory `feedback_int_specs_speculative_skip_pattern` describes the symmetric trap: subagent-authored INT suites encode design assumptions, not production behaviour. This slice is the inverse — production wiring that the INT-only flow never produced.

## Proposal

Single change with 4 work-streams. All ship in one merge so the deploy artifacts land usable on day one.

### A. App bootstrap fix (apps/api)

- **A1**: Add `TypeOrmModule.forRootAsync({ useFactory })` to `AppModule.imports`. Factory reads `DATABASE_URL` (same env contract as `data-source.ts`); options match `data-source.ts` (entities glob `**/*.entity.{ts,js}`, migrations glob `**/migrations/*.{ts,js}`, `migrationsTableName: 'nexandro_migrations'`, `synchronize: false`, `logging: process.env.TYPEORM_LOGGING === 'true'`).
- **A2**: Audit the 25 BCs and add feature-flag env vars where missing, so the app can boot with no external credentials. The flags listed below are the minimum surface; the audit may extend the list (each addition documented in the spec).
  - `OTEL_SDK_DISABLED=true` — `apps/api/src/otel-bootstrap.ts` early-returns when set.
  - `EMAIL_DISPATCH_PROVIDER=noop` — already provider-agnostic per slice #22; add a `NoopEmailAdapter` selectable by env.
  - `AUDIT_ARCHIVAL_ENABLED=false` — disables the daily S3 archival cron from PR #174.
  - `PHOTO_STORAGE_ENABLED=false` — disables the S3 signed-URL surface from slice #18 + the 90-day retention cron.
  - `M3_PO_AGGREGATE_ENABLED=false` — already exists (ADR-GR-PO-STATE-TRANSITION); keep default off for the bootstrap-only path.
  - `NEXANDRO_AGENT_ENABLED=false` — already exists; keep default off.
- **A3**: `apps/api/scripts/migrate-and-start.sh` — runs `node dist/cli/migrate.js` (which invokes `data-source.ts` `migration:run`) and then `exec node dist/main`. Fails fast if migrations don't apply. Wired as `CMD` of the api Dockerfile.
- **A4**: One e2e bootstrap smoke spec (`apps/api/test/bootstrap.e2e-spec.ts`): start AppModule against an ephemeral Postgres (reuse the `docker-compose.test.yml` instance via the existing `JEST_INT_DB_URL` pattern), assert (a) all 25 BCs initialize, (b) GET `/health` returns 200 (see A5), (c) all 6 feature flags above are honoured (4 disabled paths assert no external client constructed; 2 enabled paths skipped under this spec), (d) GET `/` returns the SPA `index.html` (see A6).
- **A5**: Add `/health` endpoint via `@nestjs/terminus` (db ping + uptime). Smallest possible: 1 module, 1 controller, 2 indicators (DataSource + memory). Required by both the bootstrap smoke spec and the Docker `HEALTHCHECK` directive. Excluded from the global API prefix (see A6).
- **A6**: Single-image SPA wiring. (a) `apps/api/src/main.ts` — `app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] })`. Backend routes move from `/audit-log/...` to `/api/audit-log/...`; `/health` stays at root for cleaner Docker healthcheck URL. Swagger setup string changes from `'api/docs'` → `'docs'` so the final URL stays `/api/docs` (now via global prefix). (b) `apps/api/src/app.module.ts` — add `ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', '..', 'web', 'dist'), exclude: ['/api/*', '/health'] })`. The api image's runtime layer copies `apps/web/dist/` into a sibling directory of `apps/api/dist/` so the relative path resolves at runtime. (c) `apps/web/vite.config.ts` — remove the `rewrite: path => path.replace(/^\/api/, '')` line so dev proxy forwards `/api/foo` as-is to NestJS, matching the new global prefix. Web client `BASE_URL='/api'` (apps/web/src/api/client.ts) unchanged.

### B. Single production Dockerfile (one image)

- **B1**: `Dockerfile` (repo root) — multi-stage Node 20 alpine, builds **one** image: `ghcr.io/wizarck/nexandro:latest`. Stage 1 (`build`) installs deps for the whole turbo workspace (so `@nexandro/types`, `@nexandro/contracts`, `@nexandro/label-renderer`, `@nexandro/ui-kit` resolve), runs `turbo run build` for both `@nexandro/api...` and `@nexandro/web...`, prunes dev deps. Stage 2 (`runtime`) — `node:20-alpine`, copy:
  - `apps/api/dist/` → `/app/api/dist/`
  - `apps/api/node_modules/` → `/app/api/node_modules/`
  - 4 workspace package `dist/` outputs → resolvable from `/app/api/`
  - `apps/web/dist/` → `/app/web/dist/` (sibling of `/app/api/`, matches the `ServeStaticModule` `rootPath` join in A6)
  - `apps/api/scripts/migrate-and-start.sh` → `/app/api/scripts/`
  
  CMD is the script (runs migrations then `node /app/api/dist/main`). Healthcheck = `wget -qO- http://127.0.0.1:${PORT:-3001}/health || exit 1`. EXPOSE `${PORT:-3001}`. USER non-root.
  
  **Rationale for single image** (vs two): nexandro is a modular monolith (ADR-001) targeting self-hosters with single-VPS scale. Same pattern as GitLab CE, Mattermost, n8n, Ghost, Outline. Trade-off: NestJS+ServeStaticModule serves static files ~10× slower than Caddy/nginx, irrelevant at <100 concurrent users; if the SaaS Enterprise tier later needs CDN-served assets, re-splitting is a half-day refactor (extract `apps/web/dist/` into a separate Caddy image, restore a Caddyfile-based edge proxy).

### C. Deployment artifacts (community quickstart + operator deploy)

The community AGPL-3.0 distribution and the operator (nexandro.palafitofood.com) deployment are **two separate compose files** with two different audiences. Both reference the same single public GHCR image:

| File | Audience | Bind | Cloudflared | Purpose |
|---|---|---|---|---|
| `docker-compose.yml` (repo root) | Community self-hoster (laptop, third-party VPS) | `0.0.0.0:3000:3001` | none — direct expose | The "Quick Start" path advertised in README. `git clone && docker compose up -d`. |
| `deploy/docker-compose.prod.yml` (deploy/) | Operator deploying to a host that already runs cloudflared | `127.0.0.1:3201:3001` | upstream tunnel terminator | nexandro.palafitofood.com on the eligia-prod VPS. |

- **C0**: `docker-compose.yml` (repo root) — community quickstart. **Two services** (`db` + `app`) — `app` pulls `ghcr.io/wizarck/nexandro:latest` and binds `0.0.0.0:3000:3001`. Default env via `.env.example` at repo root with a clear `POSTGRES_PASSWORD=<change-me-or-generated>` pattern.
- **C1**: ~~`deploy/Caddyfile`~~ — **NOT created**. The single image serves both API and SPA via NestJS + `ServeStaticModule` (work-stream A6). No edge proxy needed inside the compose.
- **C2**: `deploy/docker-compose.prod.yml` — operator deployment for nexandro.palafitofood.com. **Two services** as C0 but:
  - `db`: `postgres:16-alpine`, named volume `nexandro_pgdata`, NO host port, healthcheck via `pg_isready`. Env: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.
  - `app`: `ghcr.io/wizarck/nexandro:latest`, `depends_on: { db: { condition: service_healthy } }`, **`ports: ["127.0.0.1:3201:3001"]`** (defense-in-depth bind matching the modern VPS pattern: `actual-server` 127.0.0.1:5006, `palafito-staging-wp` 127.0.0.1:8081, `nexandro-postgres-test` 127.0.0.1:5433). Env from `deploy/.env` (DATABASE_URL pointing at `db:5432`, FRONTEND_URL `https://nexandro.palafitofood.com`, PORT `3001`, all 6 feature flags from A2).
- **C3**: `deploy/.env.example` — every runtime env var documented. Sibling: `.env.example` at repo root for the community quickstart (subset of envs, defaults aimed at single-host laptop).
- **C4**: `deploy/cloudflared-ingress-trattos.snippet.yml` — the 2-line ingress entry to insert into `/etc/cloudflared/config.yml` on the VPS, before the final `- service: http_status:404`. Plus reload procedure (`cloudflared tunnel ingress validate && systemctl restart cloudflared`). Points at `http://localhost:3201`.
- **C5**: `deploy/README.md` — operator step-by-step procedure: SSH to VPS, `mkdir /opt/nexandro`, scp `docker-compose.prod.yml` + `.env`, generate POSTGRES_PASSWORD locally, `docker compose pull`, `docker compose up -d`, smoke test (`curl http://127.0.0.1:3201/api/docs` from VPS, `curl https://nexandro.palafitofood.com` from desktop).

### D. CI workflow + community-facing docs + roadmap

- **D1**: `.github/workflows/build-images.yml` — triggers `push: master` (paths-filtered to `apps/**`, `packages/**`, `Dockerfile`, `deploy/**`) + `workflow_dispatch` (manual button for ad-hoc rebuilds). **One job** builds + pushes the single image with two tags: `:latest` + `:sha-${{ github.sha::7 }}`. Uses `GITHUB_TOKEN` for ghcr auth. Concurrency group per ref so re-pushes cancel in-flight. **Package set to public visibility** (`ghcr.io/wizarck/nexandro` accessible without auth) — required so community self-hosters can `docker pull` without GitHub credentials.
- **D2**: `docs/operations/post-deploy-roadmap.md` — committed catalogue of deferred items (R1–R10, see file). Each row: owner, trigger to start, effort, notes.
- **D3**: `README.md` quickstart update — replace the stale "⚠️ Coming soon — currently in Discovery & Architecture phase" block with a real `git clone && docker compose up -d` walkthrough referencing the public GHCR images (work-stream C0). Preserve the rest of the README (modules table, comparison vs Nexandro Enterprise, contributing, license).

## Test additions

- `apps/api/test/bootstrap.e2e-spec.ts` (new) — covered in A4.
- `apps/api/src/health/health.controller.spec.ts` (new) — unit test for the indicator wiring.
- CI: `.github/workflows/build-images.yml` exercises both Dockerfiles on every master push (catches Dockerfile regressions even though no PR-time build is gated).

## Invariants preserved

- **All 25 BC behaviours unchanged.** Adding `forRootAsync` to AppModule resolves the DataSource provider that every existing `forFeature` already expected; no module wiring or interface changes.
- **All existing INT specs untouched.** Each spec keeps its own `TypeOrmModule.forRoot({...})` inside its TestingModule. The new bootstrap spec is additive; it lives at `apps/api/test/` (not `src/`) and uses Jest's e2e config (existing `jest-integration.config.ts`).
- **Feature-flag default behaviour matches today.** The flags default to disabled values that match what the code does today when the relevant external client is unavailable — no production regression. Operators who want the enabled paths set the flag + provide creds.
- **`apps/api/src/data-source.ts` unchanged.** Migrations CLI keeps working exactly as today.
- **NestJS global prefix `/api` aligns dev and prod.** Today's dev path: browser hits `/api/foo`, Vite strips to `/foo`, NestJS routes mounted at root. New path: browser hits `/api/foo`, Vite forwards as-is, NestJS global prefix routes `/api/foo` → controller. Same final shape; cleaner because dev = prod (no rewrite asymmetry). Health endpoint excluded from the prefix to give Docker `HEALTHCHECK` a stable URL `/health`. The web client (`apps/web/src/api/client.ts`) is unchanged because `BASE_URL='/api'` already matches.

## Open-core boundary preserved

This change deploys the **community AGPL-3.0 image** to `nexandro.palafitofood.com` (operator path, work-stream C2) and publishes the same image as a community quickstart artifact (work-stream C0 + D3). Hard boundaries:

- **No enterprise code in `apps/api/` or `apps/web/`**. The 25 BCs imported in `AppModule` are all from this AGPL repo. Audited at proposal time; the bootstrap fix (work-stream A) does not change this.
- **MCP server stays separable** per ADR-013. `packages/mcp-server-nexandro/Dockerfile` is NOT bundled into the api image. Nexandro Enterprise (separate private repo, paid SaaS) pulls it independently.
- **No license-checks in code**. Feature flags (`*_DISABLED`, `=noop`) are operator-controlled defaults, not gates against a license. A community user enables S3 archival or real SMTP by providing creds, not by paying.
- **API-first contract preserved (ADR-002)**. The Enterprise SaaS add-ons (Hermes agent, Hindsight memory, WhatsApp/Telegram bot, LangGraph orchestration) consume the community API via MCP tools from the private repo. They do not ship inside the community image. Same model as GitLab CE → EE plugins, Sentry self-hosted → SaaS, n8n → n8n.cloud.
- **Single public image** (work-stream D1) — `ghcr.io/wizarck/nexandro:latest` accessible without auth. Same single-omnibus-image pattern as GitLab CE, Mattermost, n8n, Ghost, Outline.

## Out of scope

Catalogued in `docs/operations/post-deploy-roadmap.md` (created by D2). Trigger conditions and effort estimates live there. Summary:

- **R1** — Helm chart `eligia-core/helm/nexandro-stack/` for Phase 2 k8s prod, including update of `eligia-nodeport-firewall.service` to add the api+web NodePorts.
- **R2** — Audit-log archival enabled against MinIO local or external S3 (M3 PR #174 in active mode).
- **R3** — Real SMTP/Postmark for email dispatch (M3 slice #22 in non-noop mode).
- **R4** — Postgres backups to Hetzner Object Storage (same TODO as `runbook-vps-disaster-recovery.md` §Prevention for Twenty CRM).
- **R5** — Demo seed / multi-tenant fixtures (1 owner + 1 manager + 3 staff + ES category seed).
- **R6** — Cloudflared route automation (declarative configmap vs manual edits to `/etc/cloudflared/config.yml`).
- **R7** — `runbook-vps-disaster-recovery.md` correction in `eligia-core` (tunnel ID is `675fa973-…`, not `da6c585e-…` as documented). Filed in eligia-core, not this repo.
- **R8** — Auth real (today the API is open; bind-to-loopback + cloudflared Access policy is the only barrier in fase de prueba).
- **R9** — `npx nexandro` CLI (`@nexandro/cli` workspace package). Wraps `docker compose pull && up`. Secondary distribution path; Docker remains primary per AGENTS.md §1. Pattern reference: n8n ships both `npm install n8n` and `docker run n8nio/n8n`.
- **R10** — Mirror to `docker.io/nexandro/{api,web}` for `docker pull` discoverability. Requires Docker Hub org. Optional once GHCR public visibility is confirmed working.

Helm chart (R1) is the most consequential. Trigger condition: Phase 1 Docker stable for at least 2 weeks of operator use.

## FR mapping

This change does not introduce new functional capabilities. It unlocks the existing 25 BC capabilities to run as a single process against a real Postgres in a deployable container, on a public hostname behind cloudflared. No `Scenario: WHEN/THEN` blocks added to existing capability specs — the new behaviours (bootstrap, feature flags, edge proxy routing) are documented in two new specs:

- `openspec/specs/app-bootstrap.md` (new capability) — "the monolith arranges as a single boot graph against a runtime-provided Postgres URL, with feature flags gating each external-credential dependency."
- `openspec/specs/deploy-vps-docker.md` (new capability) — "the monolith ships as two GHCR images orchestrated by docker-compose on a single host with a cloudflared edge."

Both specs are written in the design phase (post-approval of this proposal).
