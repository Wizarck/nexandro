## Why

M2's AI-Assisted Authoring differentiator (FR16–19) is what makes recipe entry fast and credible. Without AI suggestions, the chef has to manually research yield% and waste% per ingredient/recipe — a tax on adoption. Without iron-rule citations, the AI suggestions become magic that nobody trusts. This slice ships the suggestion engine + citation contract + chef-override UX, all gated on the slice-#2 Recipes core being in place to attach overrides to.

## What Changes

- AI suggestion of `yieldPercent` for each Ingredient at first use, accompanied by a citation URL + a captured snippet of the source content (≤500 chars) (FR16).
- AI suggestion of recipe-level `wasteFactor` at creation, classified by recipe pattern (stew, sauté, grill, raw, etc.) (FR17).
- Chef override flow: Manager can accept / accept-then-tweak / reject any AI suggestion; override is recorded with attribution and (if rejected) the reason (FR18).
- **Iron rule** (FR19): system never produces an AI suggestion without a citation URL — if the model cannot cite, no suggestion is offered (manual entry only, no fallback).
- Model selection per ADR-013: `gpt-oss-20b-rag` via internal RAG endpoint as the M2 default; pluggable contract for `claude-haiku-hermes` or other models. Single feature flag `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED` controls the surface.
- `YieldEditor` UI component — yield% with AI suggestion + citation popover + chef override (per `docs/ux/components.md`).
- `WasteFactorEditor` UI component — recipe-level waste % with AI suggestion + citation popover + chef override.
- **BREAKING** (none — additive, behind feature flag.)

## Capabilities

### New Capabilities

- `m2-ai-yield-suggestions`: yield + waste suggestion engine with citation contract + chef-override flow.

### Modified Capabilities

(none.)

## Impact

- **Prerequisites**: `#1 m2-data-model`, `#2 m2-recipes-core` (overrides attach to RecipeIngredient lines).
- **Code**: `apps/api/src/ai-suggestions/` (suggestion service + citation guard), `packages/ui-kit/src/yield-editor/`, `waste-factor-editor/`.
- **External dependencies**: internal RAG endpoint (`gpt-oss-20b-rag`), feature-flagged. Failure mode: no suggestion offered (per FR19); UI surfaces "manual entry" path.
- **Audit**: every accept/reject is recorded with `acceptedBy`, `rejectedBy`, `rejectReason`, `citationUrl`.
- **Out of scope**: nutritional inference (that's the OFF path, #5 + #7). Allergen detection (that's #7).
