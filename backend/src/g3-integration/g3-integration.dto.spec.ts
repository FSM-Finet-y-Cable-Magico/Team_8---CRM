import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { G3ClosureDto } from './g3-integration.dto';

const closurePayload = {
  id_ot: 901,
  request_id: '11111111-1111-4111-8111-111111111111',
  trace_id: '22222222-2222-4222-8222-222222222222',
  id_empresa: 1,
  id_prospecto: 10,
  id_contrato: 20,
  id_plan: 7,
  equipos_instalados: [{ numero_serie: 'ONT-001' }],
  equipos_retirados: [],
};

describe('G3ClosureDto approval-only', () => {
  it('acepta campos tecnicos del constructor sin exigir identidades de G8 para el tecnico', async () => {
    const dto = plainToInstance(G3ClosureDto, { ...closurePayload, tipo_ot: 'INSTALACION',
      fecha_completada: '2026-11-08T12:00:00.000Z', id_tecnico: null, usuario_tecnico: null,
      potencia_optica_dbm: 0, resultado_llamada: '', resuelto_remotamente: false,
      materiales: [{ id_tipo_equipo: 7, nombre: '', cantidad: 1.5 }],
      cliente: { rut: null, nombre: 'QA' }, direccion: { direccion_completa: 'QA', comuna: 'QA' },
      categoria_falla: { id_categoria: 3, nombre: 'QA' }, categoria_falla_otro: null });
    await expect(validate(dto, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it('referencias nulas solo son admisibles en la envolvente de una reparacion explicita', async () => {
    const body = { ...closurePayload, request_id: null, trace_id: null, id_contrato: null, id_prospecto: null, id_plan: null };
    const repair = plainToInstance(G3ClosureDto, { ...body, tipo_ot: 'REPARACION' });
    await expect(validate(repair, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
    const install = plainToInstance(G3ClosureDto, { ...body, tipo_ot: 'INSTALACION' });
    expect((await validate(install)).map(error => error.property)).toEqual(expect.arrayContaining(['request_id', 'trace_id', 'id_contrato', 'id_prospecto', 'id_plan']));
  });
  it('acepta el payload contractual sin campo estado', async () => {
    const dto = plainToInstance(G3ClosureDto, closurePayload);
    await expect(validate(dto, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it('no incorpora estado como campo contractual del webhook', async () => {
    const dto = plainToInstance(G3ClosureDto, { ...closurePayload, estado: 'COMPLETADA' });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.some(error => error.property === 'estado')).toBe(true);
  });

  it.each([1, 2])('acepta id_empresa=%s para que el guard aplique el scope de la key', async (idEmpresa) => {
    const dto = plainToInstance(G3ClosureDto, { ...closurePayload, id_empresa: idEmpresa });
    await expect(validate(dto, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it('exige todas las correlaciones y los dos arreglos de equipos', async () => {
    const { trace_id: _trace, equipos_retirados: _removed, ...incomplete } = closurePayload;
    const dto = plainToInstance(G3ClosureDto, incomplete);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map(error => error.property)).toEqual(expect.arrayContaining(['trace_id', 'equipos_retirados']));
  });
});
