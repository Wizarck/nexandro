import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  IngestionItemKind,
  IngestionItemStatus,
  PhotoIngestionExtraction,
} from '../types';

/**
 * Operational projection of one HITL ingestion item. Stores both the
 * original vision-LLM extraction AND (post-sign) the operator's correction;
 * the regulator-facing record lives on `audit_log` as
 * `PHOTO_INGESTION_*` envelopes with `retention_class='regulatory'`. Both
 * carry the same payload by construction (the audit-log envelope wraps the
 * row state at the transition moment).
 *
 * Per j12 §Decisions:
 *  - BOTH llmExtraction + operatorCorrection are stored — forensic
 *    foundation for prompt tuning + EU AI Act forensic compliance.
 *  - Bands are derived at write time per ADR-034 and pinned via
 *    `status`. The constants live at
 *    `apps/api/src/photo-ingestion/domain/constants.ts`.
 *
 * Multi-tenant: every method gates on `organizationId`. Soft-delete via
 * `deletedAt` (operator hides a rejected row from the queue without
 * breaking the audit chain).
 */
@Entity({ name: 'photo_ingestion_items' })
@Index('idx_photo_ingestion_items_org_status_created', [
  'organizationId',
  'status',
  'createdAt',
])
@Index('idx_photo_ingestion_items_org_photo', ['organizationId', 'photoId'])
export class IngestionItem {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'photo_id', type: 'uuid' })
  photoId!: string;

  @Column({ type: 'text' })
  kind!: IngestionItemKind;

  @Column({ type: 'text' })
  status!: IngestionItemStatus;

  /**
   * Original vision-LLM extraction — never overwritten after insert.
   * Carries the `PhotoIngestionExtraction` shape (fields + overall
   * confidence + model / prompt version). Null only for the rare
   * `pending_extraction` state.
   */
  @Column({ name: 'llm_extraction', type: 'jsonb', nullable: true })
  llmExtraction: PhotoIngestionExtraction | null = null;

  /**
   * Operator's corrected field list — written exactly once at sign time.
   * Carries the same shape as `llmExtraction.fields` plus a derived
   * overall confidence (we store `1.0` since operator-edited fields are
   * trusted by definition; the iron-rule HITL boundary moves to the
   * operator's own sign decision).
   */
  @Column({ name: 'operator_correction', type: 'jsonb', nullable: true })
  operatorCorrection: PhotoIngestionExtraction | null = null;

  /**
   * `overallConfidence` mirrored on the row so the queue projection can
   * filter / sort without unpacking the JSONB. Range `[0, 1]`. Stored as
   * `numeric(4, 3)` at the DB so a value like `0.85` round-trips losslessly.
   */
  @Column({
    name: 'overall_confidence',
    type: 'numeric',
    precision: 4,
    scale: 3,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | number | null) =>
        v === null || v === undefined ? 0 : Number(v),
    },
  })
  overallConfidence!: number;

  @Column({ name: 'model_version', type: 'text' })
  modelVersion!: string;

  @Column({ name: 'prompt_version', type: 'text' })
  promptVersion!: string;

  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true })
  signedAt: Date | null = null;

  @Column({ name: 'signed_by_user_id', type: 'uuid', nullable: true })
  signedByUserId: string | null = null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
