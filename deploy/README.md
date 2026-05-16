# Operator deployment — trattos.palafitofood.com

Step-by-step procedure for deploying the openTrattOS community image to the eligia-prod VPS (`178.104.140.21`) behind the existing cloudflared tunnel.

For community / laptop quickstart, use the repo-root `docker-compose.yml` instead — see the project README.

## Prerequisites

- SSH access to `root@178.104.140.21`.
- Cloudflare dashboard access for the `palafitofood.com` zone (to create the DNS CNAME).
- Local `git` clone of this repo at the slice's branch / merge SHA.

## Step 1 — Confirm port 3201 is free on the VPS

```bash
ssh root@178.104.140.21 'ss -ltnp | grep :3201 || echo "3201 free"'
# Expect: "3201 free"
```

## Step 2 — Create the directory + ship the compose + env

```bash
ssh root@178.104.140.21 'mkdir -p /opt/opentrattos'
scp deploy/docker-compose.prod.yml root@178.104.140.21:/opt/opentrattos/docker-compose.yml
scp deploy/.env.example          root@178.104.140.21:/opt/opentrattos/.env.example
```

## Step 3 — Generate the Postgres password and write `.env` on the VPS

```bash
ssh root@178.104.140.21 << 'EOF'
cd /opt/opentrattos
PWD=$(pwgen -s 32 1)
sed "s|GENERATE-WITH-PWGEN-32-1|$PWD|" .env.example > .env
chmod 600 .env
echo "Wrote .env with generated password ($(echo -n "$PWD" | wc -c) chars)"
EOF
```

## Step 4 — Pull the image (one-time GHCR public-visibility prep)

The first time after the GHA workflow publishes the image, set the GHCR package visibility to public via the GitHub UI:

1. Open https://github.com/Wizarck?tab=packages
2. Click the `opentrattos` package
3. Package settings → Change visibility → Public
4. Confirm

After that, `docker pull` works without GitHub auth from the VPS:

```bash
ssh root@178.104.140.21 'docker pull ghcr.io/wizarck/opentrattos:latest'
```

## Step 5 — Bring the stack up

```bash
ssh root@178.104.140.21 'cd /opt/opentrattos && docker compose up -d'
```

## Step 6 — Internal smoke test

```bash
ssh root@178.104.140.21 'curl -s http://127.0.0.1:3201/health | head -c 200'
# Expect: {"status":"ok","info":{"database":{"status":"up"}, ...}}

ssh root@178.104.140.21 'curl -s http://127.0.0.1:3201/api/docs | head -c 100'
# Expect: HTML containing "Swagger UI"
```

If `/health` returns non-200, check `docker compose logs app` — common causes: `DATABASE_URL` mismatch, migrations failure, missing env.

## Step 7 — Insert cloudflared ingress entry on the VPS

Edit `/etc/cloudflared/config.yml` on the VPS and insert the snippet from `deploy/cloudflared-ingress-trattos.snippet.yml`. The block must go **inside the existing `ingress:` list, immediately before** the final `- service: http_status:404` catch-all entry.

```bash
ssh root@178.104.140.21 'nano /etc/cloudflared/config.yml'
# … paste the snippet …
ssh root@178.104.140.21 'cloudflared tunnel ingress validate --config /etc/cloudflared/config.yml'
# Expect: "OK" / no errors. If errors, fix YAML and re-validate. Do NOT restart yet.
ssh root@178.104.140.21 'systemctl restart cloudflared'
ssh root@178.104.140.21 'systemctl status cloudflared --no-pager | head -5'
# Expect: active (running)
```

## Step 8 — Create the Cloudflare DNS CNAME

In the Cloudflare dashboard, zone `palafitofood.com`, add a DNS record:

| Field | Value |
|---|---|
| Type | CNAME |
| Name | `trattos` |
| Target | `675fa973-4c22-4b1c-9fd4-a52fad422ca4.cfargotunnel.com` |
| Proxy | Proxied (orange cloud) |
| TTL | Auto |

## Step 9 — End-to-end smoke test

```bash
# From your desktop (anywhere with internet):
curl -s https://trattos.palafitofood.com/health | head -c 200
# Expect: {"status":"ok","info":{"database":{"status":"up"}, ...}}

open https://trattos.palafitofood.com
# Expect: SPA loads in browser
```

## Updating to a new image

After a new GHA workflow run publishes a fresh `:latest`:

```bash
ssh root@178.104.140.21 'cd /opt/opentrattos && docker compose pull && docker compose up -d'
```

## Rollback

The image carries a `:sha-<7char>` tag for every published commit. To pin to a specific known-good SHA:

```bash
ssh root@178.104.140.21 << 'EOF'
cd /opt/opentrattos
sed -i 's|opentrattos:latest|opentrattos:sha-abc1234|' docker-compose.yml
docker compose pull && docker compose up -d
EOF
```

To revert, restore `:latest` and `up -d`.

## Postgres backups (pending — see roadmap R4)

This deployment does NOT yet have automated backups. Until R4 lands, periodically:

```bash
ssh root@178.104.140.21 << 'EOF'
cd /opt/opentrattos
docker compose exec -T db pg_dump -U opentrattos opentrattos | gzip > /opt/opentrattos/backups/$(date -u +%F-%H%M).sql.gz
EOF
```

## See also

- `cloudflared-ingress-trattos.snippet.yml` — the exact ingress entry to paste.
- `docs/operations/post-deploy-roadmap.md` — R1-R11 deferred items (Helm chart, real S3, real SMTP, backups, demo seed, …).
- `docs/architecture-decisions.md` ADR-028 — why a single omnibus image.
