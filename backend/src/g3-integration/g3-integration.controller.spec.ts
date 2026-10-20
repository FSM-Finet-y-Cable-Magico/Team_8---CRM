import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA, HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { G3CanonicalWebhookController, G3IntegrationController } from './g3-integration.controller';

const closure = { process: jest.fn().mockResolvedValue({ duplicate: false }) };

describe('ruta autenticada de lectura histórica', () => {
  it('usa GET, JWT, roles de consulta y no-store sin llamar al processor', async () => {
    const installations = { historicalClosureForService: jest.fn().mockResolvedValue({ estadoConsulta: 'DISPONIBLE' }) };
    const processor = { process: jest.fn() };
    const controller = new G3IntegrationController(installations as never, processor as never);
    const route = controller.historicalClosure;
    expect(Reflect.getMetadata(PATH_METADATA, route)).toBe('services/:id/historical-closure');
    expect(Reflect.getMetadata(METHOD_METADATA, route)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(GUARDS_METADATA, route)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata('roles', route)).toEqual(ACCESS_ROLES.VIEW_CORE_DATA);
    expect(Reflect.getMetadata(HEADERS_METADATA, route)).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
    const user = { idUsuario: 5, idEmpresa: 2, roles: ['Comercial'] };
    await controller.historicalClosure(50, user as never);
    expect(installations.historicalClosureForService).toHaveBeenCalledWith(50, user);
    expect(processor.process).not.toHaveBeenCalled();
  });
});

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
