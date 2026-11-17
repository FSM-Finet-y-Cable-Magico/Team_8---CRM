import { calculatePaymentDay, PaymentDayAdjustment } from './payment-day-adjustment';
import { PrismaService } from '../prisma/prisma.service';

describe('Reajuste de día de pago', () => {
  it('usa mensualidad / 30 y redondea una sola vez a pesos', () => {
    expect(calculatePaymentDay(19990, 1, 15, '2026-11-01')).toMatchObject({ fechaDesde:'2026-11-01', proximoVencimiento:'2026-11-15', diasReajuste:14, montoReajuste:9329 });
  });
  it('al adelantar el número de día elige el próximo ciclo, sin alterar períodos ya emitidos', () => {
    expect(calculatePaymentDay(30000, 20, 5, '2026-11-12')).toMatchObject({fechaDesde:'2026-11-20',proximoVencimiento:'2026-12-05',diasReajuste:15,montoReajuste:15000});
  });
  it('maneja el cambio de año y febrero bisiesto',()=>{
    expect(calculatePaymentDay(30000,20,5,'2026-12-21').fechaDesde).toBe('2027-01-20');
    expect(calculatePaymentDay(30000,31,28,'2028-02-01')).toMatchObject({fechaDesde:'2028-02-29',proximoVencimiento:'2028-03-28',diasReajuste:28});
  });
  it('rechaza días inválidos, el mismo día y una mensualidad desconocida',()=>{
    expect(()=>calculatePaymentDay(30000,1,29)).toThrow('entre 1 y 28');
    expect(()=>calculatePaymentDay(30000,1,1)).toThrow('ya tiene');
    expect(()=>calculatePaymentDay(NaN,1,15)).toThrow('mensualidad');
  });
  function harness() {
    const tx={ $queryRaw:jest.fn().mockResolvedValue([]), contrato:{findUnique:jest.fn().mockResolvedValue({idContrato:20,idEmpresa:1,idCliente:10,diaVencimiento:1,estado:'Activo',plan:{idPlan:5,idEmpresa:1,precioMensual:30000}}),update:jest.fn()},
      cambioCondicionPago:{findFirst:jest.fn().mockResolvedValue(null),create:jest.fn().mockImplementation(({data})=>({...data,idCambio:3}))},
      cargoAdicional:{findUnique:jest.fn(),create:jest.fn().mockResolvedValue({idCargo:7})} };
    const prisma={...tx,$transaction:jest.fn(async callback=>callback(tx))};
    return {tx,service:new PaymentDayAdjustment(prisma as unknown as PrismaService)};
  }
  it('previsualizar es solo lectura; confirmar conserva el cálculo y solo cambia el contrato seleccionado',async()=>{
    const h=harness();const preview=await h.service.preview(20,15);
    expect(h.tx.contrato.update).not.toHaveBeenCalled();
    const saved=await h.service.save(20,15,preview.fingerprint,'Solicitud',1);
    expect(saved.reajuste).toMatchObject({idCargo:7,montoReajuste:preview.montoReajuste});
    expect(h.tx.contrato.update).toHaveBeenCalledWith({where:{idContrato:20},data:{diaVencimiento:15}});
    expect(h.tx.cargoAdicional.create).toHaveBeenCalledWith({data:expect.objectContaining({idContrato:20,idCliente:10,afectaSaldo:false,estado:'PENDIENTE_FACTURACION'})});
  });
  it('un cálculo obsoleto o manipulado no crea cargos',async()=>{
    const h=harness();await expect(h.service.save(20,15,'otra-huella','Solicitud',1)).rejects.toThrow('cálculo cambió');
    expect(h.tx.cargoAdicional.create).not.toHaveBeenCalled();
  });
  it('un reajuste todavía pendiente no se duplica',async()=>{
    const h=harness();const quote=await h.service.preview(20,15);
    h.tx.cambioCondicionPago.findFirst.mockResolvedValue({reajuste:{idCargo:7}} as never);
    h.tx.cargoAdicional.findUnique.mockResolvedValue({estado:'PENDIENTE_FACTURACION'});
    await expect(h.service.save(20,15,quote.fingerprint,'Solicitud',1)).rejects.toThrow('pendiente de facturación');
    expect(h.tx.cargoAdicional.create).not.toHaveBeenCalled();
  });
});
