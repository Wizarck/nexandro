## ADDED Requirements

### Requirement: AI yield suggestion requires a citation URL or no suggestion is offered

The system SHALL NOT return an AI-generated `yieldPercent` suggestion without a non-empty citation URL. If the model cannot cite, the response SHALL be `{suggestion: null, reason: "NO_CITATION_AVAILABLE"}` and the UI SHALL fall back to manual entry.

#### Scenario: Model returns suggestion with citation
- **WHEN** the AI provider returns a yield suggestion with a populated `citationUrl` and `citationSnippet` (≤500 chars)
- **THEN** the system persists the suggestion and returns it to the client

#### Scenario: Model returns suggestion without citation
- **WHEN** the AI provider returns a yield suggestion with empty or null `citationUrl`
- **THEN** the system returns `{suggestion: null, reason: "NO_CITATION_AVAILABLE"}` and the UI surfaces "manual entry"

#### Scenario: Citation snippet exceeds 500 chars
- **WHEN** the model returns a snippet longer than 500 chars
- **THEN** the system truncates to 500 chars (with ellipsis marker) and persists; suggestion still valid

### Requirement: AI waste factor suggestion classifies by recipe pattern

The system SHALL classify each Recipe's `wasteFactor` suggestion by recipe pattern (stew, sauté, grill, raw, baked, fried, mixed, other) and return both the value and the classification.

#### Scenario: Stew recipe gets stew-pattern waste suggestion
- **WHEN** a Recipe contains long-cooked ingredients (e.g. stew or braise)
- **THEN** the AI provider returns `{wasteFactor, pattern: "stew", citationUrl, citationSnippet}` and the suggestion is persisted

#### Scenario: Pattern is uncategorisable
- **WHEN** the model cannot classify the recipe pattern with confidence
- **THEN** `pattern` returns "other" but the suggestion is still valid (provided the citation rule passes)

### Requirement: Chef accept / accept-then-tweak / reject flow with audit

The system SHALL record every chef interaction with an AI suggestion: accept, accept-with-tweak (different value), or reject. Audit fields include `userId`, `suggestionId`, `action`, `valueBefore`, `valueAfter`, `reason` (rejection only), `citationUrl`, `snippet`, `modelName`, `modelVersion`.

#### Scenario: Manager accepts suggestion as-is
- **WHEN** a Manager accepts a yield suggestion of 90% via `POST /ai-suggestions/:id/accept`
- **THEN** the RecipeIngredient line's `yieldPercentOverride` is set to 90%; an `audit_log` row is written with `action="accept"`, `valueAfter=90`, citation fields preserved

#### Scenario: Manager accepts with tweak
- **WHEN** a Manager accepts but tweaks to 85% via `POST /ai-suggestions/:id/accept` with body `{value: 85}`
- **THEN** the line's override is set to 85; audit row records `action="accept_tweak"`, `valueBefore=90`, `valueAfter=85`

#### Scenario: Manager rejects with reason
- **WHEN** a Manager rejects via `POST /ai-suggestions/:id/reject` with `{reason: "Citation source contradicts our supplier data"}`
- **THEN** no override is applied; audit row records `action="reject"`, `reason` text preserved

#### Scenario: Reject without reason is rejected
- **WHEN** a Manager attempts to reject without a `reason`
- **THEN** the system returns 422 with `{code: "REASON_REQUIRED"}`

### Requirement: Feature flag controls the entire AI suggestion surface

The system SHALL gate all AI suggestion endpoints and UI surfaces behind the `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED` feature flag.

#### Scenario: Flag enabled — suggestions available
- **WHEN** the flag is `true`
- **THEN** `POST /ai-suggestions/yield` and `/waste` are reachable and the UI renders citation popovers + override flow

#### Scenario: Flag disabled — suggestions hidden
- **WHEN** the flag is `false`
- **THEN** the suggestion endpoints return 404 and the UI shows manual-entry inputs only with no AI affordances

### Requirement: Suggestion cache reuses prior calls per org

The system SHALL cache AI suggestions keyed on `{orgId, ingredientId, contextHash}` for 30 days; cache hits return without calling the provider unless the chef previously rejected the suggestion.

#### Scenario: Repeated request hits cache
- **WHEN** the same Manager queries yield for the same ingredient within 30 days
- **THEN** the cached suggestion is returned without calling the provider

#### Scenario: Prior rejection bypasses cache
- **WHEN** the chef previously rejected a cached suggestion for this `{ingredientId, contextHash}`
- **THEN** the cache is invalidated for this combination and a fresh provider call is made
