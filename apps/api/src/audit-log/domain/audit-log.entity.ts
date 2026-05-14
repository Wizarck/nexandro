import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type AuditActorKind = 'user' | 'agent' | 'system';
export const AUDIT_ACTOR_KINDS: AuditActorKind[] = ['user', 'agent', 'system'];

/** Per ADR-AUDIT-SCHEMA: snippet capped at 500 chars (matches ai_suggestions). */
export const AUDIT_SNIPPET_MAX = 500;

/** Reason capped at 2000 chars (matches DB CHECK in migration 0017). */
export const AUDIT_REASON_MAX = 2000;

/** event_type capped at 100 chars (matches DB CHECK). */
export const AUDIT_EVENT_TYPE_MAX = 100;

/** aggregate_type capped at 50 chars (matches DB CHECK). */
export const AUDIT_AGGREGATE_TYPE_MAX = 50;

@Entity({ name: 'audit_log' })
@Index('ix_audit_log_aggregate', [
  'organizationId',
  'aggregateType',
  'aggregateId',
  'createdAt',
])
@Index('ix_audit_log_event_type', ['organizationId', 'eventType', 'createdAt'])
export class AuditLog {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'event_type', type: 'text' })
  eventType!: string;

  @Column({ name: 'aggregate_type', type: 'text' })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId!: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null = null;

  @Column({ name: 'actor_kind', type: 'text' })
  actorKind!: AuditActorKind;

  @Column({ name: 'agent_name', type: 'text', nullable: true })
  agentName: string | null = null;

  @Column({ name: 'payload_before', type: 'jsonb', nullable: true })
  payloadBefore: unknown = null;

  @Column({ name: 'payload_after', type: 'jsonb', nullable: true })
  payloadAfter: unknown = null;

  @Column({ type: 'text', nullable: true })
  reason: string | null = null;

  @Column({ name: 'citation_url', type: 'text', nullable: true })
  citationUrl: string | null = null;

  @Column({ type: 'text', nullable: true })
  snippet: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /**
   * Per ADR-AUDIT-HASH-CHAIN (slice #21 m3-audit-log-hash-chain-hardening,
   * Wave 2.3), every row carries a SHA-256 hash over
   * `(prev_hash || canonicaliseRow(row))`. Validation is per-write with a
   * 100-row lookback per ADR-HASH-CHAIN-VALIDATION-PER-WRITE.
   *
   * `rowHash` is non-null on every row created post-migration 0023.
   * Legacy rows backfilled by migration 0023 receive both columns
   * populated in tenant-scoped chronological order. The TypeScript field
   * is `Buffer | null` to permit construction-time fill prior to commit
   * (the service computes the value before save()).
   */
  @Column({ name: 'row_hash', type: 'bytea', nullable: true })
  rowHash: Buffer | null = null;

  /**
   * Predecessor row's `row_hash` within the same tenant. `null` for the
   * first row per `organization_id`. The chain forms a tenant-scoped
   * linked list ordered by `(created_at, id)`.
   */
  @Column({ name: 'prev_hash', type: 'bytea', nullable: true })
  prevHash: Buffer | null = null;

  /**
   * Per ADR-AUDIT-RETENTION-CLASS (slice #21), retention metadata pinned
   * at write time. Migration 0024 backfills the column with the default
   * `'operational'` plus targeted UPDATEs for `regulatory` + `ephemeral`
   * classifications. Downstream M3.x cold-storage archival queries on
   * this column.
   *
   * Nullable in the entity to permit construction before the service
   * computes the value; the DB column is `NOT NULL DEFAULT 'operational'`.
   */
  @Column({ name: 'retention_class', type: 'text', nullable: true })
  retentionClass: string | null = null;
}
