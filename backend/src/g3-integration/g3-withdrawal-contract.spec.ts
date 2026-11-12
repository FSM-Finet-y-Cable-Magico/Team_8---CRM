import { buildG3WithdrawalRequest, G3_WITHDRAWAL_CONTRACT_STATUS, parseG3WithdrawalEvent, withdrawalRequestId } from './g3-withdrawal-contract';

const snapshot = {
  idEmpresa: 1, idCliente: 30, idContrato: 20, idServicio: 50, idSolicitudRetiro: 1000, idTicket: 1001,
  rutCliente: '12345678-k', direccionRetiro: '  Pasaje Ficticio 102  ', comunaRetiro: 'Valparaíso', observaciones: 'Retiro por morosidad',
  traceId: '8f14e45f-ceea-4e7a-9c2b-1a2b3c4d5e6f',
};
const event = (over: Record<string, unknown> = {}) => ({
  clave_idempotencia: '900:2026-11-20T15:00:00.000Z', request_id: 'g8-retiro-1-1000', id_ot: 900, id_empresa: 1, id_solicitud_retiro_externa: 1000,
  estado_ot: 'COMPLETADA', cierre_aprobado: true, fecha_completada: '2026-11-20T15:00:00.000Z',
  equipos_retirados: [{ numero_serie: 'ont-001', diagnostico: 'Causa desconocida' }], equipos_faltantes: [], ...over,
});
const expected = { idEmpresa: 1, idSolicitudRetiro: 1000 };

describe('Contrato G3 de retiro técnico (propuesto, no ratificado)', () => {
  it('declara explícitamente que no está ratificado', () => {
    expect(G3_WITHDRAWAL_CONTRACT_STATUS).toBe('PROPUESTO_NO_RATIFICADO');
  });

  it('la solicitud correlaciona empresa, cliente, contrato, servicio, solicitud y ticket con clave idempotente determinista', () => {
    const request = buildG3WithdrawalRequest(snapshot);
    expect(request).toEqual({
      request_id: 'g8-retiro-1-1000', trace_id: snapshot.traceId, tipo_ot: 'BAJA', motivo: 'MOROSIDAD', id_empresa: 1,
      id_cliente_externo: 30, id_contrato_externo: 20, id_servicio_externo: 50, id_solicitud_retiro_externa: 1000, id_ticket_externo: 1001,
      rut_cliente: '12345678-K', direccion_retiro: 'Pasaje Ficticio 102', comuna_retiro: 'Valparaíso', observaciones: 'Retiro por morosidad',
    });
    expect(buildG3WithdrawalRequest(snapshot).request_id).toBe(withdrawalRequestId(1, 1000));
  });

  it('no incluye datos de pago, deuda ni credenciales', () => {
    expect(JSON.stringify(buildG3WithdrawalRequest(snapshot))).not.toMatch(/saldo|deuda|monto|password|token|api_?key/i);
  });

  it.each([
    ['referencia inválida', { idTicket: 0 }, 'G3_WITHDRAWAL_INVALID_REFERENCES'],
    ['trace no UUID v4', { traceId: 'abc' }, 'G3_WITHDRAWAL_INVALID_TRACE'],
    ['RUT mal formado', { rutCliente: '12.345.678-5' }, 'G3_WITHDRAWAL_INVALID_RUT'],
    ['sin dirección de retiro', { direccionRetiro: '  ' }, 'G3_WITHDRAWAL_ADDRESS_REQUIRED'],
  ])('rechaza %s', (_name, over, code) => {
    expect(() => buildG3WithdrawalRequest({ ...snapshot, ...over })).toThrow(code);
  });

  it('acepta un evento de cierre aprobado y normaliza las series', () => {
    expect(parseG3WithdrawalEvent(event(), expected)).toMatchObject({ id_ot: 900, estado_ot: 'COMPLETADA', cierre_aprobado: true,
      equipos_retirados: [{ numero_serie: 'ONT-001', diagnostico: 'Causa desconocida' }] });
  });

  it('acepta un evento pendiente de aprobación como evidencia no definitiva', () => {
    expect(parseG3WithdrawalEvent(event({ estado_ot: 'PENDIENTE_APROBACION', cierre_aprobado: false }), expected).cierre_aprobado).toBe(false);
  });

  it.each([
    ['otra empresa', { id_empresa: 2 }, 'REFERENCE_MISMATCH'],
    ['otra solicitud', { id_solicitud_retiro_externa: 999 }, 'REFERENCE_MISMATCH'],
    ['request_id ajeno', { request_id: 'g8-retiro-1-999' }, 'REFERENCE_MISMATCH'],
    ['campo fuera de contrato', { estado_servicio: 'Baja' }, 'UNKNOWN_FIELD'],
    ['estado desconocido', { estado_ot: 'CERRADA' }, 'STATE_INVALID'],
    ['aprobado sin estar COMPLETADA', { estado_ot: 'EN_CURSO' }, 'APPROVAL_INVALID'],
    ['clave idempotente incoherente', { clave_idempotencia: '900:otra-fecha' }, 'KEY_INVALID'],
    ['diagnóstico fuera de la lista de G1', { equipos_retirados: [{ numero_serie: 'X1', diagnostico: 'Quemado' }] }, 'DIAGNOSIS_INVALID'],
    ['serie repetida entre retirados y faltantes', { equipos_faltantes: [{ numero_serie: 'ONT-001' }] }, 'DUPLICATED_SERIAL'],
    ['serie vacía', { equipos_retirados: [{ numero_serie: ' ' }] }, 'EQUIPMENT_INVALID'],
  ])('rechaza evento con %s', (_name, over, code) => {
    expect(() => parseG3WithdrawalEvent(event(over), expected)).toThrow(code);
  });

  it('un webhook repetido produce exactamente el mismo recibo (misma clave): no hay movimiento duplicado', () => {
    expect(parseG3WithdrawalEvent(event(), expected)).toEqual(parseG3WithdrawalEvent(structuredClone(event()), expected));
  });
});
