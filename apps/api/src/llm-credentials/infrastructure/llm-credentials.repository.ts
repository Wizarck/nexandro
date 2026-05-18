import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrgLlmCredential } from '../domain/org-llm-credential.entity';

/**
 * Sprint 4 W2-1a — m4-byo-llm-provider-key. Thin TypeORM repo wrapper for
 * the per-org `org_llm_credentials` table. The schema's UNIQUE constraint
 * on `organization_id` keeps the "one row per org" invariant; the service
 * layer relies on `findByOrganizationId` + `save` (upsert-style) rather
 * than INSERT…ON CONFLICT so the audit-log interceptor still sees the
 * before/after state.
 */
@Injectable()
export class LlmCredentialsRepository extends Repository<OrgLlmCredential> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(OrgLlmCredential, dataSource.createEntityManager());
  }

  async findByOrganizationId(organizationId: string): Promise<OrgLlmCredential | null> {
    return this.findOne({ where: { organizationId } });
  }

  async deleteByOrganizationId(organizationId: string): Promise<void> {
    await this.delete({ organizationId });
  }
}
