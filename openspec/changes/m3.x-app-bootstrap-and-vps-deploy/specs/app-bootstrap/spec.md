# Spec — app-bootstrap (m3.x-app-bootstrap-and-vps-deploy)

## Capability

The monolith arranges as a single boot graph against a runtime-provided Postgres URL, with feature flags gating each external-credential dependency. NestJS serves both the API (under `/api/*`) and the SPA (under `/`) from a single process.

## ADDED Requirements

### Requirement: AppModule resolves DataSource from DATABASE_URL at boot

The system SHALL register `TypeOrmModule.forRootAsync` in `AppModule.imports` with a factory that reads `DATABASE_URL` and constructs `DataSourceOptions` matching the shape exported by `apps/api/src/data-source.ts`.

#### Scenario: boot succeeds against a healthy Postgres

- WHEN `node dist/main` runs with `DATABASE_URL=postgresql://user:pass@host:5432/db` pointing at a reachable Postgres
- THEN every `TypeOrmModule.forFeature([...])` call across the 25 BCs resolves
- AND the NestJS app reaches the `listen()` step without error
- AND the log emits "🍷 nexandro API running on http://localhost:3001"

#### Scenario: boot fails fast with a clear error when DATABASE_URL is unset

- WHEN `node dist/main` runs without `DATABASE_URL` in the environment
- THEN the process exits with non-zero code within 5 seconds
- AND the log includes a recognisable error referencing the missing env var

#### Scenario: boot fails fast when DATABASE_URL points at an unreachable Postgres

- WHEN `node dist/main` runs with `DATABASE_URL` pointing at a non-listening port
- THEN the process exits with non-zero code within 30 seconds (TypeORM connection retry budget)
- AND the log surfaces the underlying TCP error

### Requirement: Six feature flags gate external-credential dependencies

The system SHALL honour six environment flags whose default values represent the disabled side, so the app can boot without any external credential available.

| Flag | Default | Behaviour when default |
|---|---|---|
| `OTEL_SDK_DISABLED` | `true` | `apps/api/src/otel-bootstrap.ts` early-returns; no exporter constructed |
| `EMAIL_DISPATCH_PROVIDER` | `noop` | `NoopEmailAdapter` selected; dispatches return `Result.ok({ providerMessageId: 'noop' })` |
| `AUDIT_ARCHIVAL_ENABLED` | `false` | The daily S3 archival cron (PR #174) does not register |
| `PHOTO_STORAGE_ENABLED` | `false` | The S3 signed-URL surface (slice #18) does not construct an S3 client; the 90-day retention cron does not register |
| `M3_PO_AGGREGATE_ENABLED` | `false` | (already exists per ADR-GR-PO-STATE-TRANSITION) PO/GR state transitions remain inert |
| `NEXANDRO_AGENT_ENABLED` | `false` | (already exists) `AgentChatModule` SSE endpoint returns 404 |

#### Scenario: app boots with all defaults and no external creds

- WHEN `node dist/main` runs with no flag overrides AND no SendGrid / S3 / OTLP creds in env
- THEN the app reaches `listen()` without error
- AND `OTEL_SDK_DISABLED=true` is the active state (no OTLP exporter constructed)
- AND `EMAIL_DISPATCH_PROVIDER=noop` is the active state (NoopEmailAdapter selected)
- AND each disabled cron is absent from the `ScheduleModule` registry

#### Scenario: enabling a flag without its required creds fails on first use, not at boot

- WHEN the operator sets `EMAIL_DISPATCH_PROVIDER=sendgrid` but does not provide `SENDGRID_API_KEY`
- THEN `node dist/main` still boots
- AND the first call to `EmailDispatchService.dispatch(...)` fails with a clear error referencing the missing key
- AND the failure is surfaced in the calling slice's audit envelope (e.g. `EMAIL_DISPATCH_FAILED`)

### Requirement: Migrations run before app accepts traffic

The system SHALL apply all pending TypeORM migrations during container startup, and SHALL refuse to accept traffic if any migration fails.

#### Scenario: fresh DB applies all migrations on first start

- WHEN the container starts against an empty Postgres database
- THEN `migrate-and-start.sh` runs `node dist/cli/migrate.js` (or equivalent), which invokes `data-source.ts`'s `migration:run`
- AND all 41+ migrations apply in order
- AND the `nexandro_migrations` table records each applied migration
- AND only after the migrations complete does the script `exec node dist/main`

#### Scenario: re-run on an already-migrated DB is a no-op

- WHEN the container restarts against a Postgres where all migrations are already applied
- THEN the migrations step completes in <2 seconds
- AND no additional rows are inserted into `nexandro_migrations`
- AND the app starts normally

#### Scenario: failing migration blocks app start

- WHEN a migration throws during `migration:run`
- THEN the script exits with non-zero code
- AND `node dist/main` is NOT executed
- AND the container exits, surfacing the migration error in `docker logs`

### Requirement: /health endpoint reports DB connectivity

The system SHALL expose a `GET /health` endpoint at root (NOT under the `/api` prefix) that returns the result of a Terminus-style indicator suite covering at minimum a DataSource ping and a memory heap indicator.

#### Scenario: healthy app returns 200

- WHEN the app is running and the DataSource is reachable
- WHEN a client GETs `/health`
- THEN the response is `200 OK`
- AND the body contains `{ status: 'ok', info: { database: { status: 'up' }, memory_heap: { status: 'up' } }, error: {}, details: { database: { status: 'up' }, memory_heap: { status: 'up' } } }`

#### Scenario: DB-disconnected app returns 503

- WHEN the app is running but Postgres is unreachable (network drop, DB shutdown)
- WHEN a client GETs `/health`
- THEN the response is `503 Service Unavailable`
- AND the body's `error.database.status` is `'down'`

#### Scenario: /health is excluded from the /api global prefix

- WHEN the app boots with `setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] })`
- THEN `GET /health` resolves
- AND `GET /api/health` returns 404 (no route registered there)

### Requirement: NestJS serves the SPA via the same process under /

The system SHALL serve the Vite-built SPA static files under `/` via `@nestjs/serve-static`, with deep-route fallback to `index.html` for client-side routing, while reserving `/api/*` and `/health` for the backend.

#### Scenario: GET / returns the SPA index.html

- WHEN a client GETs `/`
- THEN the response is `200 OK` with `Content-Type: text/html`
- AND the body contains the `<div id="root">` mount point of the Vite-built `index.html`

#### Scenario: GET /assets/<hash>.js returns the SPA bundle

- WHEN a client GETs the path of any Vite-emitted JS chunk (e.g. `/assets/index-a1b2c3.js`)
- THEN the response is `200 OK` with `Content-Type: application/javascript`
- AND the cache headers reflect Vite's far-future immutable convention

#### Scenario: deep client route falls back to index.html

- WHEN a client GETs an unknown path that is NOT under `/api/*` or `/health` or `/assets/*` (e.g. `/audit-log/incident/abc-123`)
- THEN the response is `200 OK` with the SPA `index.html`
- AND the SPA's React Router resolves the path client-side

#### Scenario: GET /api/* dispatches to NestJS controllers

- WHEN a client GETs `/api/audit-log/export.csv?from=2026-01-01&to=2026-01-31`
- THEN the request is dispatched to the `AuditLogController` via the global `/api` prefix
- AND ServeStaticModule does NOT intercept the request

#### Scenario: GET /api/docs serves Swagger UI

- WHEN a client GETs `/api/docs`
- THEN Swagger UI is served at that URL (the global `/api` prefix + the `'docs'` Swagger setup string compose to `/api/docs`)

### Requirement: All 25 BCs initialize against a shared DataSource

The system SHALL boot every BC module currently imported in `AppModule` (Iam, Ingredients, Suppliers, Recipes, Menus, Cost, ExternalCatalog, Dashboard, Labels, AiSuggestions, AuditLog, AgentChat, AgentCredentials, Inventory, CostSnapshot, AiObservability, EmailDispatch, Procurement, PhotoStorage, PhotoIngestion, PhotoIngestionRouting, PhotoIngestionRevocation, ReviewQueue, Recall, Haccp, ComplianceExport, I18nM3Export) against the single `forRootAsync`-resolved DataSource, without any module requiring its own root-level TypeORM configuration.

#### Scenario: bootstrap smoke spec confirms all BCs initialize

- WHEN the bootstrap smoke spec at `apps/api/test/bootstrap.e2e-spec.ts` runs
- THEN it builds the AppModule against the ephemeral Postgres at `JEST_INT_DB_URL`
- AND the call to `app.init()` completes without throwing
- AND a probe of `app.get(<repository>)` for at least one repository per BC resolves to a defined repository instance
