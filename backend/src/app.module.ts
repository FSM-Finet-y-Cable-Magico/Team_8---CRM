import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CommercialControlModule } from './commercial-control/commercial-control.module';
import { CompaniesModule } from './companies/companies.module';
import { ContractsModule } from './contracts/contracts.module';
import { CustomersModule } from './customers/customers.module';
import { ImportsModule } from './imports/imports.module';
import { InventoryModule } from './inventory/inventory.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ObservationsModule } from './observations/observations.module';
import { PlansModule } from './plans/plans.module';
import { PortalModule } from './portal/portal.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProspectsModule } from './prospects/prospects.module';
import { ReportsModule } from './reports/reports.module';
import { RequestsModule } from './requests/requests.module';
import { RutModule } from './rut/rut.module';
import { SecurityModule } from './security/security.module';
import { ServicesModule } from './services/services.module';
import { TicketsModule } from './tickets/tickets.module';
import { TvipModule } from './tvip/tvip.module';
import { UsersModule } from './users/users.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SecurityModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    BillingModule,
    CommercialControlModule,
    PortalModule,
    TvipModule,
    MonitoringModule,
    UsersModule,
    CompaniesModule,
    ContractsModule,
    RequestsModule,
    ObservationsModule,
    CustomersModule,
    RutModule,
    ProspectsModule,
    PlansModule,
    ServicesModule,
    InventoryModule,
    TicketsModule,
    WorkOrdersModule,
    ReportsModule,
    ImportsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
