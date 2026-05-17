# `@nexandro/web` — kitchen + owner web app

Vite + React 18 + TanStack Query + React Router. Tablet-first kitchen surface (Journey 1, 4) + mobile-aware Owner dashboard (Journey 3). NOT server-side rendered — `apps/api/` is the contract per ADR-013, this app is one consumer of it.

## Local development

```bash
# from repo root
npm install
npm run dev --workspace=apps/api    # backend on :3000
npm run dev --workspace=apps/web    # frontend on :5173
```

`/api/*` requests proxy to `http://localhost:3000` (see `vite.config.ts`).

Copy `.env.example` to `.env.local` and set `VITE_DEMO_ORG_ID` to a real organisation UUID from your local DB seed.

## Routes

| Path | Purpose | Status |
|---|---|---|
| `/poc/owner-dashboard` | J3 proof-of-concept Owner dashboard | dev-only — replaced by `m2-owner-dashboard` (#9) |

The PoC screen exists to verify the API → React → ui-kit chain end-to-end during `m2-ui-foundation`. It is NOT the canonical M2 owner dashboard — slice #9 ships that with top/bottom-5 ranking + drill-down per Journey 3.

## Stack

- **Vite 6** — dev server + build pipeline.
- **React 18** — UI runtime (locked by ADR-019).
- **TanStack Query 5** — REST cache + revalidation. Sub-200 ms refetch budget per PRD M2 §NFR Performance.
- **React Router 6** — client routing.
- **Tailwind 4** — styling, with `@theme` block consuming OKLCH tokens from `packages/ui-kit/src/tokens.css`.

See `docs/architecture-decisions.md` ADR-020 for the full rationale + alternatives considered.
