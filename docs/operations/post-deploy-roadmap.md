# Post-deploy Roadmap

Catalogue of work explicitly deferred from the initial deployment slice (`m3.x-app-bootstrap-and-vps-deploy`). Each row carries a trigger condition (don't start before this is true), an effort estimate, and notes on dependencies or sequencing.

Owner: Arturo. Reviewed at the end of each operator-facing slice cycle.

| ID | Item | Trigger to start | Effort | Notes |
|---|---|---|---|---|
| R1 | Helm chart `eligia-core/helm/nexandro-stack/` for Phase 2 k8s prod | Phase 1 Docker stable ≥ 2 weeks of operator use without rollback | M | Chart layout mirrors `eligia-stack/`. Fleet GitOps for deploy. Reuses the same GHCR images (`nexandro-api`, `nexandro-web`). NodePorts for api+web go on the lock-list (see R6). values-vps.yaml uses `hostPath` persistence (single-node convention) instead of PVCs. |
| R2 | Audit-log archival enabled (M3 PR #174 in active mode) | Need to exercise regulatory retention against real storage; or first compliance audit | S | Flip `AUDIT_ARCHIVAL_ENABLED=true`. Picks: MinIO container in compose (self-hosted, lossless integration test) vs external S3/Hetzner Object Storage (closer to prod). MinIO is the lower-friction first step. |
| R3 | Real SMTP/Postmark for email dispatch (M3 slice #22 in non-noop mode) | First operator action that should deliver mail (recall dossier, APPCC export, AI budget alert) | S | Picks: Mailtrap (test inbox) for staging, Postmark (transactional) for prod. `EMAIL_DISPATCH_PROVIDER` already provider-agnostic; only secrets + a per-provider adapter wiring. |
| R4 | Postgres backups to Hetzner Object Storage | Before data on the VPS becomes non-throw-away (first real org seeded, first compliance event captured) | M | Same TODO as `runbook-vps-disaster-recovery.md` §Prevention for Twenty CRM. Two paths: Velero (k8s-native, requires Phase 2) vs `pg_dump` cron + `rclone` to Hetzner Object Storage (Docker-compatible, runnable in Phase 1). Latter is the bridge until Phase 2. |
| R5 | Demo seed / multi-tenant fixtures | First UX walkthrough with a non-developer operator | S | Script under `apps/api/scripts/seed-demo.ts`. Creates 1 organization + 1 OWNER + 1 MANAGER + 3 STAFF + ES category seed (already exists in M1) + 5 ingredients + 2 suppliers. Idempotent via `ON CONFLICT DO NOTHING`. |
| R6 | NodePort lock-list update (Phase 2 prereq) | Same trigger as R1 | XS | Add api + web NodePorts to `eligia-nodeport-firewall.service` `--dports` list (per `runbook-nodeport-firewall.md` §"Adding a new NodePort"). Touch on the same PR as the Helm chart so they ship coupled. |
| R7 | `runbook-vps-disaster-recovery.md` tunnel-ID correction | Anytime — independent | XS | Filed in `eligia-core` (not this repo). The runbook documents tunnel ID `da6c585e-…`; live config on the VPS uses `675fa973-4c22-4b1c-9fd4-a52fad422ca4`. Discovered while wiring `nexandro.palafitofood.com`. |
| R8 | Auth real (replace open API + bind-to-loopback) | First real (non-throw-away) tenant | M | Today's perimeter is (a) `127.0.0.1:3201` bind, (b) cloudflared as TLS terminator. No application-level auth. Options: cloudflared Access policy (simplest, Cloudflare-side) OR JWT + IAM module exists (slice #1 wired but not enforced) — pick depends on whether external integrations (MCP, mobile) need direct API access. |
| R9 | `npx nexandro` CLI as secondary distribution | Community feedback shows non-Docker users / first developer-experience complaint | M | New workspace package `@nexandro/cli`. Wraps `docker compose pull && docker compose up -d` from the user's cwd, with a `--detach`/`--no-detach` toggle. Keeps Docker as primary (per AGENTS.md §1) but lowers the "do I have Docker?" barrier for npm-fluent devs. Pattern: n8n (`npm install n8n` + `docker run n8nio/n8n`). |
| R10 | Mirror image to `docker.io/nexandro/nexandro` | First user reports `docker pull ghcr.io/wizarck/...` friction | S | Docker Hub is the default `docker pull` target — many tutorials assume it. Requires creating Docker Hub org `nexandro` + extending the GHA workflow to push to both registries (`docker buildx build --push -t ghcr.io/... -t docker.io/...`). Optional once GHCR public visibility is confirmed working in the wild. |
| R11 | Re-split into separate api + web images | SaaS Enterprise tier needs CDN-served frontend OR independent scaling curves emerge | S | Trivial reverse of B1: extract `apps/web/dist/` into a thin Caddy image, restore a Caddyfile-based edge proxy, two compose services. Don't do until there's a measurable reason. |

## Items NOT in this roadmap (and why)

- **Cloudflared route automation** (declarative configmap vs hand-editing `/etc/cloudflared/config.yml`) — only worth automating once 2+ new workloads beyond trattos hit the VPS. Today's manual edit pattern is fine.
- **MCP server image build** (`packages/mcp-server-nexandro/`) — separable per ADR-013 and consumed by the Enterprise SaaS, not by this open-core deploy. Belongs to the private Nexandro Enterprise repo's pipeline.
- **i18n catalan/euskera/galego** — slice #15 (`m3-appcc-i18n-ui`) shipped the locale infra and 14 EU 1169 allergen entries; full string coverage is tracked under M2 slices, not deployment.
- **AI suggestions live providers** — slice #16/#17 ship adapter stubs by design (vision LLM provider DI). Real wiring lives in Nexandro Enterprise.

## How to reactivate an item

1. Open an OpenSpec change scoped to that single item (or a coherent bundle of 2–3 if they share infrastructure — e.g. R2 + R3 if both move together to Postmark + S3).
2. Reference this row in `proposal.md` § "Context" so the roadmap entry can be retired in the same PR that ships the item.
3. After merge: remove the row from this table and (if no rows remain in a column) the column itself.
