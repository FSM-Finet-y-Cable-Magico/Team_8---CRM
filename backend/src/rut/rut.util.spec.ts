import { validateRut } from './rut.util';

describe('validateRut', () => {
  it('acepta un RUT valido y lo normaliza con guion', () => {
    const result = validateRut('11.111.111-1');

    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('11111111-1');
  });

  it('acepta un RUT con digito verificador K', () => {
    const result = validateRut('12.345.670-K');

    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('12345670-K');
  });

  it('rechaza un digito verificador incorrecto', () => {
    const result = validateRut('11.111.111-2');

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Digito verificador no coincide');
  });

  it('rechaza un formato invalido', () => {
    const result = validateRut('abc123');

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Formato invalido');
  });

  it('rechaza un valor vacio', () => {
    const result = validateRut('   ');

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('RUT vacio');
  });
});
