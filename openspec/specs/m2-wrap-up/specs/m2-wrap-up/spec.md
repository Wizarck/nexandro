## ADDED Requirements

### Requirement: M2 production feature flags documented as enabled by default after gate clearance

The system SHALL document `NEXANDRO_LABELS_PROD_ENABLED=true` and `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=true` in `apps/api/.env.example` as the production-cleared defaults, while preserving the runtime fallback default of `false` (safety default for unconfigured deployments).

#### Scenario: Operator copies .env.example for production deploy
- **WHEN** an operator copies `apps/api/.env.example` to `.env` in production for the first time
- **THEN** both flags are pre-set to `true` with comments referencing the gate-clearance ADR notes (ADR-018 + ADR-019)

#### Scenario: Fresh dev deployment without copying .env
- **WHEN** an unconfigured deployment reads `process.env.NEXANDRO_LABELS_PROD_ENABLED` and the env var is unset
- **THEN** the runtime fallback returns `false`; labels production endpoints stay gated as a safety default

### Requirement: ADRs document gate clearance with date and rationale

The system SHALL annotate ADR-018 and ADR-019 with a "Gate clearance" footnote dated 2026-05-06 explaining the gate-clearance rationale (rag-proxy deploy + corpus ingestion for AI; external legal review for labels) without superseding the original ADR text.

#### Scenario: Future reader audits ADR-019
- **WHEN** a future maintainer reads ADR-019 looking for the labels production-readiness state
- **THEN** the inline "Gate clearance 2026-05-06" note shows the gate cleared, with a reference to the legal review filing and the m2-wrap-up slice

### Requirement: Operations runbook documents deploy and rollback for both M2 production surfaces

The system SHALL provide `docs/operations/m2-prod-runbook.md` describing pre-flight checklist, deploy procedure, smoke tests, and rollback procedure for both M2 production surfaces (labels + AI suggestions).

#### Scenario: Operator deploys M2 to a new venue
- **WHEN** an operator follows the runbook to deploy nexandro for a new restaurant
- **THEN** the runbook walks them through: legal review confirmation → rag-proxy + LightRAG deploy → corpus ingestion → apps/api .env update → smoke tests → rollback steps if anything fails

#### Scenario: Operator deploys to a non-EU jurisdiction
- **WHEN** an operator considers enabling the labels flag outside Spain/EU
- **THEN** the runbook explicitly reminds them that the legal review covers Spain/EU only; per-jurisdiction review is required before flipping the labels flag in any other deployment
