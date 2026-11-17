import { G2IntegrationService } from './g2-integration.service';

describe('Condiciones de pago para web', () => {
  it('incluye el reajuste verificable y el cargo pendiente con un identificador estable', async () => {
    const prisma={contrato:{findMany:jest.fn().mockResolvedValue([{
      idContrato:20,diaVencimiento:15,
      cambiosCondicionPago:[{idCambio:8,fechaRegistro:new Date('2026-11-15'),reajuste:{baseDias:30,mensualidad:30000,diasReajuste:14,montoReajuste:14000,idCargo:7,fechaDesde:'2026-12-01',proximoVencimiento:'2026-12-15'}}],
      cargosAdicionales:[{idCargo:7,monto:'14000',fecha:new Date('2026-12-01'),estado:'PENDIENTE_FACTURACION',observacion:'Reajuste'}],
    }])}};
    const service=new G2IntegrationService(prisma as never,{} as never,{} as never,{} as never);
    const result=await service.paymentConditions(10,1);
    expect(result.contratos[0]).toMatchObject({id_contrato:20,dia_pago:15,ultimo_cambio:{reajuste:{idCargo:7,montoReajuste:14000}},cargos_pendientes:[{id_cargo:7,monto:14000}]});
    expect(prisma.contrato.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{idCliente:10,idEmpresa:1},select:expect.objectContaining({cargosAdicionales:expect.objectContaining({where:{idCliente:10,idEmpresa:1,estado:'PENDIENTE_FACTURACION'}})})}));
  });
});
