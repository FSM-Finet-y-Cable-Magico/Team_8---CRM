import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ContractsService } from './contracts.service';

@Injectable()
export class PlanChangeProcessor implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
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
    try { await this.contracts.applyDuePlanChanges(); }
    catch (error) { this.logger.error('No se pudieron procesar cambios de plan pendientes', error); }
    finally { this.running = false; }
  }
}
