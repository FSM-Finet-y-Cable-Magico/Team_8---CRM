import { CommercialStatusService } from './commercial-status.service';

describe('CommercialStatusService', () => {
  const service = new CommercialStatusService();
  const today = new Date('2026-09-25T00:00:00.000Z');

  it.each([
    ['cliente al día', { monto: 10000, totalPagado: 10000, fechaVencimiento: new Date('2026-09-20'), hoy: today }, 'AL_DIA', 0],
    ['saldo pendiente no vencido', { monto: 10000, totalPagado: 2500, fechaVencimiento: new Date('2026-09-30'), hoy: today }, 'SALDO_PENDIENTE', 7500],
    ['factura parcialmente pagada y vencida', { monto: 10000, totalPagado: 4000, fechaVencimiento: new Date('2026-09-20'), hoy: today }, 'DEUDA_VENCIDA', 6000],
    ['saldo a favor', { monto: 10000, totalPagado: 12000, fechaVencimiento: new Date('2026-09-20'), hoy: today }, 'AL_DIA', 0],
    ['prórroga vigente', { monto: 10000, totalPagado: 0, fechaVencimiento: new Date('2026-09-20'), nuevaFechaProrroga: new Date('2026-10-01'), hoy: today }, 'CON_PRORROGA', 10000],
    ['convenio activo', { monto: 10000, totalPagado: 0, fechaVencimiento: new Date('2026-09-20'), convenioActivo: true, hoy: today }, 'CON_CONVENIO', 10000],
    ['último aviso', { monto: 10000, totalPagado: 0, fechaVencimiento: new Date('2026-09-20'), ultimoAviso: true, hoy: today }, 'ULTIMO_AVISO_REGISTRADO', 10000],
    ['retiro pendiente', { monto: 10000, totalPagado: 0, fechaVencimiento: new Date('2026-09-20'), retiroPendiente: true, hoy: today }, 'RETIRO_PENDIENTE', 10000],
  ] as const)('%s', (_name, input, expected, balance) => {
    const result = service.calculate(input);
    expect(result.estadoComercial).toBe(expected);
    expect(result.saldoPendiente).toBe(balance);
  });

  it('calcula días de atraso y acción sugerida con el umbral configurado', () => {
    const result = service.calculate({ monto: 10000, totalPagado: 0, fechaVencimiento: new Date('2026-09-15'), hoy: today, umbralUltimoAvisoDias: 7 });
    expect(result.diasAtraso).toBe(10);
    expect(result.accionSugerida).toContain('último aviso');
  });

  it('mantiene estado informativo cuando faltan datos financieros', () => {
    expect(service.calculate({ monto: null, totalPagado: 0, fechaVencimiento: today, hoy: today })).toMatchObject({ estadoComercial: 'SIN_DATOS_FINANCIEROS', saldoPendiente: null });
  });
});
