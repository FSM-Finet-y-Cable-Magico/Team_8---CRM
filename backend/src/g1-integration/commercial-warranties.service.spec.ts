import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CommercialWarrantiesService } from './commercial-warranties.service';
import { G1IntegrationError } from './g1-integration.types';

const comercial = { idUsuario: 7, idEmpresa: 1, email: null, nombreCompleto: 'Comercial', roles: ['Comercial'] };
const baseDto = { idCliente: 10, idServicio: 20, idContrato: 30, tipo: 'Garantía de servicio', fechaInicio: '2026-09-26', fechaTermino: '2027-09-26', cobertura: 'Reposición comercial', monto: 15000 };

function setup() {
  const rows: any[] = [];
  const prisma = {
    cliente: { findUnique: jest.fn().mockResolvedValue({ idCliente: 10, idEmpresa: 1 }) },
    servicioContratado: { findUnique: jest.fn().mockResolvedValue({ idServicio: 20, idEmpresa: 1, idCliente: 10, idContrato: 30, estadoOperativo: 'Activo' }) },
    contrato: { findUnique: jest.fn().mockResolvedValue({ idContrato: 30, idEmpresa: 1, idCliente: 10, estado: 'Activo' }) },
    garantiaComercial: {
      findMany: jest.fn().mockResolvedValue(rows),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(rows.find((row) => row.idGarantia === where.idGarantia) ?? null)),
      create: jest.fn().mockImplementation(({ data }) => { const row = { idGarantia: rows.length + 1, createdAt: new Date(), updatedAt: new Date(), ...data }; rows.push(row); return Promise.resolve(row); }),
      update: jest.fn().mockImplementation(({ where, data }) => { const row = rows.find((item) => item.idGarantia === where.idGarantia); Object.assign(row, data); return Promise.resolve(row); }),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const g1 = { getUnitBySerial: jest.fn().mockResolvedValue({ status: 200, durationMs: 2, data: { numero_serie: 'ONT-1', id_empresa: 1, estado: 'Instalado en cliente' } }) };
  return { service: new CommercialWarrantiesService(prisma as never, audit as never, g1 as never), prisma, audit, g1, rows };
}

describe('Etapa 4 - garantías comerciales CU-85', () => {
  it('crea una entidad comercial válida y auditable', async () => {
    const { service, prisma, audit } = setup();
    const result = await service.create(baseDto, comercial);
    expect(result).toMatchObject({ idCliente: 10, idServicio: 20, idContrato: 30, estado: 'ACTIVA', monto: 15000 });
    expect(prisma.garantiaComercial.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CREAR_GARANTIA_COMERCIAL' }));
  });

  it('rechaza fecha de término anterior al inicio', async () => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, fechaTermino: '2026-09-25' }, comercial)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza cliente de otra empresa sin filtrar datos', async () => {
    const { service, prisma } = setup();
    prisma.cliente.findUnique.mockResolvedValue({ idCliente: 10, idEmpresa: 2 });
    await expect(service.create(baseDto, comercial)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza servicio inexistente', async () => {
    const { service, prisma } = setup();
    prisma.servicioContratado.findUnique.mockResolvedValue(null);
    await expect(service.create(baseDto, comercial)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('acepta monto opcional y rechaza monto no positivo', async () => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, monto: undefined }, comercial)).resolves.toMatchObject({ monto: undefined });
    await expect(service.create({ ...baseDto, monto: 0 }, comercial)).rejects.toThrow('mayor que cero');
  });

  it('valida la referencia externa por serie en G1 sin copiar inventario', async () => {
    const { service, g1, prisma } = setup();
    await service.create({ ...baseDto, numeroSerieEquipo: 'ONT-1' }, comercial);
    expect(g1.getUnitBySerial).toHaveBeenCalledWith('ONT-1', 1);
    expect(prisma).not.toHaveProperty('unidadEquipo');
  });

  it('si G1 no está disponible exige crear la garantía sin referencia física', async () => {
    const { service, g1 } = setup();
    g1.getUnitBySerial.mockRejectedValue(new G1IntegrationError('INTEGRACION_G1_NO_CONFIGURADA', null, true, 'sin configurar'));
    await expect(service.create({ ...baseDto, numeroSerieEquipo: 'ONT-1' }, comercial)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
