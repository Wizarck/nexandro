# m3.x-photo-ingest-retroactive-correction-mcp-and-tests

## Problem

Slice H1b `m3-photo-ingest-retroactive-correction-handler` (PR #152) shipped the producer side with reduced scope: MCP capability (§7) and unit specs (§9) were deferred. This followup closes both.

## Proposal

Two pieces of work in one slice (no migration, no production-code behaviour change in the photo-ingestion BC):

1. **MCP capability**: register `inventory.retroactive-correct-photo-ingestion` so agents can call the retro-correction endpoint via Hermes / AgentChatWidget. Proxies `POST /m3/photo-ingest/items/:itemId/retroactive-correction` with the same restPathParams + restBodyExtractor pattern as `inventory.sign-photo-ingestion`. Count bumps: `WRITE_CAPABILITIES` 52→53, MCP smoke registered-keys 59→60, `INVENTORY_WRITE_CAPABILITIES` 3→4.
2. **Unit specs**:
   - `retroactive-correction.service.spec.ts` (6 cases): happy + second-edit + idempotent + not-signed + cross-tenant + empty-field.
   - `ingestion.controller.spec.ts` extension (3 cases): forwards orgId/itemId/correctedByUserId to service, cross-org body 403, error mapping (cross-tenant→404, not-correctable→422, empty-field→422). Plus the new method name added to the `@Roles` metadata it.each table.

## FR mapping

Closes FR28-FR31 + FR44 test coverage gaps left by PR #152's CONDITIONAL signoff. Surfaces the operation on MCP so Hermes can drive it.

## Out of scope

- The PhotoIngestionRevocation BC + its 3 new audit event types + downstream Lot/GR flagging (filed as `m3.x-photo-ingest-downstream-revocation-listener`).
- INT spec for the producer + MCP cap (filed as `m3.x-photo-ingest-retroactive-correction-int`).
- UI surface for the operation (filed as `m3.x-photo-ingest-retroactive-correction-ui`).
