import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../iam/domain/organization.entity';
import { PrivacyService } from './application/privacy.service';
import { PrivacyController } from './interface/privacy.controller';

/**
 * Sprint 2 P4 — GDPR legal core (Phase D).
 *
 * Hosts the Owner-only `/privacy/*` surface that backs
 * `apps/web/src/screens/settings/OwnerPrivacySection.tsx`:
 *  - Art. 15 + Art. 20 export (single ZIP)
 *  - Art. 17 right-to-erasure (30d grace soft-delete + cancel)
 *  - Editable retention policy windows
 *  - DPO contact upsert
 *  - 2FA + API-token rotation R8 placeholders (honest stubs)
 *
 * No new entity is owned here — the GDPR fields live on the existing
 * `Organization` entity (migration 0043 columns
 * `deletion_scheduled_at` + `retention_policy` + `dpo_contact`). The
 * IamModule owns the canonical entity registration; this module pulls
 * it in via `TypeOrmModule.forFeature` only so the service can use the
 * standard repository token without booting a second registration.
 *
 * Audit envelopes are emitted on the global EventEmitter2 wired in
 * AppModule via `@nestjs/event-emitter`; the AuditLogSubscriber
 * registers the 5 `PRIVACY_*` `@OnEvent` handlers (regulatory
 * retention class — see audit-log/application/types.ts).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Organization])],
  controllers: [PrivacyController],
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
