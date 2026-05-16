# Design — m3.x-app-bootstrap-and-vps-deploy

## Context

Proposal-approved scope: (a) make the monolith boot end-to-end as a single process against a real Postgres, (b) add disabled-by-default feature flags so external creds aren't required to start, (c) ship the deployment artifacts (single Dockerfile, two compose files, GHCR workflow, cloudflared snippet, README), (d) update community-facing docs.

Three pre-locked architectural decisions constrain this slice:

1. **ADR-001 (modular monolith)** — single NestJS process is the boot unit. No microservice extraction inside this slice.
2. **ADR-013 (MCP server separable)** — `packages/mcp-server-opentrattos/` keeps its own Dockerfile. The new image MUST NOT bundle it.
3. **ADR-028 (single omnibus image)** — community AGPL ships as one Docker image; api/web split is explicitly rejected. NestJS serves the SPA via `@nestjs/serve-static`.

Two cross-cutting constraints from operator reality:

- **VPS state confirmed via SSH** (2026-05-16): port 3201 free; cloudflared = systemd unit at `/etc/cloudflared/config.yml`; live tunnel ID `675fa973-4c22-4b1c-9fd4-a52fad422ca4` (NOT the stale `da6c585e-…` in eligia-core's disaster-recovery runbook); modern bind pattern is `127.0.0.1:port:port` (matches `actual-server`, `palafito-staging-wp`, `opentrattos-postgres-test`).
- **Open-core boundary** — no enterprise code in `apps/api/` or `apps/web/`; no license-checks; flags gate creds, not paid features.

## ADRs

### ADR-BOOTSTRAP-FORROOT-IN-APP-MODULE

**Decision.** `TypeOrmModule.forRootAsync` is added to `AppModule.imports` (NOT to a new `DatabaseModule`). The factory reads `DATABASE_URL` and constructs the same `DataSourceOptions` shape currently used by `apps/api/src/data-source.ts` (entities glob `**/*.entity.{ts,js}`, migrations glob `**/migrations/*.{ts,js}`, `migrationsTableName: 'opentrattos_migrations'`, `synchronize: false`, `logging` honouring `TYPEORM_LOGGING`).

**Rationale.**

- Every BC's `TypeOrmModule.forFeature([...])` call already expects exactly one `DataSource` resolvable at app root. A dedicated `DatabaseModule` adds an indirection without functional benefit and would require touching 25 BC modules to re-route imports.
- Mirroring `data-source.ts` keeps a single source of truth for the connection contract: change `DATABASE_URL` semantics in one place + the migrations CLI keeps working unchanged.
- INT specs continue to construct their own `TypeOrmModule.forRoot` inside their `TestingModule` per `audit-log-int-harness.ts:90` and friends — no test-side change.

**Alternatives considered.**

- *New `DatabaseModule` re-exported by `AppModule`.* Rejected: indirection, no benefit, 25 modules to consider migrating later.
- *Read connection options directly from `data-source.ts`.* Rejected: `data-source.ts` exports an instantiated `DataSource` (not just options), and TypeORM throws if you pass that instance into `forRootAsync` (it would attempt to re-initialize a live connection). A factory that reuses the *options* shape is the cleanest reuse.

**Trade-offs.**

- The factory and `data-source.ts` carry duplicated option shape. Mitigation: extract a shared `buildDataSourceOptions()` helper in `apps/api/src/database-options.ts` consumed by both.

### ADR-FEATURE-FLAGS-NOOP-DEFAULTS

**Decision.** Six environment flags gate the external-credential paths. Defaults are the disabled side, so `node dist/main` boots without any external service available.

| Flag | Default | When ON, requires |
|---|---|---|
| `OTEL_SDK_DISABLED` | `true` | OTLP endpoint URL |
| `EMAIL_DISPATCH_PROVIDER` | `noop` | SendGrid / Postmark / SMTP creds (per the slice #22 adapter selected) |
| `AUDIT_ARCHIVAL_ENABLED` | `false` | S3-compat creds (PR #174) |
| `PHOTO_STORAGE_ENABLED` | `false` | S3-compat creds (slice #18) |
| `M3_PO_AGGREGATE_ENABLED` | `false` | (already exists, kept off for bootstrap path) |
| `OPENTRATTOS_AGENT_ENABLED` | `false` | Hermes web_via_http_sse upstream (already exists) |

A new `NoopEmailAdapter` is added under `apps/api/src/shared/email-dispatch/adapters/noop.ts`. It satisfies the same `EmailDispatchAdapter` interface, returns a `Result.ok({ providerMessageId: 'noop' })` for every recipient, and logs at `debug` level. Selection is via `EMAIL_DISPATCH_PROVIDER=noop` in the existing factory at `apps/api/src/shared/email-dispatch/email-dispatch.module.ts`.

**Rationale.**

- Self-hosters and the bootstrap smoke spec must be able to boot with zero external dependencies. Without flags, every BC that holds an S3 client / SMTP transport / OTLP exporter throws on init.
- The flags ARE NOT license gates per ADR-028. They're operator switches that map cleanly to "I have this credential / I don't".
- `EMAIL_DISPATCH_PROVIDER=noop` reuses the existing provider-agnostic factory (slice #22, ADR-039). No new abstraction.
- `OTEL_SDK_DISABLED` is the convention OpenTelemetry's own SDK honours — same env name, no new vocabulary.

**Alternatives considered.**

- *Single `STAGING_MODE=true` master flag.* Rejected: hides per-flag intent; an operator with real S3 but no SMTP can't selectively enable.
- *Try/catch around external client construction inside each BC.* Rejected: hides errors that should surface in production. Explicit flag = explicit operator intent.

**Trade-offs.**

- Operators who flip a flag without providing creds get a clear failure on first call (e.g. `EmailDispatchService.dispatch()` throws when `EMAIL_DISPATCH_PROVIDER=sendgrid` and `SENDGRID_API_KEY` is unset). That failure mode is by design.

### ADR-MIGRATE-THEN-START-SCRIPT

**Decision.** Container startup is a 2-step shell script (`apps/api/scripts/migrate-and-start.sh`) that runs `node dist/cli/migrate.js` (a new tiny entry that loads `data-source.ts` and runs `migration:run`) and then `exec node dist/main`. Failure of step 1 exits non-zero before NestJS starts.

**Rationale.**

- TypeORM's `migrationsRun: true` option in `DataSource` config triggers migrations during NestJS module init. That's a hidden side-effect on the http boot path: a slow migration would time out the readiness probe; a failed migration would leave the app partially initialized.
- A discrete migrations step makes the boot phase observable in container logs (one log block before the NestJS banner), allows a `docker compose run app npm run db:migrate` separation if an operator wants to migrate manually, and keeps the bootstrap smoke spec independent (it sets up the schema via the spec's own helpers rather than depending on the script).
- `exec` (not just `node dist/main`) is required so PID 1 in the container is the Node process, not the shell — required for `SIGTERM` to reach NestJS for graceful shutdown.

**Alternatives considered.**

- *`migrationsRun: true` in DataSource config.* Rejected: hidden side-effect, no log boundary, can't selectively skip.
- *Init container in compose that runs migrations then exits.* Rejected: needs separate image with the same node_modules → defeats single-image pattern (ADR-028). Compose-level coordination is also harder to debug than a script in the image.

**Trade-offs.**

- A failing migration on a healthy-but-empty DB blocks startup. The error is in container logs (visible to the operator); same UX as Rails/Django apps. Well-understood.

### ADR-HEALTH-EXCLUDED-FROM-API-PREFIX

**Decision.** The `/health` endpoint (Terminus-backed, DB ping + memory heap indicator) is mounted at root. NestJS `setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] })` ensures it stays at `/health` even after the `/api` prefix is set.

**Rationale.**

- Docker `HEALTHCHECK` URLs are best when stable and short. `/health` is a 30-year convention.
- Keeping the path out of `/api/*` means it doesn't get exposed via Swagger autodiscovery (Swagger lives under `/api/docs`) and doesn't appear in MCP tool generation — both correct, since it's a deployment-layer concern, not an MCP capability.
- The bootstrap smoke spec asserts `GET /health → 200` as one of its checks, providing zero-dependency boot validation.

**Alternatives considered.**

- *`/api/health`.* Rejected: pollutes the MCP/Swagger surface; longer URL in HEALTHCHECK directive.
- *Separate side-car health server on a different port.* Rejected: extra moving part for no benefit.

**Trade-offs.**

- A future spec covering `/api/livez`-style endpoints (separate from human `/health`) can be added without disturbing this design.

### ADR-SINGLE-IMAGE-OMNIBUS

**Decision.** Implements ADR-028 (canonical project ADR). One Dockerfile at repo root, multi-stage Node 20 alpine. Stage `build` runs `turbo run build` for both `@opentrattos/api` and `@opentrattos/web`. Stage `runtime` ships the api dist + web dist sibling-mounted at `/app/api/dist/` and `/app/web/dist/`. NestJS `ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', '..', 'web', 'dist'), exclude: ['/api/*', '/health'] })` resolves at runtime via that relative join.

**Rationale.**

- See ADR-028 in `docs/architecture-decisions.md` for the canonical reasoning.
- The relative `join(__dirname, '..', '..', 'web', 'dist')` works because:
  - At runtime, `__dirname` for the compiled NestJS code is `/app/api/dist/<subdir>/`.
  - Two `..` traversals reach `/app/api/`, then `/app/`.
  - `/app/web/dist/` is the sibling location set by the Dockerfile COPY.
- The same relative path works in dev (`apps/api/dist/...` → `apps/api/`, `..`, `apps/`, `web/dist`) so the smoke spec can assert SPA serving identically locally and in container.

**Alternatives considered.**

- *Absolute path `/app/web/dist`.* Rejected: doesn't work in dev; couples to container layout.
- *Env var `SPA_DIST_PATH` resolved at runtime.* Rejected: extra contract surface for a path that's structurally fixed.

**Trade-offs.**

- The `__dirname` relative join breaks if someone moves the api dist output. Mitigation: comment the join in `app.module.ts` documenting the assumption + bootstrap smoke spec catches it on first refactor.

### ADR-VITE-PROXY-NO-REWRITE

**Decision.** `apps/web/vite.config.ts` removes the `rewrite: path => path.replace(/^\/api/, '')` from the dev proxy. Dev server forwards `/api/foo` to `http://localhost:3001/api/foo` as-is, matching the new NestJS global prefix.

**Rationale.**

- Pre-change asymmetry: in dev, browser hits `/api/audit-log/x` → Vite proxies to NestJS as `/audit-log/x`. In prod with the new global prefix, browser hits `/api/audit-log/x` → Caddy/etc. would need different routing. Removing the rewrite makes dev and prod identical.
- The web client (`apps/web/src/api/client.ts:7`) is already `BASE_URL = '/api'` — unchanged.
- All test files that hit URLs (`AuditLogScreen.test.tsx:140` etc.) reference `/api/audit-log/export.csv` — unchanged.

**Alternatives considered.**

- *Keep dev rewrite + don't add prod global prefix; have NestJS routes at root + Caddy strip `/api/` in prod.* Rejected: Caddy stripped prefix doesn't work with the omnibus single-image pattern (no Caddy in the runtime image). Adding Caddy back contradicts ADR-028.
- *Dev = no prefix, prod = prefix.* Rejected: dev/prod asymmetry is a class of bugs we don't need.

**Trade-offs.**

- Anyone with a long-running local dev branch needs to pull the vite.config.ts change. One-line diff.

### ADR-DUAL-COMPOSE-COMMUNITY-VS-OPERATOR

**Decision.** Two compose files reference the same single image:

| File | Bind | Audience |
|---|---|---|
| `docker-compose.yml` (repo root) | `0.0.0.0:3000:3001` | Community self-hoster |
| `deploy/docker-compose.prod.yml` | `127.0.0.1:3201:3001` | Operator on cloudflared host |

Both have `db` (postgres:16-alpine, named volume) + `app` (the single image). No third service.

**Rationale.**

- Two distinct audiences, two distinct binds. A community user without cloudflared needs to expose on `0.0.0.0`; an operator with cloudflared needs to NOT expose to eth0.
- Defense-in-depth bind `127.0.0.1:3201:3001` matches the modern VPS pattern (`actual-server`, `palafito-staging-wp`, `opentrattos-postgres-test`). Twenty CRM and Paperclip use `0.0.0.0` but those are legacy from before the loopback-bind convention.
- The 3201 port number was chosen because it's free on the live VPS (verified via SSH `ss -ltnp`), below the k3s NodePort range (4000-32767), and visually consistent with the 3xxx Docker port band on this VPS (3000=Twenty, 3101=Paperclip, 3201=trattos).

**Alternatives considered.**

- *Single compose with an env-controlled bind.* Rejected: two audiences shouldn't share one compose. Operator needs `depends_on` chains, healthchecks, named volumes locked to `/opt/opentrattos`; community needs simpler defaults.
- *Operator compose lives outside the repo (e.g. in eligia-core).* Rejected: deploy artifacts for openTrattOS belong with openTrattOS source. Cross-repo coupling is more friction than the one extra file.

**Trade-offs.**

- Both files must stay in sync re: env contract. Mitigation: shared `.env.example` files with comments calling out per-audience defaults; the bootstrap smoke spec exercises the api image with the same envs both files use.

### ADR-PUBLIC-GHCR-VISIBILITY

**Decision.** The GHCR package `ghcr.io/wizarck/opentrattos` is set to **public** visibility post-first-push. The README quickstart references the public image without auth.

**Rationale.**

- GHCR personal-namespace packages default to private. A community user who runs `docker pull ghcr.io/wizarck/opentrattos:latest` without auth gets a 401 against a private image, breaking the quickstart.
- Public visibility is the AGPL distribution promise: anyone can pull. License (AGPL-3.0) is enforced via the LICENSE file + repo metadata, not via image gating.
- Operational impact: GHCR's free public-image rate limits are generous (10k/day per source IP) and we're not in CDN territory.

**Alternatives considered.**

- *Keep private + require GitHub auth.* Rejected: contradicts AGPL distribution intent.
- *Publish to Docker Hub instead.* Deferred (R10 in roadmap). Docker Hub is the more discoverable target but requires creating an org; GHCR is the existing namespace.

**Trade-offs.**

- Public images can be pulled by anyone, including for-profit competitors. Acceptable: that's exactly what AGPL says they may do (with reciprocity obligations on derivative network services).

## Validation strategy

The bootstrap smoke spec at `apps/api/test/bootstrap.e2e-spec.ts` is the load-bearing artefact for this slice. It must:

1. Boot AppModule against an ephemeral Postgres (reuse `docker-compose.test.yml` via the existing `JEST_INT_DB_URL` pattern).
2. Assert all 25 BCs initialise without error.
3. Assert each of the 6 feature flags is honoured (4 flags off by default → external client NOT constructed; 2 enabled paths → skipped under this spec).
4. Assert `GET /health → 200` with `{ status: 'ok', info: { database: { status: 'up' }, ... } }`.
5. Assert `GET / → 200 text/html` (the SPA `index.html` served via ServeStaticModule).
6. Assert `GET /api/docs → 200` (Swagger UI loads).
7. Assert `GET /api/audit-log → 401` (route exists but enforces auth; if we're not enforcing auth in fase de prueba, then `200` with empty list — TBD per follow-up R8).

The CI runs the smoke spec under `jest-integration.config.ts` with `runInBand`. Any failure → block the PR.

The Docker image build is exercised by `.github/workflows/build-images.yml` on every master push. A failed Dockerfile blocks the workflow and surfaces as a red status check in the PR's commit stream (since this slice's PR will be the first to add the workflow, the workflow runs on master post-merge — operator-side smoke test is the first prod-touching gate).
