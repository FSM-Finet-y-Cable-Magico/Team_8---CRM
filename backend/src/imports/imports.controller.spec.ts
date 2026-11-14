import { AuthUser } from '../common/auth.types';
import { ControlBookImportPreviewService } from './control-book-import-preview.service';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

describe('Compatibilidad de revisión de importaciones', () => {
  it('conserva el contrato de revisión anterior cuando no se solicita el flujo de clientes', async () => {
    const legacy = { preview: jest.fn(async () => ({ formatVersion: 'FINET_LIBRO_CONTROL_V1', persisted: false })) };
    const clients = { previewClients: jest.fn() };
    const controller = new ImportsController(clients as unknown as ImportsService, legacy as unknown as ControlBookImportPreviewService);
    expect(await controller.previewControlBook({} as Express.Multer.File, {} as AuthUser, '1', 'AGOSTO')).toMatchObject({ formatVersion: 'FINET_LIBRO_CONTROL_V1' });
    expect(legacy.preview).toHaveBeenCalledWith({}, {}, 1, 'AGOSTO');
    expect(clients.previewClients).not.toHaveBeenCalled();
  });

  it('usa la misma ruta para revisar clientes cuando la interfaz lo solicita explícitamente', async () => {
    const legacy = { preview: jest.fn() };
    const clients = { previewClients: jest.fn(async () => ({ readyRows: 70, persisted: false })) };
    const controller = new ImportsController(clients as unknown as ImportsService, legacy as unknown as ControlBookImportPreviewService);
    expect(await controller.previewControlBook({} as Express.Multer.File, {} as AuthUser, '1', undefined, 'clients')).toMatchObject({ readyRows: 70, persisted: false });
    expect(legacy.preview).not.toHaveBeenCalled();
  });
});
