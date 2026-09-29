import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ContractsService } from './contracts.service';

@Injectable()
export class PlanChangeProcessor implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private lastSchemaWarning = 0;
  private readonly logger = new Logger(PlanChangeProcessor.name);
  constructor(private readonly contracts: ContractsService) {}

  onModuleInit() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private async tick() {
    if (this.running) return;
    this.running = true;
    try { await this.contracts.applyDuePlanChanges(); this.lastSchemaWarning = 0; }
    catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === 'P2021') {
        if (!this.lastSchemaWarning || Date.now() - this.lastSchemaWarning >= 300_000) {
          this.logger.error('PENDIENTE_RECONCILIACION_GLOBAL: falta una tabla requerida por cambios de plan (P2021).');
          this.lastSchemaWarning = Date.now();
        }
      } else this.logger.error('No se pudieron procesar cambios de plan pendientes; revisar dependencias y auditoria.');
    }
    finally { this.running = false; }
  }
}
