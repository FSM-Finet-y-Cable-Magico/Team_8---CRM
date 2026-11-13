import {
  buildWithdrawalOrderPayload, interpretWithdrawalCancelReply, interpretWithdrawalOrderRead, interpretWithdrawalOrderReply,
  parseWithdrawalRequestId, withdrawalRequestId, WithdrawalPayloadError,
} from './g3-withdrawal-contract';

const TRACE = '7d1f2c3a-9b8e-4c6d-a1b2-3c4d5e6f7a8b';
const input = (over: Partial<Parameters<typeof buildWithdrawalOrderPayload>[0]> = {}) => ({
  idEmpresa: 1, idSolicitudRetiro: 15, idCliente: 33, idContrato: 20, idServicio: 61, idTicket: 77,
  traceId: TRACE, rut: '12.345.678-5', direccion: ' Calle QA 123 ', comuna: ' Ñuñoa ', observaciones: 'Aviso previo enviado', ...over,
});
const expected = { requestId: 'g8-retiro-1-15', traceId: TRACE };

describe('contrato G3 de OT de BAJA (G3 main 8a8e5dd0)', () => {
  it('construye el payload exacto de SolicitudBajaDto con RUT canónico y comuna obligatoria', () => {
    expect(buildWithdrawalOrderPayload(input())).toEqual({
      request_id: 'g8-retiro-1-15', trace_id: TRACE, tipo_ot: 'BAJA', motivo: 'MOROSIDAD', id_empresa: 1,
      id_cliente_externo: 33, id_contrato_externo: 20, id_servicio_externo: 61, id_solicitud_retiro_externa: 15, id_ticket_externo: 77,
      rut_cliente: '12345678-5', direccion_retiro: 'Calle QA 123', comuna_retiro: 'Ñuñoa', observaciones: 'Aviso previo enviado',
    });
    expect(buildWithdrawalOrderPayload(input({ rut: '12345670-k' })).rut_cliente).toBe('12345670-K');
    expect(buildWithdrawalOrderPayload(input({ observaciones: '  ' }))).not.toHaveProperty('observaciones');
  });

  it.each([
    ['comuna vacía', { comuna: '  ' }, 'COMUNA_INVALIDA'],
    ['comuna nula', { comuna: null }, 'COMUNA_INVALIDA'],
    ['dirección vacía', { direccion: '' }, 'DIRECCION_INVALIDA'],
    ['RUT con DV inválido', { rut: '12345678-9' }, 'RUT_INVALIDO'],
    ['RUT ausente', { rut: null }, 'RUT_INVALIDO'],
    ['trace no v4', { traceId: '7d1f2c3a-9b8e-1c6d-a1b2-3c4d5e6f7a8b' }, 'TRACE_ID_INVALIDO'],
    ['ticket ausente', { idTicket: 0 }, 'ID_INVALIDO'],
  ] as const)('rechaza %s antes de enviar a G3', (_name, over, code) => {
    expect(() => buildWithdrawalOrderPayload(input(over as never))).toThrow(WithdrawalPayloadError);
    try { buildWithdrawalOrderPayload(input(over as never)); } catch (error) { expect((error as WithdrawalPayloadError).code).toBe(code); }
  });

  it('request_id determinista y su lectura inversa', () => {
    expect(withdrawalRequestId(2, 15)).toBe('g8-retiro-2-15');
    expect(parseWithdrawalRequestId('g8-retiro-2-15')).toEqual({ idEmpresa: 2, idSolicitudRetiro: 15 });
    expect(parseWithdrawalRequestId('g8-retiro-2-abc')).toBeNull();
  });

  describe('respuesta de POST /ordenes-baja', () => {
    const created = { success: true, data: { request_id: 'g8-retiro-1-15', trace_id: TRACE, id_ot: 930, tipo_ot: 'BAJA', estado: 'PENDIENTE', fecha_creacion: '2026-11-13T12:00:00Z' } };
    it('201 nueva OT', () => {
      expect(interpretWithdrawalOrderReply({ status: 201, body: created }, expected)).toEqual({ kind: 'ACEPTADA', idOt: 930, estado: 'PENDIENTE', duplicado: false });
    });
    it('200 replay idempotente sin trace_id ni fecha', () => {
      const replay = { success: true, data: { request_id: 'g8-retiro-1-15', id_ot: 930, estado: 'ASIGNADA', duplicado: true } };
      expect(interpretWithdrawalOrderReply({ status: 200, body: replay }, expected)).toEqual({ kind: 'ACEPTADA', idOt: 930, estado: 'ASIGNADA', duplicado: true });
    });
    it.each([
      ['otro request_id', { status: 201, body: { ...created, data: { ...created.data, request_id: 'g8-retiro-1-16' } } }, 'G3_CORRELACION_INVALIDA'],
      ['otro trace_id', { status: 201, body: { ...created, data: { ...created.data, trace_id: '11111111-1111-4111-8111-111111111111' } } }, 'G3_CORRELACION_INVALIDA'],
      ['sin envoltura', { status: 201, body: created.data }, 'G3_RESPUESTA_INVALIDA'],
      ['sin id_ot', { status: 200, body: { success: true, data: { request_id: 'g8-retiro-1-15', id_ot: null, duplicado: true } } }, 'G3_OT_NO_INFORMADA'],
      ['200 sin duplicado', { status: 200, body: { success: true, data: { request_id: 'g8-retiro-1-15', id_ot: 930 } } }, 'G3_RESPUESTA_INVALIDA'],
      ['tipo distinto de BAJA', { status: 201, body: { ...created, data: { ...created.data, tipo_ot: 'INSTALACION' } } }, 'G3_TIPO_OT_INVALIDO'],
    ])('2xx inconsistente (%s) no se acepta como éxito', (_name, reply, code) => {
      expect(interpretWithdrawalOrderReply(reply, expected)).toMatchObject({ kind: 'INCONSISTENTE', code });
    });
    it.each([
      [409, 'REQUEST_ID_CON_OTRO_CONTENIDO'], [409, 'OT_BAJA_ACTIVA'], [404, 'CLIENTE_NO_ENCONTRADO'],
      [422, 'DIRECCION_INVALIDA'], [403, 'EMPRESA_NO_CORRESPONDE'], [400, 'REQUEST_ID_INCONSISTENTE'],
    ])('%s %s es rechazo de negocio sin reintento', (status, codigo) => {
      expect(interpretWithdrawalOrderReply({ status, body: { codigo, message: 'x' } }, expected)).toMatchObject({ kind: 'RECHAZADA', status, code: codigo });
    });
    it('401 es error de configuración, no se reintenta', () => {
      expect(interpretWithdrawalOrderReply({ status: 401, body: {} }, expected)).toMatchObject({ kind: 'RECHAZADA', code: 'G3_AUTENTICACION' });
    });
    it.each([[null], [500], [502], [503], [429], [408]])('%s es reintentable con el mismo snapshot', status => {
      expect(interpretWithdrawalOrderReply({ status, body: null }, expected).kind).toBe('REINTENTABLE');
    });
    it('código de error dentro de message (forma Nest) también se reconoce', () => {
      expect(interpretWithdrawalOrderReply({ status: 409, body: { message: { codigo: 'OT_BAJA_ACTIVA' } } }, expected)).toMatchObject({ code: 'OT_BAJA_ACTIVA' });
    });
  });

  describe('cancelación', () => {
    it('200 cancelada y doble cancelación idempotente', () => {
      expect(interpretWithdrawalCancelReply({ status: 200, body: { success: true, data: { request_id: 'g8-retiro-1-15', id_ot: 930, estado: 'CANCELADA', duplicado: false } } }, 'g8-retiro-1-15'))
        .toEqual({ kind: 'CANCELADA', idOt: 930, duplicado: false });
      expect(interpretWithdrawalCancelReply({ status: 200, body: { success: true, data: { request_id: 'g8-retiro-1-15', id_ot: 930, estado: 'CANCELADA', duplicado: true } } }, 'g8-retiro-1-15'))
        .toMatchObject({ kind: 'CANCELADA', duplicado: true });
    });
    it('409 tardía (PENDIENTE_APROBACION/COMPLETADA) no simula que el retiro no ocurrió', () => {
      expect(interpretWithdrawalCancelReply({ status: 409, body: { codigo: 'CANCELACION_NO_APLICABLE' } }, 'g8-retiro-1-15')).toMatchObject({ kind: 'NO_APLICABLE' });
    });
    it('respuesta de otra solicitud se rechaza', () => {
      expect(interpretWithdrawalCancelReply({ status: 200, body: { success: true, data: { request_id: 'g8-retiro-1-99', estado: 'CANCELADA' } } }, 'g8-retiro-1-15').kind).toBe('RECHAZADA');
    });
    it('5xx reintentable', () => {
      expect(interpretWithdrawalCancelReply({ status: 503, body: null }, 'g8-retiro-1-15').kind).toBe('REINTENTABLE');
    });
  });

  describe('GET de OT', () => {
    const order = (over: Record<string, unknown> = {}) => ({ status: 200, body: { success: true, data: {
      id_ot: 930, id_empresa: 1, tipo_ot: 'BAJA', estado: 'COMPLETADA', fecha_completada: '2026-11-13T14:00:00Z', origen_integracion: null, ...over } } });
    it('acredita COMPLETADA sin exigir origen_integracion (null en BAJA)', () => {
      expect(interpretWithdrawalOrderRead(order(), { idOt: 930, idEmpresa: 1 })).toEqual({ kind: 'LEIDA', estado: 'COMPLETADA', fechaCompletada: '2026-11-13T14:00:00Z' });
      expect(interpretWithdrawalOrderRead(order({ origen_integracion: undefined }), { idOt: 930, idEmpresa: 1 }).kind).toBe('LEIDA');
    });
    it.each([
      ['otra empresa', { id_empresa: 2 }], ['otra OT', { id_ot: 931 }], ['tipo instalación', { tipo_ot: 'INSTALACION' }],
      ['estado desconocido', { estado: 'APROBADA' }], ['origen de instalación', { origen_integracion: { request_id: 'qa' } }],
    ])('inconsistente: %s', (_name, over) => {
      expect(interpretWithdrawalOrderRead(order(over), { idOt: 930, idEmpresa: 1 }).kind).toBe('INCONSISTENTE');
    });
    it('404/5xx/red no acreditan nada', () => {
      for (const status of [404, 500, null]) expect(interpretWithdrawalOrderRead({ status, body: null }, { idOt: 930, idEmpresa: 1 }).kind).toBe('NO_DISPONIBLE');
    });
  });
});
