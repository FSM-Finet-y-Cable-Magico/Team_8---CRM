import { rutLookupVariants, validateRut } from './rut.util';

describe('validateRut', () => {
  it('reconoce grafias historicas de consulta con puntos y K sin cambiar la identidad canonica', () => {
    for (const input of ['12345670-K', '12345670k', '12.345.670-K', '12.345.670k']) {
      const variants = rutLookupVariants(input);
      expect(variants).toEqual(expect.arrayContaining([
        '12345670-K', '12345670K', '12.345.670-K', '12.345.670K',
        '12345670-k', '12345670k', '12.345.670-k', '12.345.670k',
      ]));
      expect(new Set(variants).size).toBe(variants.length);
      expect(validateRut(input)).toMatchObject({ valid: true, normalized: '12345670-K' });
    }
    expect(rutLookupVariants('11.111.111-2')).toEqual([]);
    expect(rutLookupVariants('1.234.567-4')).toContain('1.234.567-4');
  });
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
