import { Prisma } from '@prisma/client';
import { companyResponse } from './company-response';

const user = { idUsuario: 7, idEmpresa: 1, roles: ['Soporte'], email: null, nombreCompleto: 'QA' };

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

describe('proyeccion de respuestas atribuibles a empresa', () => {
  describe.each([
    { name: 'FiNet', actor: user },
    { name: 'Cable Magico', actor: { ...user, idEmpresa: 2 } },
    { name: 'Administrador', actor: { ...user, idEmpresa: null, roles: ['Administrador'] } },
  ])('$name: preservacion de null', ({ actor }) => {
    it.each<{ name: string; values: unknown[] }>([
      { name: 'inicio', values: [null, { descripcion: 'MATERIAL_QA' }] },
      { name: 'medio', values: [{ descripcion: 'PRIMERO' }, null, { descripcion: 'ULTIMO' }] },
      { name: 'final', values: [{ descripcion: 'MATERIAL_QA' }, null] },
      { name: 'solo null', values: [null, null, null] },
      { name: 'anidados', values: [null, [null, { detalle: [null, 'QA', null] }, null], []] },
      { name: 'primitivos', values: [null, 0, false, '', undefined, 'QA', null] },
    ])('conserva null, orden y serializacion: $name', ({ values }) => {
      const original = freezeDeep({ idEmpresa: actor.idEmpresa ?? 1, datosTecnicos: { materialesG3: values } });
      const before = JSON.stringify(original);
      const result = companyResponse(original, actor);
      expect(result.datosTecnicos.materialesG3).toStrictEqual(values);
      expect(result.datosTecnicos.materialesG3).toHaveLength(values.length);
      expect(JSON.parse(JSON.stringify(result))).toEqual(JSON.parse(before));
      expect(JSON.stringify(original)).toBe(before);
      expect(result.datosTecnicos.materialesG3).not.toBe(original.datosTecnicos.materialesG3);
    });

    it('distingue descartes empresariales de null legitimos sin mutar ni exponer hashes', () => {
      const own = { idEmpresa: actor.idEmpresa ?? 1, descripcion: 'PROPIO' };
      const other = { idEmpresa: own.idEmpresa === 1 ? 2 : 1, descripcion: 'OTRA_EMPRESA' };
      const unassigned = { idEmpresa: null, descripcion: 'SIN_ATRIBUCION' };
      const original = freezeDeep([null, own, other, null, unassigned, [null, other, own], false, 0, '', undefined, null]);
      const before = JSON.stringify(original);
      const result = companyResponse(original, actor);
      const expected = actor.roles.includes('Administrador') ? original
        : [null, own, null, [null, own], false, 0, '', undefined, null];
      expect(result).toStrictEqual(expected);
      expect(JSON.parse(JSON.stringify(result))).toEqual(JSON.parse(JSON.stringify(expected)));
      expect(JSON.stringify(original)).toBe(before);
      const withHash = companyResponse([null, { ...own, passwordPortalHash: 'HASH_PRIVATE' }, null], actor);
      expect(JSON.parse(JSON.stringify(withHash))).toEqual([null, own, null]);
      expect(JSON.stringify(withHash)).not.toContain('HASH_PRIVATE');
    });
  });

  it('mantiene null HTTP para raiz y relaciones singulares descartadas sin exponer el marcador', () => {
    expect(companyResponse({ idEmpresa: 2 }, user)).toBeNull();
    const result = companyResponse({ idEmpresa: 1, contrato: { idEmpresa: 2 }, direccion: { idDireccion: 7 } }, user);
    expect(result).toEqual({ idEmpresa: 1, contrato: null, direccion: null });
    expect(JSON.parse(JSON.stringify(result))).toEqual({ idEmpresa: 1, contrato: null, direccion: null });
  });

  it('no muta el registro original y conserva Date/Decimal y datos tecnicos del servicio', () => {
    const row = {
      idServicio: 1, idEmpresa: 1, idCliente: 100, idDireccion: 2,
      cliente: { idCliente: 100, idEmpresa: 2, nombreCompleto: 'QA', estado: 'Suspendido', datosTecnicos: { secreto: true } },
      direccion: { idDireccion: 2, idCliente: 100, direccionCompleta: 'QA' },
      datosTecnicos: { potencia: -20 }, fecha: new Date('2026-10-22T00:00:00Z'), monto: new Prisma.Decimal(12),
    };
    const original = JSON.stringify(row);
    const result = companyResponse(row, user);
    expect(JSON.stringify(row)).toBe(original);
    expect(result.cliente).toEqual({ idCliente: 100, nombreCompleto: 'QA' });
    expect(result.direccion).toEqual(row.direccion);
    expect(result.datosTecnicos).toEqual(row.datosTecnicos);
    expect(result.fecha).toBe(row.fecha);
    expect(result.monto).toBe(row.monto);
    expect(JSON.parse(JSON.stringify(result)).monto).toBe('12');
  });

  it('omite relaciones sin empresa, de otra empresa, y direccion sin servicio atribuible', () => {
    const result = companyResponse({
      idEmpresa: 1, contrato: { idContrato: 2, idEmpresa: null },
      plan: { idPlan: 1 }, zonaPago: { idEmpresa: 2, nombre: 'PRIVADO' },
      equipos: [{ idEmpresa: 1 }, { idEmpresa: null }, { idEmpresa: 2 }],
      direccion: { idDireccion: 1, idCliente: 100, direccionCompleta: 'PRIVADO' },
    }, user);
    expect(result).toEqual({ idEmpresa: 1, contrato: null, plan: null, zonaPago: null, equipos: [{ idEmpresa: 1 }], direccion: null });
  });

  it('administracion conserva datos operativos pero nunca recibe passwordPortalHash', () => {
    const result = companyResponse({ idEmpresa: 2, cliente: { idCliente: 100, estado: 'Moroso', passwordPortalHash: 'SECRET' } },
      { ...user, roles: ['Administrador'], idEmpresa: null });
    expect(JSON.parse(JSON.stringify(result))).toEqual({ idEmpresa: 2, cliente: { idCliente: 100, estado: 'Moroso' } });
  });
});
