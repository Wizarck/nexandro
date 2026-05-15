# Tasks — m3.x-photo-ingest-retroactive-correction-mcp-and-tests

## §1 MCP capability

- [x] Add `retroactiveCorrectionSchema` zod schema (itemId + orgId + fieldCorrections + optional reason + idempotencyKey).
- [x] Register `inventory.retroactive-correct-photo-ingestion` in `INVENTORY_WRITE_CAPABILITIES` with restMethod POST, restPathTemplate `/m3/photo-ingest/items/:itemId/retroactive-correction`, restPathParams pulling itemId, restBodyExtractor stripping itemId + idempotencyKey.
- [x] Bump `INVENTORY_WRITE_CAPABILITIES` length assertion 3→4 in inventory.spec.ts + add capability-shape test (path, params, body extractor).
- [x] Bump `WRITE_CAPABILITIES` length assertion 52→53 in index.spec.ts.
- [x] Bump smoke registered-keys 59→60 + add `inventory.retroactive-correct-photo-ingestion` to the spot-check list + update comment.

## §2 Service unit spec

- [x] `retroactive-correction.service.spec.ts` — 6 cases:
  - happy: append history + write operatorCorrection + emit HITL_RETROACTIVE_CORRECTION
  - second edit: 2nd history entry preserves the first verbatim
  - idempotent: matching contentHash → no save, no emit, idempotent=true
  - not-signed: throws IngestionItemNotCorrectableError
  - cross-tenant: findById null → throws IngestionCrossTenantError
  - empty-field: reject-band correction empty → throws IngestionCorrectionEmptyError

## §3 Controller unit spec extension

- [x] `ingestion.controller.spec.ts` — 3 new cases:
  - retroactiveCorrection forwards orgId/itemId/fieldCorrections/correctedByUserId/reason to service.apply
  - cross-org body → ForbiddenException (no service call)
  - error mapping: cross-tenant→NotFoundException, not-correctable→UnprocessableEntityException, empty-field→UnprocessableEntityException
- [x] Add `retroactiveCorrection` to the `@Roles` metadata `it.each` table.

## §4 Local gates

- [ ] CI typecheck + lint + test pass (verified post-merge).

## Deferred

- INT spec for the retro-correction + MCP cap end-to-end (`m3.x-photo-ingest-retroactive-correction-int`).
- Downstream-revocation listener (`m3.x-photo-ingest-downstream-revocation-listener` — the previously named slice that consumes HITL_RETROACTIVE_CORRECTION and flips `requires_review=true` on downstream Lot/GR).
- UI surface (`m3.x-photo-ingest-retroactive-correction-ui`).
