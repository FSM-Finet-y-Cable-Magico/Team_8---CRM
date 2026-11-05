import { Injectable } from '@nestjs/common';

export const COMMERCIAL_STATUSES = [
  'SIN_DATOS_FINANCIEROS',
  'AL_DIA',
  'SALDO_PENDIENTE',
  'DEUDA_VENCIDA',
  'CON_PRORROGA',
  'CON_CONVENIO',
  'ULTIMO_AVISO_REGISTRADO',
  'RETIRO_PENDIENTE',
] as const;

export type CommercialStatusInput = {
  monto: number | null;
  totalPagado: number;
  fechaVencimiento: Date;
  nuevaFechaProrroga?: Date | null;
  convenioActivo?: boolean;
  ultimoAviso?: boolean;
  retiroPendiente?: boolean;
  hoy?: Date;
  umbralUltimoAvisoDias?: number;
};

@Injectable()
export class CommercialStatusService {
  calculate(input: CommercialStatusInput) {
    const hoy = this.dateOnly(input.hoy ?? new Date());
    const fechaOriginal = this.dateOnly(input.fechaVencimiento);
    const fechaEfectiva = input.nuevaFechaProrroga && input.nuevaFechaProrroga > input.fechaVencimiento
      ? this.dateOnly(input.nuevaFechaProrroga)
      : fechaOriginal;

    if (input.monto === null || !Number.isFinite(input.monto)) {
      return {
        montoDocumento: null,
        totalPagado: this.money(input.totalPagado),
        saldoPendiente: null,
        saldoFavor: null,
        fechaVencimientoEfectiva: fechaEfectiva,
        diasAtraso: null,
        estadoComercial: 'SIN_DATOS_FINANCIEROS' as const,
        accionSugerida: 'Completar datos financieros de la factura',
      };
    }

    const monto = this.money(input.monto);
    const totalPagado = this.money(input.totalPagado);
    const saldoPendiente = this.money(Math.max(0, monto - totalPagado));
    const saldoFavor = this.money(Math.max(0, totalPagado - monto));
    const diasAtraso = saldoPendiente > 0 && fechaEfectiva < hoy
      ? Math.floor((hoy.getTime() - fechaEfectiva.getTime()) / 86_400_000)
      : 0;
    const threshold = Number.isInteger(input.umbralUltimoAvisoDias) && Number(input.umbralUltimoAvisoDias) > 0
      ? Number(input.umbralUltimoAvisoDias)
      : 5;

    if (saldoPendiente <= 0) {
      return { montoDocumento: monto, totalPagado, saldoPendiente, saldoFavor, fechaVencimientoEfectiva: fechaEfectiva, diasAtraso, estadoComercial: 'AL_DIA' as const, accionSugerida: 'Sin gestión pendiente' };
    }
    if (input.retiroPendiente) {
      return { montoDocumento: monto, totalPagado, saldoPendiente, saldoFavor, fechaVencimientoEfectiva: fechaEfectiva, diasAtraso, estadoComercial: 'RETIRO_PENDIENTE' as const, accionSugerida: 'Dar seguimiento al aviso de retiro' };
    }
    if (input.ultimoAviso) {
      return { montoDocumento: monto, totalPagado, saldoPendiente, saldoFavor, fechaVencimientoEfectiva: fechaEfectiva, diasAtraso, estadoComercial: 'ULTIMO_AVISO_REGISTRADO' as const, accionSugerida: 'Revisar respuesta y decisión comercial' };
    }
    if (input.convenioActivo) {
      return { montoDocumento: monto, totalPagado, saldoPendiente, saldoFavor, fechaVencimientoEfectiva: fechaEfectiva, diasAtraso, estadoComercial: 'CON_CONVENIO' as const, accionSugerida: 'Dar seguimiento al convenio' };
    }
    if (input.nuevaFechaProrroga && fechaEfectiva >= hoy) {
      return { montoDocumento: monto, totalPagado, saldoPendiente, saldoFavor, fechaVencimientoEfectiva: fechaEfectiva, diasAtraso, estadoComercial: 'CON_PRORROGA' as const, accionSugerida: 'Revisar al vencimiento comprometido' };
    }
    if (diasAtraso > 0) {
      return {
        montoDocumento: monto,
        totalPagado,
        saldoPendiente,
        saldoFavor,
        fechaVencimientoEfectiva: fechaEfectiva,
        diasAtraso,
        estadoComercial: 'DEUDA_VENCIDA' as const,
        accionSugerida: diasAtraso >= threshold ? 'Registrar último aviso previo al corte' : 'Registrar gestión de cobranza',
      };
    }
    return { montoDocumento: monto, totalPagado, saldoPendiente, saldoFavor, fechaVencimientoEfectiva: fechaEfectiva, diasAtraso, estadoComercial: 'SALDO_PENDIENTE' as const, accionSugerida: 'Controlar próximo vencimiento' };
  }

  private dateOnly(value: Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
