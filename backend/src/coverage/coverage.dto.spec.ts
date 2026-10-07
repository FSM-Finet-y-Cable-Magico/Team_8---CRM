import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PlansForLocationDto } from './coverage.dto';

describe('Coverage query DTO', () => {
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
});