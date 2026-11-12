import { G1_RECEPTION_CONTRACT_STATUS, parseG1ReceptionEvent, receptionConfirmations } from './g1-reception-contract';
import { assessWithdrawalClosure } from './withdrawal-closure';

const expected = { idEmpresa: 1, idOtG3: 900, requestId: 'g8-retiro-1-1000' };
const event = (over: Record<string, unknown> = {}) => ({
  clave_evento: 'g1-recepcion-900-001', id_empresa: 1, id_ot_g3: 900, request_id: 'g8-retiro-1-1000',
  equipos: [{ numero_serie: 'ont-001', resultado: 'RECIBIDO', estado_g1: 'En revisión', fecha_recepcion: '2026-11-21T10:00:00.000Z' }], ...over,
});

describe('Evento de recepción de G1 (propuesto, no ratificado)', () => {
  it('declara que no está ratificado', () => expect(G1_RECEPTION_CONTRACT_STATUS).toBe('PROPUESTO_NO_RATIFICADO'));

  it('acepta una recepción correlacionada con la OT y normaliza la serie', () => {
    expect(parseG1ReceptionEvent(event(), expected).equipos).toEqual([{ numero_serie: 'ONT-001', resultado: 'RECIBIDO', estado_g1: 'En revisión', fecha_recepcion: '2026-11-21T10:00:00.000Z' }]);
  });

  it('un equipo recibido con daño cuenta como recibido; uno no recibido no confirma nada', () => {
    const parsed = parseG1ReceptionEvent(event({ equipos: [
      { numero_serie: 'A1', resultado: 'RECIBIDO_CON_DANO', estado_g1: 'En revisión', fecha_recepcion: '2026-11-21T10:00:00Z' },
      { numero_serie: 'B2', resultado: 'NO_RECIBIDO', estado_g1: 'Instalado en cliente', fecha_recepcion: null },
    ] }), expected);
    expect(receptionConfirmations(parsed)).toEqual([{ numeroSerie: 'A1', idOtG3: 900, estadoG1: 'En revisión' }]);
  });

  it.each([
    ['otra empresa', { id_empresa: 2 }, 'REFERENCE_MISMATCH'],
    ['otra OT', { id_ot_g3: 901 }, 'REFERENCE_MISMATCH'],
    ['otra solicitud', { request_id: 'g8-retiro-1-999' }, 'REFERENCE_MISMATCH'],
    ['campo fuera de contrato', { disponible: true }, 'UNKNOWN_FIELD'],
    ['clave idempotente ausente', { clave_evento: '' }, 'KEY_INVALID'],
    ['sin equipos', { equipos: [] }, 'EQUIPMENT_INVALID'],
    ['resultado desconocido', { equipos: [{ numero_serie: 'A', resultado: 'OK', estado_g1: 'En bodega', fecha_recepcion: '2026-11-21T10:00:00Z' }] }, 'RESULT_INVALID'],
    ['recibido con estado de instalado', { equipos: [{ numero_serie: 'A', resultado: 'RECIBIDO', estado_g1: 'Instalado en cliente', fecha_recepcion: '2026-11-21T10:00:00Z' }] }, 'STATE_INVALID'],
    ['recibido sin fecha', { equipos: [{ numero_serie: 'A', resultado: 'RECIBIDO', estado_g1: 'En bodega', fecha_recepcion: null }] }, 'DATE_INVALID'],
    ['serie duplicada', { equipos: [{ numero_serie: 'a', resultado: 'RECIBIDO', estado_g1: 'En bodega', fecha_recepcion: '2026-11-21T10:00:00Z' }, { numero_serie: 'A ', resultado: 'RECIBIDO', estado_g1: 'En bodega', fecha_recepcion: '2026-11-21T10:00:00Z' }] }, 'DUPLICATED_SERIAL'],
  ])('rechaza %s', (_name, over, code) => {
    expect(() => parseG1ReceptionEvent(event(over), expected)).toThrow(code);
  });

  it('un evento repetido produce las mismas confirmaciones (sin movimientos duplicados)', () => {
    expect(receptionConfirmations(parseG1ReceptionEvent(event(), expected))).toEqual(receptionConfirmations(parseG1ReceptionEvent(structuredClone(event()), expected)));
  });

  it('extremo a extremo de las reglas: OT aprobada + confirmación de G1 permite la baja', () => {
    const receptions = receptionConfirmations(parseG1ReceptionEvent(event(), expected));
    const result = assessWithdrawalClosure({
      receipt: { idOtG3: 900, estadoOt: 'COMPLETADA', cierreAprobado: true, equiposRetirados: [{ numeroSerie: 'ONT-001' }], equiposFaltantes: [] },
      inventory: [], receptions,
    });
    expect(result.outcome).toBe('APLICAR_BAJA');
  });
});
