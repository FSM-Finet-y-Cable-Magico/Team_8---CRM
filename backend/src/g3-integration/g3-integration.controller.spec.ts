import { BadRequestException } from '@nestjs/common';
import { G3CanonicalWebhookController, G3IntegrationController } from './g3-integration.controller';

const closure = { process: jest.fn().mockResolvedValue({ duplicate: false }) };

describe('webhook G3 canónico y alias', () => {
  beforeEach(() => closure.process.mockClear());

  const payload = {
    id_ot: 901,
    request_id: 'req-1',
    trace_id: 'trace-1',
    id_empresa: 1,
    id_prospecto: 10,
    id_contrato: 20,
    id_plan: 7,
    equipos_instalados: [],
    equipos_retirados: [],
  };

  it('ambas rutas aceptan el cierre sin estado y reutilizan el mismo processor', async () => {
    const canonical = new G3CanonicalWebhookController(closure as never);
    const alias = new G3IntegrationController({} as never, closure as never);
    await canonical.receiveClosure(901, payload);
    await alias.receiveClosure(payload);
    expect(closure.process).toHaveBeenNthCalledWith(1, payload, 'WEBHOOK');
    expect(closure.process).toHaveBeenNthCalledWith(2, payload, 'WEBHOOK');
  });

  it('rechaza un id_ot de body distinto al de la ruta', () => {
    const controller = new G3CanonicalWebhookController(closure as never);
    expect(() => controller.receiveClosure(901, { ...payload, id_ot: 902 })).toThrow(BadRequestException);
  });
});
