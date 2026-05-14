import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../audit-log/domain/audit-log.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { Ingredient } from '../ingredients/domain/ingredient.entity';
import { Lot } from '../inventory/lot/domain/lot.entity';
import { EmailDispatchModule } from '../shared/email-dispatch/email-dispatch.module';
import { Supplier } from '../suppliers/domain/supplier.entity';
import { IncidentSearchService } from './application/incident-search.service';
import { TraceService } from './application/trace.service';
import { RecallDispatchService } from './dispatch/recall-dispatch.service';
import { DossierService } from './dossier/dossier.service';
import { IncidentCodeGenerator } from './incident/incident-code-generator';
import { IncidentController } from './incident/incident.controller';
import { IncidentService } from './incident/incident.service';
import { RecallSearchController } from './interface/recall-search.controller';
import { TraceController } from './interface/trace.controller';

@Module({
  imports: [
    AuditLogModule,
    EmailDispatchModule,
    TypeOrmModule.forFeature([AuditLog, Supplier, Ingredient, Lot]),
  ],
  providers: [
    IncidentSearchService,
    TraceService,
    IncidentService,
    IncidentCodeGenerator,
    DossierService,
    RecallDispatchService,
  ],
  controllers: [RecallSearchController, TraceController, IncidentController],
  exports: [
    IncidentSearchService,
    TraceService,
    IncidentService,
    DossierService,
    RecallDispatchService,
  ],
})
export class RecallModule {}
