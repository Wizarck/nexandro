# Spec — deploy-vps-docker (m3.x-app-bootstrap-and-vps-deploy)

## Capability

The monolith ships as one GHCR image (`ghcr.io/wizarck/opentrattos:latest`, public visibility per ADR-028) orchestrated by docker-compose on a single host. Two compose files target two audiences (community quickstart + operator behind cloudflared); both reference the same image. The operator compose maps to the existing eligia-prod VPS via a cloudflared ingress entry on `trattos.palafitofood.com`.

## ADDED Requirements

### Requirement: Single Docker image bundles api + web

The system SHALL ship a single Docker image at `ghcr.io/wizarck/opentrattos:latest` that contains both the NestJS API runtime (under `/app/api/`) and the Vite-built SPA static files (under `/app/web/dist/`), and SHALL NOT publish a separate image for the web layer.

#### Scenario: image runs the api and serves the SPA

- WHEN an operator runs `docker run -p 3201:3001 -e DATABASE_URL=... ghcr.io/wizarck/opentrattos:latest`
- THEN the container's process tree shows a single `node /app/api/dist/main` process (not Caddy + Node)
- AND `curl http://localhost:3201/api/docs` returns the Swagger UI
- AND `curl http://localhost:3201/` returns the SPA `index.html`

#### Scenario: image is publicly pullable without auth

- WHEN any user (no GitHub authentication) runs `docker pull ghcr.io/wizarck/opentrattos:latest`
- THEN the pull succeeds
- AND the manifest is retrievable via the GHCR public manifest API

#### Scenario: image is tagged :latest and :sha-<short>

- WHEN the GHA workflow `build-images.yml` runs on a master push
- THEN the resulting image is published with both tags: `:latest` and `:sha-<7-char-git-sha>`
- AND `docker pull ghcr.io/wizarck/opentrattos:sha-abc1234` retrieves the same artifact as `docker pull ghcr.io/wizarck/opentrattos@sha256:<digest>`

### Requirement: Image built by single-job GHA workflow

The system SHALL provide a GitHub Actions workflow at `.github/workflows/build-images.yml` that builds and publishes the image on every master push (paths-filtered to `apps/**`, `packages/**`, `Dockerfile`, `deploy/**`) and on `workflow_dispatch`.

#### Scenario: workflow triggers on relevant master paths

- WHEN a commit is merged to master that touches `apps/api/src/**`
- THEN the workflow runs
- AND on success the new `:latest` tag points at the merge SHA's image

#### Scenario: workflow does NOT trigger on doc-only changes

- WHEN a commit is merged to master that touches only `docs/**` or `README.md`
- THEN the workflow does not run (paths filter excludes them)

#### Scenario: workflow can be triggered manually

- WHEN an operator clicks "Run workflow" in the GHA UI on master
- THEN the workflow runs
- AND publishes a fresh `:latest` tag

#### Scenario: in-flight build is superseded by a newer commit

- WHEN a workflow run is in progress for commit A
- AND commit B is merged to master before A's run completes
- THEN A's run is cancelled by the concurrency group
- AND B's run proceeds

### Requirement: Community quickstart compose at repo root

The system SHALL provide a `docker-compose.yml` at the repository root with two services (`db` + `app`) where `app` binds to host port `3000` on all interfaces.

#### Scenario: clone + up brings the stack online

- WHEN a user runs `git clone https://github.com/Wizarck/openTrattOS.git && cd openTrattOS && cp .env.example .env && docker compose up -d`
- THEN both `db` and `app` containers start
- AND `app` is healthy within 60 seconds
- AND `curl http://localhost:3000/health` returns `200 OK`
- AND `curl http://localhost:3000/` returns the SPA HTML

#### Scenario: app waits for db to be healthy before starting

- WHEN the compose runs
- THEN `app` has `depends_on: { db: { condition: service_healthy } }`
- AND `app` does not attempt to connect until `db`'s `pg_isready` healthcheck passes

#### Scenario: postgres data persists in a named volume

- WHEN the user runs `docker compose down` (without `-v`) and then `docker compose up -d`
- THEN the `opentrattos_pgdata` named volume is preserved
- AND any data written before the down is still present

### Requirement: Operator compose binds to loopback for cloudflared frontends

The system SHALL provide `deploy/docker-compose.prod.yml` with the same two services as the community compose, except `app` binds to `127.0.0.1:3201:3001` (loopback only) so it is not directly reachable from eth0 on the VPS.

#### Scenario: app port is not reachable from external IPs on the VPS

- WHEN the operator deploys `deploy/docker-compose.prod.yml` to the eligia-prod VPS
- AND a client outside the VPS runs `curl -m 5 http://178.104.140.21:3201/health`
- THEN the connection times out (no listener on the public interface)

#### Scenario: cloudflared on the VPS reaches the app via loopback

- WHEN cloudflared (running as the systemd unit on the VPS host) routes `trattos.palafitofood.com` to `http://localhost:3201`
- AND a client runs `curl https://trattos.palafitofood.com/health` from anywhere
- THEN the response is `200 OK` (cloudflared → tunnel → host loopback → docker port-forward → app container)

#### Scenario: env file lives outside the compose

- WHEN the operator scps `deploy/docker-compose.prod.yml` to `/opt/opentrattos/` on the VPS
- AND populates `/opt/opentrattos/.env` with the operator-specific values (DATABASE_URL, FRONTEND_URL, POSTGRES_PASSWORD)
- THEN `docker compose --env-file /opt/opentrattos/.env -f /opt/opentrattos/docker-compose.prod.yml up -d` starts the stack
- AND the `.env` file is NOT in the GHCR image or the compose file itself

### Requirement: Cloudflared ingress snippet routes trattos.palafitofood.com to localhost:3201

The system SHALL provide a `deploy/cloudflared-ingress-trattos.snippet.yml` containing the exact ingress entry to insert into the VPS's `/etc/cloudflared/config.yml`, plus a comment block describing where to insert it (immediately before the `- service: http_status:404` catch-all) and how to reload (`cloudflared tunnel ingress validate --config /etc/cloudflared/config.yml && systemctl restart cloudflared`).

#### Scenario: ingress entry routes the hostname to the app

- WHEN the operator inserts the snippet content into `/etc/cloudflared/config.yml`
- AND runs `systemctl restart cloudflared`
- AND the operator already created the Cloudflare DNS CNAME `trattos.palafitofood.com` → `675fa973-4c22-4b1c-9fd4-a52fad422ca4.cfargotunnel.com`
- THEN a client GETs `https://trattos.palafitofood.com/health` and receives `200 OK`

#### Scenario: ingress validate catches malformed YAML before reload

- WHEN the operator's edit to `/etc/cloudflared/config.yml` introduces a YAML error
- AND the operator runs `cloudflared tunnel ingress validate --config /etc/cloudflared/config.yml`
- THEN cloudflared exits non-zero with the line of the YAML error
- AND the operator does not restart cloudflared (the running config is unaffected)

### Requirement: Deploy procedure is documented in deploy/README.md

The system SHALL provide a `deploy/README.md` that walks an operator from "I have SSH to the VPS" to "trattos.palafitofood.com returns 200" in fewer than 10 numbered steps.

#### Scenario: README covers the end-to-end procedure

- WHEN an operator follows the README in order
- THEN the operator reaches a smoke test step that includes both an internal probe (`curl http://127.0.0.1:3201/health` from the VPS) and an external probe (`curl https://trattos.palafitofood.com/health` from anywhere)
- AND the README explicitly references where to put `POSTGRES_PASSWORD` (in `/opt/opentrattos/.env`, NOT in the compose file)
- AND the README references the cloudflared snippet step + the DNS CNAME the operator must create
