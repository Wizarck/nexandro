import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import {
  DEFAULT_RETENTION_POLICY,
  Organization,
  type OrganizationDpoContact,
  type OrganizationRetentionPolicy,
} from '../../iam/domain/organization.entity';
import { safeAuditEmit } from '../../shared/audit-emit/safe-audit-emit';
import { ZipBuilder, type ZipEntryRef } from './zip-builder';

/**
 * GDPR grace window for Art. 17 right-to-erasure soft-delete. The Owner
 * can cancel within this window via `DELETE /privacy/delete-organization`.
 * After it elapses, a nightly job (out of scope this PR — see
 * Sprint 2 P4 followup) performs the physical delete.
 */
export const DELETION_GRACE_DAYS = 30;
export const DELETION_GRACE_MS = DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Audit-log JSONL bound for the export ZIP. Bounded to the last 90 days
 * so the export file stays in single-digit MB even for active orgs. A
 * full historical dump is provided via the existing
 * `GET /audit-log/export.csv` Owner+Manager surface (NFR-LEGAL-1 already
 * met there) — the privacy export packages the operationally most
 * recent slice plus the rest of the org's owned data.
 */
export const EXPORT_AUDIT_LOG_DAYS = 90;
export const EXPORT_AUDIT_LOG_MS = EXPORT_AUDIT_LOG_DAYS * 24 * 60 * 60 * 1000;

/** Hard cap on rows we'll dump per JSONL file. Past this, the export truncates + flags. */
export const EXPORT_ROWS_HARD_CAP = 50_000;

/**
 * Bounds for `retention_policy` per-field (validated server-side; mirrored
 * in the DTO so 422 surfaces with a structured `code`). The frontend
 * surfaces the same bounds as input `min`/`max` HTML attributes so the
 * Owner cannot type an invalid value into the StickySaveBar form.
 */
export const RETENTION_BOUNDS = {
  audit_log_days: { min: 365, max: 3650 },
  photos_days: { min: 30, max: 730 },
  m3_review_queue_days: { min: 30, max: 3650 },
} as const;

export interface PrivacyExportResult {
  zip: Buffer;
  filename: string;
}

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Generate the Art. 15 + Art. 20 export ZIP for `organizationId`. The
   * archive contains:
   *  - `manifest.json` — versioned envelope describing every shipped file
   *    + its sha256 hash + row counts + generated_at + truncation flags.
   *  - `organization.jsonl` — single row, the org's own record.
   *  - `users.jsonl` — every user attached to the org.
   *  - `audit_log.jsonl` — last 90 days, capped at 50K rows.
   *  - `ingredients.jsonl` — every active ingredient (no archival rows).
   *  - `recipes.jsonl` — every active recipe.
   *  - `photos_manifest.jsonl` — per-photo metadata (s3_key, mime_type,
   *    byte_size, sha256 placeholder, signed_url placeholder) — no
   *    binary photo bytes (would explode the archive size; the Owner
   *    re-derives signed URLs through the normal photo-storage surface).
   *
   * Audit envelope `PRIVACY_EXPORT_REQUESTED` is emitted on the bus
   * AFTER the ZIP is assembled so the audit-log subscriber's failure
   * surface cannot prevent the export from succeeding (per
   * ADR-AUDIT-WRITER + `safeAuditEmit`).
   */
  async exportOrganization(
    organizationId: string,
    actorUserId: string | null,
  ): Promise<PrivacyExportResult> {
    const org = await this.dataSource
      .getRepository(Organization)
      .findOneBy({ id: organizationId });
    if (!org) {
      throw new NotFoundException({ code: 'ORGANIZATION_NOT_FOUND' });
    }

    const zip = new ZipBuilder();
    const entries: ZipEntryRef[] = [];
    const rowCounts: Record<string, { rows: number; truncated: boolean }> = {};
    const generatedAt = new Date();

    const orgRef = zip.addUtf8File(
      'organization.jsonl',
      this.toJsonl([this.scrubOrg(org)]),
    );
    entries.push(orgRef);
    rowCounts['organization.jsonl'] = { rows: 1, truncated: false };

    const usersResult = await this.dumpTable({
      table: 'users',
      orgColumn: 'organization_id',
      organizationId,
    });
    const usersRef = zip.addUtf8File('users.jsonl', usersResult.jsonl);
    entries.push(usersRef);
    rowCounts['users.jsonl'] = {
      rows: usersResult.rows,
      truncated: usersResult.truncated,
    };

    const auditSince = new Date(generatedAt.getTime() - EXPORT_AUDIT_LOG_MS);
    const auditResult = await this.dumpTable({
      table: 'audit_log',
      orgColumn: 'organization_id',
      organizationId,
      where: 'AND created_at >= $2',
      params: [auditSince],
    });
    const auditRef = zip.addUtf8File('audit_log.jsonl', auditResult.jsonl);
    entries.push(auditRef);
    rowCounts['audit_log.jsonl'] = {
      rows: auditResult.rows,
      truncated: auditResult.truncated,
    };

    const ingredientsResult = await this.dumpTable({
      table: 'ingredients',
      orgColumn: 'organization_id',
      organizationId,
    });
    const ingredientsRef = zip.addUtf8File('ingredients.jsonl', ingredientsResult.jsonl);
    entries.push(ingredientsRef);
    rowCounts['ingredients.jsonl'] = {
      rows: ingredientsResult.rows,
      truncated: ingredientsResult.truncated,
    };

    const recipesResult = await this.dumpTable({
      table: 'recipes',
      orgColumn: 'organization_id',
      organizationId,
    });
    const recipesRef = zip.addUtf8File('recipes.jsonl', recipesResult.jsonl);
    entries.push(recipesRef);
    rowCounts['recipes.jsonl'] = {
      rows: recipesResult.rows,
      truncated: recipesResult.truncated,
    };

    const photosResult = await this.dumpTable({
      table: 'photos',
      orgColumn: 'organization_id',
      organizationId,
      // Columns reduced to a manifest — no binary, no signed URL (the
      // signed URL is short-lived and would be invalid by the time the
      // Owner opens the ZIP). The Owner re-fetches via the existing
      // photo-storage signed-url endpoint.
      columns: ['id', 's3_key', 'mime_type', 'byte_size', 'created_at', 'deleted_at'],
    });
    const photosRef = zip.addUtf8File('photos_manifest.jsonl', photosResult.jsonl);
    entries.push(photosRef);
    rowCounts['photos_manifest.jsonl'] = {
      rows: photosResult.rows,
      truncated: photosResult.truncated,
    };

    const manifest = {
      schema_version: 1,
      organization_id: organizationId,
      generated_at: generatedAt.toISOString(),
      generated_by_user_id: actorUserId,
      gdpr_articles: ['15', '20'],
      audit_log_window_days: EXPORT_AUDIT_LOG_DAYS,
      rows_hard_cap: EXPORT_ROWS_HARD_CAP,
      files: entries.map((e) => ({
        name: e.name,
        sha256: e.sha256,
        uncompressed_size: e.uncompressedSize,
        rows: rowCounts[e.name]?.rows ?? 0,
        truncated: rowCounts[e.name]?.truncated ?? false,
      })),
      notes: [
        'audit_log truncated to the most recent 90 days; for a longer window, use GET /audit-log/export.csv (Owner+Manager).',
        'photos_manifest carries metadata only — binary photo bytes are retrieved via the photo-storage signed-url endpoint.',
        'currency is immutable post-creation (ADR-007); other organization fields are mutable.',
      ],
    };
    zip.addUtf8File('manifest.json', JSON.stringify(manifest, null, 2));

    const filename = `nexandro-data-export-${organizationId}-${generatedAt
      .toISOString()
      .slice(0, 10)}.zip`;

    await safeAuditEmit(
      this.events,
      AuditEventType.PRIVACY_EXPORT_REQUESTED,
      this.envelope(organizationId, actorUserId, null, {
        filename,
        files: manifest.files,
        gdpr_articles: ['15', '20'],
        audit_log_window_days: EXPORT_AUDIT_LOG_DAYS,
      }),
      this.logger,
    );

    return { zip: zip.build(), filename };
  }

  /**
   * Art. 17 — schedule deletion 30 days from now. Idempotent: re-calling
   * within the grace window resets the timestamp to NOW + 30d (allows
   * the Owner to "extend the grace" by re-requesting). Returns the
   * scheduled timestamp.
   */
  async scheduleDeletion(
    organizationId: string,
    actorUserId: string | null,
  ): Promise<{ deletionScheduledAt: string }> {
    const repo = this.dataSource.getRepository(Organization);
    const org = await repo.findOneBy({ id: organizationId });
    if (!org) throw new NotFoundException({ code: 'ORGANIZATION_NOT_FOUND' });

    const previous = org.deletionScheduledAt;
    const scheduled = new Date(Date.now() + DELETION_GRACE_MS);
    org.deletionScheduledAt = scheduled;
    org.updatedBy = actorUserId;
    await repo.save(org);

    await safeAuditEmit(
      this.events,
      AuditEventType.PRIVACY_DELETE_SCHEDULED,
      this.envelope(
        organizationId,
        actorUserId,
        { deletionScheduledAt: previous?.toISOString() ?? null },
        {
          deletionScheduledAt: scheduled.toISOString(),
          grace_days: DELETION_GRACE_DAYS,
        },
      ),
      this.logger,
    );

    return { deletionScheduledAt: scheduled.toISOString() };
  }

  /** Cancel a scheduled deletion (no-op when not scheduled; idempotent). */
  async cancelScheduledDeletion(
    organizationId: string,
    actorUserId: string | null,
  ): Promise<{ deletionScheduledAt: null; wasScheduled: boolean }> {
    const repo = this.dataSource.getRepository(Organization);
    const org = await repo.findOneBy({ id: organizationId });
    if (!org) throw new NotFoundException({ code: 'ORGANIZATION_NOT_FOUND' });

    const previous = org.deletionScheduledAt;
    if (!previous) {
      return { deletionScheduledAt: null, wasScheduled: false };
    }
    org.deletionScheduledAt = null;
    org.updatedBy = actorUserId;
    await repo.save(org);

    await safeAuditEmit(
      this.events,
      AuditEventType.PRIVACY_DELETE_CANCELLED,
      this.envelope(
        organizationId,
        actorUserId,
        { deletionScheduledAt: previous.toISOString() },
        { deletionScheduledAt: null },
      ),
      this.logger,
    );

    return { deletionScheduledAt: null, wasScheduled: true };
  }

  /** Update per-org retention policy. Bounds enforced. */
  async updateRetentionPolicy(
    organizationId: string,
    patch: Partial<OrganizationRetentionPolicy>,
    actorUserId: string | null,
  ): Promise<OrganizationRetentionPolicy> {
    this.validateRetentionPatch(patch);

    const repo = this.dataSource.getRepository(Organization);
    const org = await repo.findOneBy({ id: organizationId });
    if (!org) throw new NotFoundException({ code: 'ORGANIZATION_NOT_FOUND' });

    const before: OrganizationRetentionPolicy = {
      ...DEFAULT_RETENTION_POLICY,
      ...(org.retentionPolicy ?? {}),
    };
    const next: OrganizationRetentionPolicy = { ...before, ...patch };
    org.retentionPolicy = next;
    org.updatedBy = actorUserId;
    await repo.save(org);

    await safeAuditEmit(
      this.events,
      AuditEventType.PRIVACY_RETENTION_POLICY_CHANGED,
      this.envelope(organizationId, actorUserId, before, next),
      this.logger,
    );

    return next;
  }

  /** Update DPO contact. Pass `null` to clear. */
  async updateDpoContact(
    organizationId: string,
    contact: OrganizationDpoContact | null,
    actorUserId: string | null,
  ): Promise<OrganizationDpoContact | null> {
    const repo = this.dataSource.getRepository(Organization);
    const org = await repo.findOneBy({ id: organizationId });
    if (!org) throw new NotFoundException({ code: 'ORGANIZATION_NOT_FOUND' });

    const before = org.dpoContact;
    org.dpoContact = contact;
    org.updatedBy = actorUserId;
    await repo.save(org);

    await safeAuditEmit(
      this.events,
      AuditEventType.PRIVACY_DPO_CONTACT_UPDATED,
      this.envelope(organizationId, actorUserId, before, contact),
      this.logger,
    );

    return contact;
  }

  /**
   * Read a single org's GDPR-relevant slice for the frontend. Wraps the
   * existing organization repo so the Privacidad surface doesn't have to
   * import the labels or fiscal fields it doesn't need.
   */
  async getPrivacyState(
    organizationId: string,
  ): Promise<{
    organizationId: string;
    deletionScheduledAt: string | null;
    retentionPolicy: OrganizationRetentionPolicy;
    dpoContact: OrganizationDpoContact | null;
  }> {
    const org = await this.dataSource
      .getRepository(Organization)
      .findOneBy({ id: organizationId });
    if (!org) throw new NotFoundException({ code: 'ORGANIZATION_NOT_FOUND' });
    return {
      organizationId: org.id,
      deletionScheduledAt: org.deletionScheduledAt
        ? org.deletionScheduledAt.toISOString()
        : null,
      retentionPolicy: { ...DEFAULT_RETENTION_POLICY, ...(org.retentionPolicy ?? {}) },
      dpoContact: org.dpoContact,
    };
  }

  // --------- internals ---------

  private envelope(
    organizationId: string,
    actorUserId: string | null,
    payloadBefore: unknown,
    payloadAfter: unknown,
  ): AuditEventEnvelope {
    return {
      organizationId,
      aggregateType: 'organization',
      aggregateId: organizationId,
      actorUserId,
      actorKind: actorUserId ? 'user' : 'system',
      payloadBefore,
      payloadAfter,
    };
  }

  private validateRetentionPatch(patch: Partial<OrganizationRetentionPolicy>): void {
    for (const key of Object.keys(patch) as Array<keyof OrganizationRetentionPolicy>) {
      const value = patch[key];
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value <= 0) {
        throw new RetentionPolicyValidationError(
          `retention_policy.${key} must be a positive integer; got ${String(value)}`,
        );
      }
      const bounds = RETENTION_BOUNDS[key];
      if (!bounds) {
        throw new RetentionPolicyValidationError(`Unknown retention_policy field: ${key}`);
      }
      if (value < bounds.min || value > bounds.max) {
        throw new RetentionPolicyValidationError(
          `retention_policy.${key} out of range [${bounds.min}, ${bounds.max}]; got ${value}`,
        );
      }
    }
  }

  /**
   * Dump all rows from `table` (filtered to the org) as JSONL. Uses
   * `SELECT to_jsonb(t) FROM ...` so the SQL is column-list-agnostic; the
   * caller can optionally narrow via `columns` to strip large fields.
   *
   * Cursored via LIMIT + a hard cap (`EXPORT_ROWS_HARD_CAP`); when the
   * cap trips, the JSONL is truncated and `truncated=true` is recorded
   * in the manifest.
   */
  private async dumpTable(args: {
    table: string;
    orgColumn: string;
    organizationId: string;
    where?: string;
    params?: unknown[];
    columns?: string[];
  }): Promise<{ jsonl: string; rows: number; truncated: boolean }> {
    const columnList = args.columns
      ? args.columns.map((c) => `"${c}"`).join(', ')
      : '*';
    const baseSql = `
      SELECT to_jsonb(t) AS row
      FROM (
        SELECT ${columnList} FROM "${args.table}"
        WHERE "${args.orgColumn}" = $1 ${args.where ?? ''}
        ORDER BY 1
        LIMIT ${EXPORT_ROWS_HARD_CAP + 1}
      ) AS t
    `;
    const params = [args.organizationId, ...(args.params ?? [])];
    let rows: Array<{ row: unknown }>;
    try {
      rows = await this.dataSource.query(baseSql, params);
    } catch (err) {
      // Defensive: a missing table (e.g. fresh DB without all migrations)
      // shouldn't take the whole export down. Surface a synthetic empty
      // payload with a `truncated=false` flag — the manifest will record
      // 0 rows, and the Owner can re-run when the table exists.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `privacy-export.dump-table.skipped table=${args.table} ${message}`,
      );
      return { jsonl: '', rows: 0, truncated: false };
    }
    const truncated = rows.length > EXPORT_ROWS_HARD_CAP;
    const kept = truncated ? rows.slice(0, EXPORT_ROWS_HARD_CAP) : rows;
    const jsonl = this.toJsonl(kept.map((r) => r.row));
    return { jsonl, rows: kept.length, truncated };
  }

  private toJsonl(rows: unknown[]): string {
    if (rows.length === 0) return '';
    return rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  }

  private scrubOrg(org: Organization): Record<string, unknown> {
    return {
      id: org.id,
      name: org.name,
      currency_code: org.currencyCode,
      default_locale: org.defaultLocale,
      timezone: org.timezone,
      label_fields: org.labelFields,
      ai_monthly_budget_eur: org.aiMonthlyBudgetEur,
      retention_policy: org.retentionPolicy,
      dpo_contact: org.dpoContact,
      deletion_scheduled_at: org.deletionScheduledAt
        ? org.deletionScheduledAt.toISOString()
        : null,
      created_at: org.createdAt?.toISOString(),
      updated_at: org.updatedAt?.toISOString(),
      created_by: org.createdBy,
      updated_by: org.updatedBy,
    };
  }
}

export class RetentionPolicyValidationError extends Error {
  readonly code = 'RETENTION_POLICY_OUT_OF_RANGE';
  constructor(message: string) {
    super(message);
    this.name = 'RetentionPolicyValidationError';
  }
}

/** Re-export so the spec can construct one. */
export type PrivacyServiceTestSeam = {
  dataSource: DataSource;
  events: EventEmitter2;
  manager?: EntityManager;
};
