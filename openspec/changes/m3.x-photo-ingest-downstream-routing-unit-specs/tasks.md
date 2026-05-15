# Tasks — m3.x-photo-ingest-downstream-routing-unit-specs

## §1 Spec files

- [x] `apps/api/src/photo-ingestion-routing/application/photo-ingestion-routing.subscriber.spec.ts` — 3 cases.
- [x] `apps/api/src/photo-ingestion-routing/application/photo-ingestion-routing.service.spec.ts` — 10 cases covering ACs 1-8 + 2 invariants.

## §2 Local gates

- [x] Specs compile against the shipped service + subscriber signatures.
- [ ] CI typecheck + lint + test pass (verified post-merge).

## Deferred

- INT spec against real Postgres (`m3.x-photo-ingest-routing-int`).
- Routing UI surfacing (j12 extension).
