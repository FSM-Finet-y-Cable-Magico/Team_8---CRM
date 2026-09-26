import { ConflictException, GoneException } from '@nestjs/common';
import { DomainOwnershipService } from './domain-ownership.service';
import { InventoryController } from '../inventory/inventory.controller';
import { ServicesController } from '../services/services.controller';
import { WorkOrdersController } from '../work-orders/work-orders.controller';

const user = { idUsuario: 5, idEmpresa: 1, email: null, nombreCompleto: 'Admin', roles: ['Administrador'] };

function setup() {
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const ownership = new DomainOwnershipService(audit as never);
  const inventoryService = {
    createEquipment: jest.fn(), createNapBox: jest.fn(), createConsumableStock: jest.fn(), recordConsumableMovement: jest.fn(),
    recordMovement: jest.fn(), updateStatus: jest.fn(), blockEquipment: jest.fn(), diagnoseEquipment: jest.fn(), transferEquipment: jest.fn(),
    registerMaintenance: jest.fn(), installRouter: jest.fn(), attachEvidence: jest.fn(),
  };
  return {
    audit,
    ownership,
    inventoryService,
    inventory: new InventoryController(inventoryService as never, ownership),
    services: new ServicesController({ attachEquipment: jest.fn() } as never, {} as never, ownership),
    workOrders: new WorkOrdersController({ completeInstallation: jest.fn() } as never, ownership),
  };
}

describe('Etapa 4 - bloqueo de writes físicos heredados', () => {
  it.each([
    ['nueva unidad', (c: InventoryController) => c.createEquipment({} as never, user)],
    ['movimiento', (c: InventoryController) => c.recordMovement({} as never, user)],
    ['estado físico', (c: InventoryController) => c.updateStatus(1, {} as never, user)],
    ['stock y bodega implícita', (c: InventoryController) => c.createConsumableStock({} as never, user)],
    ['movimiento consumible', (c: InventoryController) => c.recordConsumableMovement(1, {} as never, user)],
    ['baja o bloqueo', (c: InventoryController) => c.blockEquipment(1, {} as never, user)],
    ['diagnóstico', (c: InventoryController) => c.diagnoseEquipment(1, {} as never, user)],
    ['transferencia', (c: InventoryController) => c.transferEquipment(1, {} as never, user)],
    ['mantención', (c: InventoryController) => c.registerMaintenance(1, {} as never, user)],
    ['instalación local', (c: InventoryController) => c.installRouter(1, {} as never, user)],
  ])('rechaza %s con INVENTORY_OWNED_BY_G1', async (_label, action) => {
    const { inventory, inventoryService, audit } = setup();
    const error = await action(inventory).catch((value) => value as ConflictException);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'INVENTORY_OWNED_BY_G1' });
    expect(Object.values(inventoryService).every((mock) => mock.mock.calls.length === 0)).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'INTENTO_WRITE_INVENTARIO_DEPRECADO' }));
  });

  it('depreca creación NAP porque pertenece a G3', async () => {
    const { inventory } = setup();
    const error = await inventory.createNapBox({} as never, user).catch((value) => value as GoneException);
    expect(error.getResponse()).toMatchObject({ code: 'G3_INTEGRATION_REQUIRED' });
  });

  it('depreca evidencia de OT local porque pertenece a G3', async () => {
    const { inventory } = setup();
    await expect(inventory.attachEvidence(1, {} as never, user)).rejects.toBeInstanceOf(GoneException);
  });

  it('bloquea asociación local desde Servicio', async () => {
    const { services } = setup();
    await expect(services.attachEquipment(20, {} as never, user)).rejects.toBeInstanceOf(ConflictException);
  });

  it('bloquea cierre local de instalación y exige el evento G3', async () => {
    const { workOrders } = setup();
    const error = await workOrders.completeInstallation(90, {} as never, user).catch((value) => value as GoneException);
    expect(error.getResponse()).toMatchObject({ code: 'G3_INTEGRATION_REQUIRED' });
  });
});
