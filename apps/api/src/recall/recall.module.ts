import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../audit-log/domain/audit-log.entity';
import { Ingredient } from '../ingredients/domain/ingredient.entity';
import { Lot } from '../inventory/lot/domain/lot.entity';
import { Supplier } from '../suppliers/domain/supplier.entity';
import { IncidentSearchService } from './application/incident-search.service';
import { TraceService } from './application/trace.service';
import { RecallSearchController } from './interface/recall-search.controller';
import { TraceController } from './interface/trace.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, Supplier, Ingredient, Lot])],
  providers: [IncidentSearchService, TraceService],
  controllers: [RecallSearchController, TraceController],
  exports: [IncidentSearchService, TraceService],
})
export class RecallModule {}
