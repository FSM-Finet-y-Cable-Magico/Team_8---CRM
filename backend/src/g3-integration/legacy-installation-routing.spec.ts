import { ContractsController } from '../contracts/contracts.controller';
import { ProspectsController } from '../prospects/prospects.controller';
import { ServicesController } from '../services/services.controller';

const user = { idUsuario: 5, idEmpresa: 1, email: null, nombreCompleto: 'Comercial', roles: ['Comercial'] };

describe('Etapa 3 - rutas legacy de instalacion', () => {
  it('47. ruta de Prospecto delega a G3 y no crea OT local', async () => {
    const prospects = { createInstallOrder: jest.fn() };
    const integrations = { requestInstallation: jest.fn().mockResolvedValue({ fuente: 'G3' }) };
    const controller = new ProspectsController(prospects as never, integrations as never);
    await controller.createInstallOrder(10, {} as never, user);
    expect(integrations.requestInstallation).toHaveBeenCalledWith({ idProspecto: 10 }, user); expect(prospects.createInstallOrder).not.toHaveBeenCalled();
  });
  it('47b. ruta de Servicio delega a G3 y no crea OT local', async () => {
    const services = { createInstallOrder: jest.fn() };
    const integrations = { requestInstallation: jest.fn().mockResolvedValue({ fuente: 'G3' }) };
    const controller = new ServicesController(services as never, integrations as never, {} as never);
    await controller.createInstallOrder(50, {} as never, user);
    expect(integrations.requestInstallation).toHaveBeenCalledWith({ idServicio: 50 }, user); expect(services.createInstallOrder).not.toHaveBeenCalled();
  });
  it('47c. preparar contrato delega a G3', async () => {
    const contracts = { prepareInstallation: jest.fn() };
    const integrations = { requestInstallation: jest.fn().mockResolvedValue({ fuente: 'G3' }) };
    const controller = new ContractsController(contracts as never, integrations as never);
    await controller.prepareInstallation(20, user);
    expect(integrations.requestInstallation).toHaveBeenCalledWith({ idContrato: 20 }, user); expect(contracts.prepareInstallation).not.toHaveBeenCalled();
  });
});
