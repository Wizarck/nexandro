import { Injectable } from '@nestjs/common';
import { AuditLogService } from '../../audit-log/application/audit-log.service';
import { RECALL_INCIDENT_AGGREGATE_TYPE, RECALL_INCIDENT_CODE_PREFIX } from '../domain/constants';

/**
 * Generates `IR-YYYY-NNNN` codes for new incidents. NNNN is the count of
 * `RECALL_INVESTIGATION_OPENED` envelopes for the organization year-to-
 * date plus one.
 *
 * Backed by `AuditLogService.query()` so the counter is fully derived from
 * the canonical chain (no separate counter table per ADR-RECALL-INCIDENT-
 * VIA-AUDIT-LOG).
 *
 * Concurrency note: two simultaneous opens against the same org+year MAY
 * race to the same NNNN. Mitigation = the controller is gated behind the
 * standard `IdempotencyMiddleware` so a retry of the same logical open
 * returns the same code. True parallel opens (two different operators at
 * the same second) are exceedingly rare; if they happen the regulator
 * sees both incidents with the same code suffix but different UUIDs and
 * timestamps — the chain remains forensically intact.
 */
@Injectable()
export class IncidentCodeGenerator {
  constructor(private readonly auditLog: AuditLogService) {}

  async nextCode(organizationId: string, now: Date = new Date()): Promise<string> {
    const year = now.getUTCFullYear();
    const since = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const until = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
    // `AuditLogService.query()` defaults limit to 50 with a hard max of
    // 200; we ask for the upper bound and fall back to `total` for the
    // counter. The counter only needs `total`, NOT the rows.
    const page = await this.auditLog.query({
      organizationId,
      aggregateType: RECALL_INCIDENT_AGGREGATE_TYPE,
      eventTypes: ['RECALL_INVESTIGATION_OPENED'],
      since,
      until,
      limit: 1,
      offset: 0,
    });
    const next = page.total + 1;
    return `${RECALL_INCIDENT_CODE_PREFIX}-${year}-${String(next).padStart(4, '0')}`;
  }
}
