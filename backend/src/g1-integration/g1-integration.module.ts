import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommercialWarrantiesService } from './commercial-warranties.service';
import { G1ActivationService } from './g1-activation.service';
import { CommercialWarrantiesController, G1IntegrationController } from './g1-integration.controller';
import { G1_INVENTORY_CLIENT } from './g1-integration.types';
import { G1InventoryService } from './g1-inventory.service';
import { HttpG1InventoryClient } from './http-g1-inventory.client';

@Module({
  imports: [AuditModule],
  controllers: [G1IntegrationController, CommercialWarrantiesController],
  providers: [
    HttpG1InventoryClient,
    { provide: G1_INVENTORY_CLIENT, useExisting: HttpG1InventoryClient },
    G1InventoryService,
    G1ActivationService,
    CommercialWarrantiesService,
  ],
  exports: [G1ActivationService, G1InventoryService, G1_INVENTORY_CLIENT],
})
export class G1IntegrationModule {}
