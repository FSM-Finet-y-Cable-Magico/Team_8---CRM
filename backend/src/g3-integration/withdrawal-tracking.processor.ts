import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WithdrawalWorkflowService } from './withdrawal-workflow.service';

export const DEFAULT_TRACKING_INTERVAL_MS = 5 * 60_000;
const MIN_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 60 * 60_000;
/** Requests followed per cycle: the oldest updated first, so every active request is reached over time. */
export const TRACKING_BATCH = 50;
/** Consecutive failures of one request before its follow-up is suspended (bounded retries). */
export const MAX_CONSECUTIVE_FAILURES = 6;
/** Back-off in cycles after a failure: 1, 2, 4, 8, 12, 12... */
const MAX_BACKOFF_CYCLES = 12;

/**
 * Automatic follow-up of active withdrawal requests (criterio FINET 13-11-2026), every 5 minutes by default.
 * - Disabled unless WITHDRAWAL_TRACKING_ENABLED=true; WITHDRAWAL_TRACKING_INTERVAL_MS tunes the period (1 to 60 minutes).
 * - Only reads towards G3 (OT state) and G1 (reception), through the same idempotent operations used on demand; it
 *   never dispatches, cancels or applies the effective withdrawal (that stays behind WITHDRAWAL_FINALIZE_ENABLED).
 * - Terminal requests (applied, cancelled, closed or with the OT cancelled) are not even listed: their follow-up stops.
 * - Bounded retries: a failing request is retried with growing back-off and suspended after MAX_CONSECUTIVE_FAILURES
 *   until the process restarts or the request changes state; one cycle never overlaps the next.
 * Logs carry only request IDs and error codes (no customer data).
 */
@Injectable()
export class WithdrawalTrackingProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WithdrawalTrackingProcessor.name);
  private readonly enabled: boolean;
  readonly intervalMs: number;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private stopped = false;
  private cycle = 0;
  private storageWarningCycle = -Infinity;
  private readonly failures = new Map<number, { count: number; retryAtCycle: number; suspended: boolean }>();

  constructor(private readonly workflow: WithdrawalWorkflowService, config: ConfigService) {
    this.enabled = (config.get<string>('WITHDRAWAL_TRACKING_ENABLED') ?? '').trim().toLowerCase() === 'true';
    const configured = Number(config.get<string>('WITHDRAWAL_TRACKING_INTERVAL_MS') ?? DEFAULT_TRACKING_INTERVAL_MS);
    this.intervalMs = Number.isFinite(configured) ? Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.trunc(configured))) : DEFAULT_TRACKING_INTERVAL_MS;
  }

  onModuleInit() {
    if (!this.enabled || this.stopped || this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One follow-up cycle. Public for tests and for an operator-triggered run; never overlaps itself. */
  async tick() {
    if (!this.enabled || this.stopped || this.running) return { skipped: true as const };
    this.running = true;
    const cycle = ++this.cycle;
    const summary = { skipped: false as const, consultadas: 0, fallidas: 0, enEspera: 0, suspendidas: 0 };
    try {
      let ids: number[] | null;
      try {
        ids = await this.workflow.trackableRequests(TRACKING_BATCH);
      } catch {
        this.logger.error('Seguimiento de retiros: no se pudo listar las solicitudes activas.');
        return summary;
      }
      if (ids === null) {
        // Private storage (migration 002) not applied: nothing to follow; warn at most once an hour.
        if (cycle - this.storageWarningCycle >= Math.ceil(MAX_INTERVAL_MS / this.intervalMs)) {
          this.logger.warn('Seguimiento de retiros: el almacenamiento g8_retiros no está aplicado; no hay solicitudes que seguir.');
          this.storageWarningCycle = cycle;
        }
        return summary;
      }
      const active = new Set(ids);
      // A request that left the active set (terminal or changed) frees its retry record.
      for (const id of [...this.failures.keys()]) if (!active.has(id)) this.failures.delete(id);
      for (const id of ids) {
        if (this.stopped) break;
        const failure = this.failures.get(id);
        if (failure?.suspended) { summary.suspendidas++; continue; }
        if (failure && cycle < failure.retryAtCycle) { summary.enEspera++; continue; }
        try {
          await this.workflow.track(id);
          this.failures.delete(id);
          summary.consultadas++;
        } catch (error) {
          summary.fallidas++;
          this.recordFailure(id, cycle, error);
        }
      }
      return summary;
    } finally {
      this.running = false;
    }
  }

  private recordFailure(id: number, cycle: number, error: unknown) {
    const count = (this.failures.get(id)?.count ?? 0) + 1;
    const suspended = count >= MAX_CONSECUTIVE_FAILURES;
    const backoff = Math.min(MAX_BACKOFF_CYCLES, 2 ** (count - 1));
    this.failures.set(id, { count, retryAtCycle: cycle + backoff, suspended });
    const code = errorCode(error);
    if (suspended) {
      this.logger.warn(`Seguimiento de retiros: solicitud ${id} suspendida tras ${count} fallas consecutivas (${code}); requiere revisión.`);
    } else {
      this.logger.warn(`Seguimiento de retiros: solicitud ${id} falló (${code}); reintento en ${backoff} ciclo(s).`);
    }
  }
}

function errorCode(error: unknown) {
  const response = error && typeof error === 'object' && 'getResponse' in error && typeof (error as { getResponse: unknown }).getResponse === 'function'
    ? (error as { getResponse: () => unknown }).getResponse() : null;
  if (response && typeof response === 'object' && 'code' in response) return String((response as { code: unknown }).code);
  return error instanceof Error && error.name ? error.name : 'ERROR';
}
