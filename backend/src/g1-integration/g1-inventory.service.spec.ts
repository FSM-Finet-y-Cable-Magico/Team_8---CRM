import { HttpException, NotFoundException } from '@nestjs/common';
import { G1InventoryService } from './g1-inventory.service';
import { G1IntegrationError } from './g1-integration.types';

const support = { idUsuario: 2, idEmpresa: 1, email: null, nombreCompleto: 'Soporte', roles: ['Soporte'] };

function setup() {
  const prisma = { servicioContratado: { findUnique: jest.fn().mockResolvedValue({ idServicio: 20, idEmpresa: 1, idCliente: 10 }) } };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const client = {
    getEquipmentTypes: jest.fn().mockResolvedValue({ status: 200, durationMs: 3, data: [{ id_tipo_equipo: 1, id_empresa: 1, nombre: 'ONT' }] }),
    getUnitBySerial: jest.fn().mockResolvedValue({ status: 200, durationMs: 3, data: { numero_serie: 'ONT-1', id_empresa: 1, estado: 'Instalado en cliente', garantia: { vigente: true } } }),
    getEquipmentByService: jest.fn().mockResolvedValue({ status: 200, durationMs: 3, data: [{ numero_serie: 'ONT-1', id_empresa: 1, estado: 'Instalado en cliente', garantia: { vigente: true } }] }),
  };
  return { service: new G1InventoryService(prisma as never, audit as never, client as never), prisma, audit, client };
}

describe('Etapa 4 - consultas G1 con scope', () => {
  it('lista equipos por servicio con garantía física y fuente G1', async () => {
    const { service, client, prisma } = setup();
    await expect(service.equipmentByService(20, support)).resolves.toMatchObject({ fuente: 'G1', data: [{ numero_serie: 'ONT-1', garantia: { vigente: true }, estadoFisicoOficial: true }] });
    expect(client.getEquipmentByService).toHaveBeenCalledWith(20, 1);
    expect(prisma).not.toHaveProperty('unidadEquipo');
  });

  it('oculta servicio de otra empresa antes de llamar G1', async () => {
    const { service, client } = setup();
    await expect(service.equipmentByService(20, { ...support, idEmpresa: 2 })).rejects.toBeInstanceOf(NotFoundException);
    expect(client.getEquipmentByService).not.toHaveBeenCalled();
  });

  it('rechaza respuesta G1 que cruce empresas', async () => {
    const { service, client } = setup();
    client.getUnitBySerial.mockResolvedValue({ status: 200, durationMs: 1, data: { numero_serie: 'ONT-2', id_empresa: 2, estado: 'En bodega' } });
    await expect(service.unitBySerial('ONT-2', support, 1)).rejects.toMatchObject({ status: 403 });
  });

  it('P1 no desplegado queda explícitamente pendiente y no hace fallback local', async () => {
    const { service, client, prisma } = setup();
    client.getEquipmentByService.mockRejectedValue(new G1IntegrationError('INTEGRACION_G1_NO_CONFIGURADA', null, true, 'sin configurar'));
    const error = await service.equipmentByService(20, support).catch((value) => value as HttpException);
    expect((error as HttpException).getResponse()).toMatchObject({ code: 'PENDIENTE_INTEGRACION_G1' });
    expect(prisma).not.toHaveProperty('unidadEquipo');
  });
});
