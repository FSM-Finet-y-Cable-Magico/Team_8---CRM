import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CommercialEventDto,
  ControlBookQueryDto,
  CreateAdditionalChargeDto,
  CreateExtensionDto,
  CreateNonContractingLeadDto,
} from './commercial.dto';

function invalidProperties(errors: Awaited<ReturnType<typeof validate>>) {
  return errors.map((error) => error.property);
}

describe('DTO comerciales', () => {
  it('rechaza un aviso sin canal', async () => {
    const dto = plainToInstance(CommercialEventDto, {
      idCliente: 1,
      idFactura: 2,
      tipo: 'ULTIMO_AVISO_CORTE',
      fecha: '2026-09-25T12:00:00.000Z',
    });
    expect(invalidProperties(await validate(dto))).toContain('canal');
  });

  it('rechaza monto de cargo no positivo', async () => {
    const dto = plainToInstance(CreateAdditionalChargeDto, {
      idCliente: 1,
      tipo: 'REPOSICION',
      monto: 0,
      fecha: '2026-09-25',
    });
    expect(invalidProperties(await validate(dto))).toContain('monto');
  });

  it('rechaza motivo vacío y datos inválidos del interesado', async () => {
    const extension = plainToInstance(CreateExtensionDto, {
      idFactura: 1,
      nuevaFecha: '2026-10-10',
      motivo: '',
    });
    expect(invalidProperties(await validate(extension))).toContain('motivo');

    const lead = plainToInstance(CreateNonContractingLeadDto, {
      nombreCompleto: 'Persona Sintética',
      rut: '11.111.111-1',
      email: 'correo-invalido',
      telefono: '123',
      direccion: 'Dirección sintética',
      comuna: 'Comuna',
      region: 'Región',
    });
    expect(invalidProperties(await validate(lead))).toEqual(expect.arrayContaining(['email', 'telefono']));
  });

  it('valida formato, paginación, ordenamiento y filtros del Libro Control', async () => {
    const valid = plainToInstance(ControlBookQueryDto, {
      page: '2',
      pageSize: '50',
      conDeuda: 'true',
      sort: 'saldo',
      format: 'xlsx',
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid).toMatchObject({ page: 2, pageSize: 50, conDeuda: true, format: 'xlsx' });

    const invalid = plainToInstance(ControlBookQueryDto, { pageSize: 1000, sort: 'sql', format: 'pdf' });
    expect(invalidProperties(await validate(invalid))).toEqual(expect.arrayContaining(['pageSize', 'sort', 'format']));
  });
});