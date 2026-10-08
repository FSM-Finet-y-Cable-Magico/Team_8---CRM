import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GeocodeAddressDto, PlansForLocationDto } from './coverage.dto';

describe('Coverage query DTO', () => {
  it('acepta el domicilio completo sin truncar comuna y region y conserva un limite acotado', async () => {
    const direccion = `${'a'.repeat(200)}, ${'c'.repeat(80)}, ${'r'.repeat(80)}, Chile`;
    expect(await validate(plainToInstance(GeocodeAddressDto, { direccion }))).toHaveLength(0);
    expect(await validate(plainToInstance(GeocodeAddressDto, { direccion: 'a'.repeat(401) }))).not.toHaveLength(0);
  });

  it('convierte latitud y longitud de query string a number', async () => {
    const dto = plainToInstance(PlansForLocationDto, {
      idEmpresa: '1',
      latitud: '-33.58787775',
      longitud: '-70.57728075',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.idEmpresa).toBe(1);
    expect(dto.latitud).toBe(-33.58787775);
    expect(dto.longitud).toBe(-70.57728075);
  });

  it('sigue rechazando coordenadas fuera de rango', async () => {
    const dto = plainToInstance(PlansForLocationDto, {
      idEmpresa: '1',
      latitud: '91',
      longitud: '-70.5',
    });

    const errors = await validate(dto);

    expect(errors.some(error => error.property === 'latitud')).toBe(true);
  });

  it.each(['', '  ', null, false, true])('no convierte coordenadas incompletas en numeros: %j', async value => {
    const dto = plainToInstance(PlansForLocationDto, { idEmpresa: 1, latitud: value, longitud: value });
    expect((await validate(dto)).map(error => error.property)).toEqual(['latitud', 'longitud']);
  });

  it('mantiene validas las coordenadas cero explicitas', async () => {
    expect(await validate(plainToInstance(PlansForLocationDto, { idEmpresa: 1, latitud: '0', longitud: 0 }))).toHaveLength(0);
  });
});
