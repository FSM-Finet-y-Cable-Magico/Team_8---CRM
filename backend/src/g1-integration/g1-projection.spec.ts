import { NotFoundException } from '@nestjs/common';
import { G1InventoryService } from './g1-inventory.service';
import { projectEquipmentType, projectUnit } from './g1-projection';

// Responses with the exact shape of G1 main 2131b7f5 plus extra fields (root and nested) that must never cross to G8's API.
const SECRET = /dato_interno|costo_compra|proveedor_interno|NO_MOSTRAR|ubicacion_bodega_interna|rut_cliente/;
const realUnit = {
  id_unidad: 501, numero_serie: 'HWTC-REAL-0001', estado: 'Instalado en cliente', id_empresa: 1, id_tipo_equipo: 11,
  tipo_equipo: { nombre: 'ONT GPON', categoria: 'ONT', marca: 'Huawei', modelo: 'HG8145', costo_compra: 35000 },
  mac_address: 'AA:BB:CC:00:11:22', id_bodega_actual: null, fecha_adquisicion: '2026-01-15',
  garantia: { fecha_vencimiento: '2027-01-15', vigente: true, proveedor_interno: 'X' },
  asignacion_actual: { id_cliente_externo: 33, id_servicio_externo: 61, id_contrato_externo: 53, id_ot: 900001, dato_interno: 'NO_MOSTRAR', rut_cliente: '12345678-5' },
  dato_interno: 'NO_MOSTRAR', ubicacion_bodega_interna: 'Pasillo 4',
};
const realType = { id_tipo_equipo: 11, id_empresa: 1, nombre: 'ONT GPON', categoria: 'ONT', marca: 'Huawei', modelo: 'HG8145', descripcion_tecnica: 'GPON',
  unidad_medida: 'unidad', garantia_dias: 365, requiere_serie_individual: true, activo: true, costo_compra: 35000 };
const realServiceItem = { id_unidad: 501, numero_serie: 'HWTC-REAL-0001', estado: 'Instalado en cliente',
  tipo_equipo: { id_tipo_equipo: 11, nombre: 'ONT GPON', categoria: 'ONT', dato_interno: 'x' }, fecha_instalacion: '2026-03-02T12:00:00.000Z', id_ot: 900001, dato_interno: 'NO_MOSTRAR' };

const user = (idEmpresa: number, roles = ['Soporte']) => ({ idUsuario: 2, idEmpresa, email: null, nombreCompleto: 'QA', roles });
function setup(serviceCompany = 1) {
  const prisma = { servicioContratado: { findUnique: jest.fn().mockResolvedValue({ idServicio: 61, idEmpresa: serviceCompany, idCliente: 33 }) } };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const client = {
    getEquipmentTypes: jest.fn().mockResolvedValue({ status: 200, durationMs: 1, data: [realType] }),
    getUnitBySerial: jest.fn().mockResolvedValue({ status: 200, durationMs: 1, data: realUnit }),
    getEquipmentByService: jest.fn().mockResolvedValue({ status: 200, durationMs: 1, data: [realServiceItem] }),
  };
  return { service: new G1InventoryService(prisma as never, audit as never, client as never), audit, client };
}

describe('Filtrado de campos G1 hacia la API de G8', () => {
  it('unidad por serie: solo campos aprobados, objetos anidados proyectados y asignación con referencias G8', async () => {
    const { service, audit } = setup();
    const result = await service.unitBySerial('HWTC-REAL-0001', user(1), 1);
    expect(result.data).toEqual({
      id_unidad: 501, numero_serie: 'HWTC-REAL-0001', id_empresa: 1, id_tipo_equipo: 11,
      tipo_equipo: { id_tipo_equipo: null, nombre: 'ONT GPON', categoria: 'ONT', marca: 'Huawei', modelo: 'HG8145' },
      mac_address: 'AA:BB:CC:00:11:22', estado: 'Instalado en cliente', estadoFisicoOficial: true, id_bodega_actual: null,
      fecha_adquisicion: '2026-01-15', fecha_instalacion: null, id_ot: null,
      garantia: { fecha_vencimiento: '2027-01-15', vigente: true },
      asignacion_actual: { id_cliente: 33, id_servicio: 61, id_contrato: 53, id_ot: 900001 },
    });
    expect(JSON.stringify(result)).not.toMatch(SECRET);
    expect(JSON.stringify(audit.record.mock.calls)).not.toMatch(SECRET);
  });

  it('catálogo de tipos: elimina campos extra y conserva lo funcional', async () => {
    const { service } = setup();
    const result = await service.equipmentTypes(user(1), {});
    expect(result.data).toEqual([{ id_tipo_equipo: 11, id_empresa: 1, nombre: 'ONT GPON', categoria: 'ONT', marca: 'Huawei', modelo: 'HG8145',
      descripcion_tecnica: 'GPON', unidad_medida: 'unidad', garantia_dias: 365, requiere_serie_individual: true, activo: true }]);
    expect(JSON.stringify(result)).not.toMatch(SECRET);
  });

  it('equipos por servicio con la forma real de G1 (sin id_empresa): se aceptan, se proyectan y se atribuyen a la empresa consultada', async () => {
    const { service, client } = setup();
    const result = await service.equipmentByService(61, user(1));
    expect(client.getEquipmentByService).toHaveBeenCalledWith(61, 1);
    expect(result.data).toEqual([expect.objectContaining({ id_unidad: 501, numero_serie: 'HWTC-REAL-0001', id_empresa: 1, id_tipo_equipo: 11,
      tipo_equipo: { id_tipo_equipo: 11, nombre: 'ONT GPON', categoria: 'ONT', marca: null, modelo: null },
      fecha_instalacion: '2026-03-02T12:00:00.000Z', id_ot: 900001, estadoFisicoOficial: true })]);
    expect(result.data[0]).not.toHaveProperty('garantia');
    expect(result.data[0]).not.toHaveProperty('asignacion_actual');
    expect(JSON.stringify(result)).not.toMatch(SECRET);
  });

  it('un equipo declarado de otra empresa sigue siendo 403', async () => {
    const { service, client } = setup();
    client.getEquipmentByService.mockResolvedValue({ status: 200, durationMs: 1, data: [{ ...realServiceItem, id_empresa: 2 }] });
    await expect(service.equipmentByService(61, user(1))).rejects.toMatchObject({ status: 403 });
  });

  it('aislamiento: un usuario de Cable Mágico no consulta series ni servicios de FiNet', async () => {
    const { service, client } = setup(1);
    await expect(service.unitBySerial('HWTC-REAL-0001', user(2), 1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.equipmentByService(61, user(2))).rejects.toBeInstanceOf(NotFoundException);
    expect(client.getUnitBySerial).not.toHaveBeenCalled();
    expect(client.getEquipmentByService).not.toHaveBeenCalled();
    await expect(service.unitBySerial('HWTC-REAL-0001', user(2), 2)).rejects.toMatchObject({ status: 403 });
  });

  it('catálogo y unidades son contratos distintos', () => {
    expect(projectEquipmentType(realType, 1)).not.toHaveProperty('numero_serie');
    expect(projectEquipmentType(realType, 1)).not.toHaveProperty('estado');
    expect(projectUnit(realUnit, 1)).not.toHaveProperty('garantia_dias');
  });

  it('valores con tipo inválido se descartan en lugar de propagarse', () => {
    const unit = projectUnit({ ...realUnit, mac_address: { x: 1 }, id_bodega_actual: -3, fecha_adquisicion: 'ayer', garantia: 'vigente', asignacion_actual: 'algo' }, 1);
    expect(unit).toMatchObject({ mac_address: null, id_bodega_actual: null, fecha_adquisicion: null, garantia: null, asignacion_actual: null });
    expect(projectEquipmentType({ nombre: 'Sin id' }, 1)).toBeNull();
    expect(projectUnit({ numero_serie: 'X', estado: 'En bodega' }, 1)).not.toHaveProperty('asignacion_actual');
  });

  it('acepta la nomenclatura previa de asignación (id_cliente/id_servicio/id_contrato)', () => {
    expect(projectUnit({ ...realUnit, asignacion_actual: { id_cliente: 1, id_servicio: 2, id_contrato: 3, id_ot: 'OT-QA-1' } }, 1).asignacion_actual)
      .toEqual({ id_cliente: 1, id_servicio: 2, id_contrato: 3, id_ot: 'OT-QA-1' });
  });
});
