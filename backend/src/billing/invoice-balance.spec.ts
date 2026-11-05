import { Prisma } from '@prisma/client';
import { invoiceBalance } from './invoice-balance';

const today = new Date('2026-09-29T00:00:00.000Z');

describe('invoiceBalance', () => {
  it('calcula saldo parcial con precisión decimal', () => {
    const result = invoiceBalance({
      monto: new Prisma.Decimal('10000.10'), estado: 'Pendiente', fechaLimitePago: new Date('2026-09-30'),
      pagos: [{ monto: new Prisma.Decimal('2000.03') }, { monto: new Prisma.Decimal('3000.02') }],
    }, today);
    expect(result).toMatchObject({ pagado: 5000.05, saldo: 5000.05, estadoCalculado: 'Parcial', diasAtraso: 0 });
  });

  it('usa la prórroga aprobada más tardía para morosidad', () => {
    const result = invoiceBalance({
      monto: 10000, estado: 'Pendiente', fechaLimitePago: new Date('2026-09-01'), pagos: [],
      prorrogasPago: [
        { nuevaFecha: new Date('2026-09-20'), estado: 'APROBADA' },
        { nuevaFecha: new Date('2026-10-10'), estado: 'APROBADA' },
      ],
    }, today);
    expect(result).toMatchObject({ fechaVencimientoEfectiva: '2026-10-10', diasAtraso: 0, estadoCalculado: 'Pendiente' });
  });

  it('una factura anulada no tiene saldo exigible aunque conserve diferencia contable', () => {
    const result = invoiceBalance({ monto: 10000, estado: 'Anulada', fechaLimitePago: new Date('2026-09-01'), pagos: [] }, today);
    expect(result).toMatchObject({ saldo: 10000, saldoExigible: 0, aceptaPagos: false, estadoCalculado: 'Anulada' });
  });
});
