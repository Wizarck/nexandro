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
import { CcpReading } from '../domain/ccp-reading.entity';
import {
  CcpNotInFsmsStandardError,
  OutOfSpecRequiresCorrectiveActionError,
  ReadingShapeError,
} from '../domain/errors';
import { FsmsStandard } from '../domain/fsms-standard.entity';
import {
  CcpDefinition,
  CcpReadingRecordedPayload,
  HACCP_RECORD_AGGREGATE_TYPE,
  RecordReadingInput,
} from '../types';
import { CorrectiveActionService } from './corrective-action.service';
import { FsmsStandardService } from './fsms-standard.service';

/**
 * Record-reading service. Per design.md Decision B + C:
 *  - resolves FSMS standard active at `now()` (or `fsmsStandardId` override),
 *  - looks up the CCP definition by `ccpId`,
 *  - computes `inSpec` per the input type,
 *  - refuses out-of-spec without a corrective action,
 *  - pins FSMS standard id + version at write time,
 *  - emits `CCP_READING_RECORDED` envelope via `emitAsync`.
 *
 * The FSMS-standard name is currently inferred from the operator's CCP picker
 * (slice #10 owns surfacing it); for the backend we accept an optional
 * explicit `fsmsStandardId` to bypass active-window resolution. In normal
 * flow the operator does not supply this; the agent surface (Hermes) does
 * not supply it either; only the FSMS-config-aware Owner debug flow does.
 */
@Injectable()
export class CcpReadingService {
  private readonly logger = new Logger(CcpReadingService.name);

  constructor(
    @InjectRepository(CcpReading)
    private readonly repo: Repository<CcpReading>,
    private readonly fsmsService: FsmsStandardService,
    private readonly correctiveActions: CorrectiveActionService,
    private readonly events: EventEmitter2,
  ) {}

  async recordReading(input: RecordReadingInput): Promise<CcpReading> {
    const hasValue =
      input.readingValue !== null && input.readingValue !== undefined;
    const hasExtras =
      input.readingExtras !== null && input.readingExtras !== undefined;
    if (!hasValue && !hasExtras) {
      throw new ReadingShapeError(
        `recordReading requires either readingValue (numeric/range) or readingExtras (checkbox/multi-select).`,
      );
    }

    const standard = await this.resolveStandard(input);
    const definition = this.findDefinition(standard, input.ccpId);

    const inSpec = this.evaluateInSpec(definition, input);
    let correctiveActionId = input.correctiveActionId ?? null;

    if (!inSpec) {
      if (correctiveActionId === null && input.correctiveActionInput == null) {
        throw new OutOfSpecRequiresCorrectiveActionError(
          this.outOfSpecMessage(input, definition),
        );
      }
      if (correctiveActionId === null && input.correctiveActionInput != null) {
        const created = await this.correctiveActions.recordAdHoc({
          organizationId: input.organizationId,
          fsmsStandardId: standard.id,
          ccpId: input.ccpId,
          name: input.correctiveActionInput.name,
          notes: input.correctiveActionInput.notes,
          actorUserId: input.actorUserId ?? null,
        });
        correctiveActionId = created.id;
      } else if (correctiveActionId !== null) {
        // Validate same-org + existence (throws CorrectiveActionNotFoundError).
        await this.correctiveActions.findById(
          input.organizationId,
          correctiveActionId,
        );
      }
    }

    const row = new CcpReading();
    row.id = randomUUID();
    row.organizationId = input.organizationId;
    row.fsmsStandardId = standard.id;
    row.fsmsStandardVersion = standard.version;
    row.ccpId = input.ccpId;
    row.readingValue = input.readingValue ?? null;
    row.readingUnit = input.readingUnit ?? definition.unit ?? null;
    row.readingExtras = input.readingExtras ?? null;
    row.specMin = definition.specMin ?? null;
    row.specMax = definition.specMax ?? null;
    row.inSpec = inSpec;
    row.correctiveActionId = correctiveActionId;
    row.actorUserId = input.actorUserId ?? null;
    const saved = await this.repo.save(row);

    const payloadAfter: CcpReadingRecordedPayload = {
      ccpId: saved.ccpId,
      fsmsStandardId: saved.fsmsStandardId,
      fsmsStandardVersion: saved.fsmsStandardVersion,
      readingValue: saved.readingValue,
      readingUnit: saved.readingUnit,
      readingExtras: saved.readingExtras,
      specMin: saved.specMin,
      specMax: saved.specMax,
      inSpec: saved.inSpec,
      correctiveActionId: saved.correctiveActionId,
    };
    const envelope: AuditEventEnvelope<null, CcpReadingRecordedPayload> = {
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
      AuditEventType.CCP_READING_RECORDED,
      envelope,
      this.logger,
    );

    return saved;
  }

  private async resolveStandard(
    input: RecordReadingInput,
  ): Promise<FsmsStandard> {
    if (input.fsmsStandardId !== undefined) {
      return this.fsmsService.getStandardById(
        input.organizationId,
        input.fsmsStandardId,
      );
    }
    // Active-window resolution requires the standard's `name`; we infer by
    // scanning all the org's standards whose ccp_definitions contain the
    // requested ccpId, then resolving the active row among them. Per
    // design.md Decision B, the operator typically writes against one
    // canonical FSMS name per organization.
    const all = await this.fsmsService.listVersions(input.organizationId);
    const active = all.find(
      (s) =>
        (s.effectiveUntil === null || s.effectiveUntil > new Date()) &&
        s.effectiveFrom <= new Date() &&
        s.ccpDefinitions.some((d) => d.id === input.ccpId),
    );
    if (active === undefined) {
      throw new CcpNotInFsmsStandardError(input.ccpId, '<active>');
    }
    return active;
  }

  private findDefinition(
    standard: FsmsStandard,
    ccpId: string,
  ): CcpDefinition {
    const def = standard.ccpDefinitions.find((d) => d.id === ccpId);
    if (def === undefined) {
      throw new CcpNotInFsmsStandardError(ccpId, standard.id);
    }
    return def;
  }

  private evaluateInSpec(
    definition: CcpDefinition,
    input: RecordReadingInput,
  ): boolean {
    switch (definition.inputType) {
      case 'numeric': {
        if (input.readingValue === null || input.readingValue === undefined) {
          throw new ReadingShapeError(
            `Numeric CCP ${definition.id} requires readingValue.`,
          );
        }
        const min = definition.specMin;
        const max = definition.specMax;
        if (min !== undefined && input.readingValue < min) return false;
        if (max !== undefined && input.readingValue > max) return false;
        return true;
      }
      case 'range': {
        const extras = input.readingExtras as
          | { start?: number; end?: number }
          | null
          | undefined;
        if (
          extras === null ||
          extras === undefined ||
          typeof extras.start !== 'number' ||
          typeof extras.end !== 'number'
        ) {
          throw new ReadingShapeError(
            `Range CCP ${definition.id} requires readingExtras={start,end}.`,
          );
        }
        const min = definition.specMin;
        const max = definition.specMax;
        if (min !== undefined && extras.start < min) return false;
        if (max !== undefined && extras.end > max) return false;
        return true;
      }
      case 'checkbox': {
        const extras = input.readingExtras as
          | { checked?: boolean }
          | null
          | undefined;
        if (
          extras === null ||
          extras === undefined ||
          typeof extras.checked !== 'boolean'
        ) {
          throw new ReadingShapeError(
            `Checkbox CCP ${definition.id} requires readingExtras={checked: boolean}.`,
          );
        }
        // Spec convention: checkbox CCPs are in-spec when checked=true (e.g.
        // "surface clean? yes"). Inversions (e.g. "contamination present? no")
        // are modelled by inverting the operator's CCP wording.
        return extras.checked === true;
      }
      case 'multi-select': {
        const extras = input.readingExtras as
          | { selected?: readonly string[] }
          | null
          | undefined;
        if (
          extras === null ||
          extras === undefined ||
          !Array.isArray(extras.selected)
        ) {
          throw new ReadingShapeError(
            `Multi-select CCP ${definition.id} requires readingExtras={selected: string[]}.`,
          );
        }
        const expected = definition.expectedOptions ?? [];
        // In-spec when every expected option is present in the selected set.
        return expected.every((opt) => extras.selected!.includes(opt));
      }
      default: {
        // Exhaustive switch — TS narrows the union to never here.
        const _exhaustive: never = definition.inputType;
        throw new ReadingShapeError(
          `Unknown CCP input type: ${String(_exhaustive)}`,
        );
      }
    }
  }

  private outOfSpecMessage(
    input: RecordReadingInput,
    definition: CcpDefinition,
  ): string {
    const min = definition.specMin ?? '-inf';
    const max = definition.specMax ?? '+inf';
    const value =
      input.readingValue !== null && input.readingValue !== undefined
        ? String(input.readingValue)
        : JSON.stringify(input.readingExtras ?? {});
    return (
      `Reading for CCP ${input.ccpId} is out of spec (${value} not in ` +
      `[${String(min)}, ${String(max)}]) and no correctiveActionId was supplied.`
    );
  }
}
