import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCustomerProfileDto } from './update-customer-profile.dto';

describe('Direcciones de contacto y del selector de contratación', () => {
  it('admite dirección y comuna, recorta espacios y rechaza objetos incompletos o campos de contratos', async () => {
    const dto = plainToInstance(UpdateCustomerProfileDto, { direccionActual: { direccion: '  Calle actual 123  ', comuna: ' Ñuñoa ' } });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(dto.direccionActual).toMatchObject({ direccion: 'Calle actual 123', comuna: 'Ñuñoa' });
    for (const body of [{ direccionActual: { direccion: 'Otra dirección 123' } },
      { ocultarDireccion: { direccion: 'Calle histórica 123', comuna: 'Santiago', idContrato: 10 } },
      { direccionActual: 'Calle inválida' }, { direccionActual: [] }, { ocultarDireccion: [] }]) {
      expect((await validate(plainToInstance(UpdateCustomerProfileDto, body), { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
    }
  });
});
