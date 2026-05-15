# m3.x-photo-ingest-downstream-routing-unit-specs

## Problem

Slice H1a `m3-photo-ingest-downstream-routing` (PR #151) shipped functional code without unit specs. The CONDITIONAL signoff committed to a followup that backfills `.spec.ts` coverage for:

- `apps/api/src/photo-ingestion-routing/application/photo-ingestion-routing.service.ts` (727 LOC; 0 specs)
- `apps/api/src/photo-ingestion-routing/application/photo-ingestion-routing.subscriber.ts` (42 LOC; 0 specs)

## Proposal

Add two `.spec.ts` files alongside the source. No production-code change. No new MCP capability, no new audit envelope, no migration.

- `photo-ingestion-routing.service.spec.ts` — 10 cases covering AC-ROUTE-1 through AC-ROUTE-8 plus 2 invariant cases (envelope shape invalid; non-unique-violation persistence error).
- `photo-ingestion-routing.subscriber.spec.ts` — 3 cases: happy forward to `routing.routeSigned`, error swallowing + logging, unknown-aggregate marker on malformed envelope.

## FR mapping

Closes the test gap on FR28 / FR29 / FR30 (photo ingest → downstream routing) by exercising the service contract and the bus subscription glue.

## Out of scope

- INT spec against real Postgres (followup if needed; the unit specs cover the routing decision matrix, not the DB-layer race backstop end-to-end).
- Routing UI surface.
- Per-org routing policy.
