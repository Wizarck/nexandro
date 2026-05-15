import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import { safeAuditEmit } from '../../shared/audit-emit/safe-audit-emit';
import { CorrectiveAction } from '../domain/corrective-action.entity';
import { CorrectiveActionNotFoundError } from '../domain/errors';
import {
  CorrectiveActionRecordedPayload,
  HACCP_RECORD_AGGREGATE_TYPE,
  RecordCorrectiveActionInput,
} from '../types';

/**
 * Corrective-action lifecycle. Two creation modes per design.md Decision D:
 *  - **Predefined**: created by the Owner via `POST /m3/haccp/corrective-actions`;
 *    referenced many times by readings.
 *  - **Ad-hoc**: created at reading-record time by `CcpReadingService.recordReading()`
 *    when the operator supplies `correctiveActionInput`. Persisted with
 *    `creation_mode='ad-hoc'`; the reading row references the new id.
 *
 * Both paths emit `CCP_CORRECTIVE_ACTION_RECORDED` with the appropriate
 * `creation_mode` flag in `payload_after`.
 */
@Injectable()
export class CorrectiveActionService {
  private readonly logger = new Logger(CorrectiveActionService.name);

  constructor(
    @InjectRepository(CorrectiveAction)
    private readonly repo: Repository<CorrectiveAction>,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Predefined creation path — called by the Owner controller.
   */
  async recordPredefined(
    input: RecordCorrectiveActionInput,
  ): Promise<CorrectiveAction> {
    return this.persist({ ...input, mode: 'predefined' });
  }

  /**
   * Ad-hoc creation path — called inline by `CcpReadingService.recordReading()`.
   */
  async recordAdHoc(
    input: RecordCorrectiveActionInput,
  ): Promise<CorrectiveAction> {
    return this.persist({ ...input, mode: 'ad-hoc' });
  }

  /**
   * Resolve a predefined corrective action by id, asserting same-org. Used
   * by `CcpReadingService.recordReading()` when the operator picks one from
   * the j10 picker.
   */
  async findById(
    organizationId: string,
    id: string,
  ): Promise<CorrectiveAction> {
    const row = await this.repo.findOne({ where: { id, organizationId } });
    if (row === null) {
      throw new CorrectiveActionNotFoundError(id);
    }
    return row;
  }

  /**
   * Picker query — predefined first then the 10 most-recent ad-hoc actions
   * for the CCP. Hard-coded cap matches design.md "predefined first + only
   * the 10 most-recent ad-hoc".
   */
  async listForCcp(
    organizationId: string,
    fsmsStandardId: string,
    ccpId: string,
  ): Promise<CorrectiveAction[]> {
    const predefined = await this.repo.find({
      where: { organizationId, fsmsStandardId, ccpId, creationMode: 'predefined' },
      order: { createdAt: 'DESC' },
    });
    const adHoc = await this.repo.find({
      where: { organizationId, fsmsStandardId, ccpId, creationMode: 'ad-hoc' },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    return [...predefined, ...adHoc];
  }

  private async persist(
    input: RecordCorrectiveActionInput & { mode: 'predefined' | 'ad-hoc' },
  ): Promise<CorrectiveAction> {
    const row = new CorrectiveAction();
    row.id = randomUUID();
    row.organizationId = input.organizationId;
    row.fsmsStandardId = input.fsmsStandardId;
    row.ccpId = input.ccpId;
    row.name = input.name;
    row.notes = input.notes ?? null;
    row.creationMode = input.mode;
    const saved = await this.repo.save(row);

    const payloadAfter: CorrectiveActionRecordedPayload = {
      fsmsStandardId: saved.fsmsStandardId,
      ccpId: saved.ccpId,
      name: saved.name,
      notes: saved.notes,
      creationMode: saved.creationMode,
    };
    const envelope: AuditEventEnvelope<null, CorrectiveActionRecordedPayload> = {
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
      AuditEventType.CCP_CORRECTIVE_ACTION_RECORDED,
      envelope,
      this.logger,
    );

    return saved;
  }
}
