import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import { safeAuditEmit } from '../../shared/audit-emit/safe-audit-emit';
import { FsmsStandard } from '../domain/fsms-standard.entity';
import {
  FsmsStandardConflictError,
  FsmsStandardNotFoundError,
} from '../domain/errors';
import {
  ConfigureFsmsStandardInput,
  FsmsStandardConfiguredPayload,
  HACCP_RECORD_AGGREGATE_TYPE,
} from '../types';

/**
 * Owner-facing service for FSMS standards: configure new versions, terminate
 * prior windows, query the active standard, list versions.
 *
 * Per design.md Decision B + Decision E, the `effective_from / effective_until`
 * pair defines the active window; `getActiveStandard(orgId, name, at)`
 * resolves the row whose window covers `at` (default `now()`). The slice
 * does NOT support time-travel writes: `effectiveFrom` must be >= now() for
 * a new row.
 */
@Injectable()
export class FsmsStandardService {
  private readonly logger = new Logger(FsmsStandardService.name);

  constructor(
    @InjectRepository(FsmsStandard)
    private readonly repo: Repository<FsmsStandard>,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Create a new FSMS standard row. When `terminatesPrior=true`, the most-recent
   * active row with the same `(organizationId, name)` has its `effective_until`
   * set to the new row's `effective_from` (atomically — both writes happen in
   * the same transaction via TypeORM `manager.transaction`).
   */
  async configureFsmsStandards(
    input: ConfigureFsmsStandardInput,
  ): Promise<FsmsStandard> {
    const id = randomUUID();
    const terminatesPrior = input.terminatesPrior === true;

    return this.repo.manager.transaction(async (mgr) => {
      const repoTx = mgr.getRepository(FsmsStandard);

      if (terminatesPrior) {
        const prior = await repoTx.findOne({
          where: {
            organizationId: input.organizationId,
            name: input.name,
            effectiveUntil: IsNull(),
          },
          order: { effectiveFrom: 'DESC' },
        });
        if (prior !== null) {
          if (prior.version === input.version) {
            throw new FsmsStandardConflictError(
              `FSMS standard ${input.name} version ${input.version} is already active for organization ${input.organizationId}.`,
            );
          }
          prior.effectiveUntil = input.effectiveFrom;
          await repoTx.save(prior);
        }
      }

      const row = new FsmsStandard();
      row.id = id;
      row.organizationId = input.organizationId;
      row.name = input.name;
      row.version = input.version;
      row.effectiveFrom = input.effectiveFrom;
      row.effectiveUntil = input.effectiveUntil ?? null;
      row.ccpDefinitions = [...input.ccpDefinitions];
      const saved = await repoTx.save(row);

      const payloadAfter: FsmsStandardConfiguredPayload = {
        name: saved.name,
        version: saved.version,
        effectiveFrom: saved.effectiveFrom.toISOString(),
        effectiveUntil: saved.effectiveUntil?.toISOString() ?? null,
        ccpDefinitionsCount: saved.ccpDefinitions.length,
        terminatesPrior,
      };
      const envelope: AuditEventEnvelope<null, FsmsStandardConfiguredPayload> = {
        organizationId: saved.organizationId,
        aggregateType: HACCP_RECORD_AGGREGATE_TYPE,
        aggregateId: saved.id,
        actorUserId: input.actorUserId ?? null,
        actorKind: 'user',
        payloadBefore: null,
        payloadAfter,
      };
      await safeAuditEmit(
        this.events,
        AuditEventType.FSMS_STANDARD_CONFIGURED,
        envelope,
        this.logger,
      );

      return saved;
    });
  }

  /**
   * Resolve the FSMS standard active for `(organizationId, name)` at the
   * supplied instant (defaults to `now()`). Throws `FsmsStandardNotFoundError`
   * when no row matches; never returns null.
   */
  async getActiveStandard(
    organizationId: string,
    name: string,
    at: Date = new Date(),
  ): Promise<FsmsStandard> {
    // Hand-rolled WHERE to express
    //   effective_from <= :at AND (effective_until IS NULL OR effective_until > :at)
    // without depending on a TypeORM version-specific `Or()` helper.
    const row = await this.repo
      .createQueryBuilder('fsms')
      .where('fsms.organization_id = :organizationId', { organizationId })
      .andWhere('fsms.name = :name', { name })
      .andWhere('fsms.effective_from <= :at', { at })
      .andWhere(
        '(fsms.effective_until IS NULL OR fsms.effective_until > :at)',
        { at },
      )
      .orderBy('fsms.effective_from', 'DESC')
      .limit(1)
      .getOne();
    if (row === null) {
      throw new FsmsStandardNotFoundError(
        `No active FSMS standard ${name} for organization ${organizationId} at ${at.toISOString()}.`,
      );
    }
    return row;
  }

  async getStandardById(
    organizationId: string,
    id: string,
  ): Promise<FsmsStandard> {
    const row = await this.repo.findOne({
      where: { id, organizationId },
    });
    if (row === null) {
      throw new FsmsStandardNotFoundError(
        `FSMS standard ${id} not found for organization ${organizationId}.`,
      );
    }
    return row;
  }

  async listVersions(
    organizationId: string,
    name?: string,
  ): Promise<FsmsStandard[]> {
    const where = name === undefined ? { organizationId } : { organizationId, name };
    return this.repo.find({
      where,
      order: { name: 'ASC', effectiveFrom: 'DESC' },
    });
  }
}
