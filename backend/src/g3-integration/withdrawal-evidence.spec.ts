import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { parseG1Reception } from './g1-reception-contract';
import { withdrawalClosure } from './g3-withdrawal-closure-contract';
import { assessWithdrawalClosure, paymentDuringWithdrawal } from './withdrawal-closure';
import { g3WithdrawalClosure } from './__fixtures__/g3-closure-8a8e5dd0';
import { g1Reception } from './__fixtures__/g1-reception';

const expected = { idEmpresa: 1, idOtG3: 930, requestId: 'g8-retiro-1-15' };

describe('contrato G1 de recepción', () => {
  it('acepta la recepción real y normaliza series', () => {
    const parsed = parseG1Reception(g1Reception({}, [{ numero_serie: ' qa-ont-ret-1 ', resultado: 'RECIBIDO_CON_DANO', estado_g1: 'En revisión',
      fecha_recepcion: '2026-11-13T15:00:00Z', id_servicio_externo: 61, detalle: 'Carcasa rota' }]), expected);
    expect(parsed).toMatchObject({ ok: true, reception: { claveEvento: 'g1-recepcion-1-930-501', estadoRecepcion: 'COMPLETA',
      equipos: [{ numeroSerie: 'QA-ONT-RET-1', resultado: 'RECIBIDO_CON_DANO', idServicioExterno: 61, detalle: 'Carcasa rota' }] } });
  });
  it.each([
    ['otra empresa', g1Reception({ id_empresa: 2 }), 'G1_EMPRESA_AJENA'],
    ['otra OT', g1Reception({ id_ot_g3: 931 }), 'G1_OT_AJENA'],
    ['otra solicitud', g1Reception({ request_id: 'g8-retiro-1-16' }), 'G1_SOLICITUD_AJENA'],
    ['tipo distinto', g1Reception({ tipo_ot: 'REPARACION' }), 'G1_TIPO_OT_INVALIDO'],
    ['clave de otra OT', g1Reception({ clave_evento: 'g1-recepcion-1-999-501' }), 'G1_CLAVE_EVENTO_INVALIDA'],
    ['estado desconocido', g1Reception({ estado_recepcion: 'OK' }), 'G1_ESTADO_RECEPCION_INVALIDO'],
    ['campo fuera de contrato', g1Reception({ firma_bodega: 'x' }), 'G1_CAMPOS_FUERA_DE_CONTRATO'],
    ['serie duplicada', g1Reception({}, [1, 2].map(() => ({ numero_serie: 'QA-1', resultado: 'RECIBIDO', estado_g1: 'En bodega', fecha_recepcion: null, id_servicio_externo: 61, detalle: null }))), 'G1_SERIE_DUPLICADA'],
    ['resultado desconocido', g1Reception({}, [{ numero_serie: 'QA-1', resultado: 'OK', estado_g1: 'En bodega', fecha_recepcion: null, id_servicio_externo: 61, detalle: null }]), 'G1_RESULTADO_INVALIDO'],
    ['fecha inválida', g1Reception({}, [{ numero_serie: 'QA-1', resultado: 'RECIBIDO', estado_g1: 'En bodega', fecha_recepcion: 'ayer', id_servicio_externo: 61, detalle: null }]), 'G1_EQUIPOS_INVALIDOS'],
    ['no objeto', 'texto', 'G1_RESPUESTA_INVALIDA'],
  ])('rechaza %s', (_name, data, code) => {
    expect(parseG1Reception(data, expected)).toMatchObject({ ok: false, code });
  });
});

describe('contrato del cierre BAJA de G3', () => {
  it('acepta el payload real (clave baja:{id_ot}, sin estado_ot ni cierre_aprobado)', () => {
    const closure = withdrawalClosure(g3WithdrawalClosure());
    expect(closure).toMatchObject({ idOt: 930, idEmpresa: 1, requestId: 'g8-retiro-1-15', idSolicitudRetiro: 15, idServicio: 61, idContrato: 20,
      idCliente: 33, idTicket: 77, equiposRetirados: [{ numeroSerie: 'QA-ONT-RET-1' }], equiposFaltantes: [] });
    expect(closure.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(withdrawalClosure(g3WithdrawalClosure()).hash).toBe(closure.hash);
    expect(withdrawalClosure(g3WithdrawalClosure(1, { equipos_retirados: [] })).hash).not.toBe(closure.hash);
  });
  it.each([
    ['clave id_ot:fecha', { clave_idempotencia: '930:2026-11-13T14:00:00.000Z' }],
    ['request_id de otra empresa', { request_id: 'g8-retiro-2-15' }],
    ['solicitud distinta del request_id', { id_solicitud_retiro: 16 }],
    ['sin servicio', { id_servicio: null }],
    ['con prospecto', { id_prospecto: 10 }],
    ['con datos de reparación', { resultado: 'RESUELTO' }],
    ['con equipos instalados', { equipos_instalados: [{ numero_serie: 'QA-NEW' }] }],
    ['trace inválido', { trace_id: 'qa-trace' }],
    ['campo inventado', { estado_ot: 'COMPLETADA' }],
  ])('rechaza %s', (_name, over) => {
    expect(() => withdrawalClosure(g3WithdrawalClosure(1, over))).toThrow(BadRequestException);
  });
});

describe('conciliación de la evidencia (G3 aprobado + G1 recepción + inventario activo)', () => {
  const evidence = { idOtG3: 930, estadoOt: 'COMPLETADA', cierreClave: 'baja:930', equiposRetirados: [{ numeroSerie: 'QA-1' }, { numeroSerie: 'QA-2' }], equiposFaltantes: [] };
  const row = (numeroSerie: string, over: Record<string, unknown> = {}) => ({ numeroSerie, idOtG3: 930, resultado: 'RECIBIDO', idServicioExterno: 61, estadoRecepcion: 'COMPLETA', ...over });
  const assess = (over: Record<string, unknown> = {}) => assessWithdrawalClosure({ evidence, idServicio: 61, receptions: [row('QA-1'), row('QA-2', { resultado: 'RECIBIDO_CON_DANO' })], activeEquipment: [], ...over } as never);
  const codes = (result: ReturnType<typeof assess>) => result.reasons.map(reason => reason.code);

  it('todo conciliado (incluido un equipo dañado) permite aplicar la baja', () => {
    expect(assess()).toEqual({ outcome: 'APLICAR_BAJA', reasons: [] });
  });
  it.each([
    ['sin OT', { evidence: { ...evidence, idOtG3: null } }, 'SIN_OT'],
    ['OT pendiente de aprobación', { evidence: { ...evidence, estadoOt: 'PENDIENTE_APROBACION' } }, 'CIERRE_NO_CONFIRMADO'],
    ['GET aún no consultado', { evidence: { ...evidence, estadoOt: null } }, 'CIERRE_NO_CONFIRMADO'],
    ['OT cancelada', { evidence: { ...evidence, estadoOt: 'CANCELADA' } }, 'OT_CANCELADA'],
    ['sin cierre BAJA', { evidence: { ...evidence, cierreClave: null } }, 'SIN_CIERRE_TECNICO'],
    ['sin equipos retirados', { evidence: { ...evidence, equiposRetirados: [] }, receptions: [] }, 'SIN_EQUIPOS_RETIRADOS'],
    ['equipos faltantes', { evidence: { ...evidence, equiposFaltantes: [{ numeroSerie: 'QA-3' }] } }, 'EQUIPOS_FALTANTES'],
    ['serie duplicada en el cierre', { evidence: { ...evidence, equiposRetirados: [{ numeroSerie: 'QA-1' }, { numeroSerie: 'qa-1' }] }, receptions: [row('QA-1')] }, 'SERIE_DUPLICADA'],
    ['G1 sin recepción', { receptions: [] }, 'RECEPCION_G1_PENDIENTE'],
    ['G1 parcial', { receptions: [row('QA-1', { estadoRecepcion: 'PARCIAL' }), row('QA-2', { estadoRecepcion: 'PARCIAL' })] }, 'RECEPCION_G1_INCOMPLETA'],
    ['G1 NO_RECIBIDO', { receptions: [row('QA-1'), row('QA-2', { resultado: 'NO_RECIBIDO' })] }, 'EQUIPO_NO_RECIBIDO'],
    ['G1 sin una serie retirada', { receptions: [row('QA-1')] }, 'RECEPCION_G1_PENDIENTE'],
    ['G1 con serie ajena', { receptions: [row('QA-1'), row('QA-2'), row('QA-9')] }, 'SERIE_AJENA'],
    ['G1 con otro servicio', { receptions: [row('QA-1'), row('QA-2', { idServicioExterno: 62 })] }, 'RECEPCION_G1_INCONSISTENTE'],
    ['G1 con otra OT', { receptions: [row('QA-1'), row('QA-2', { idOtG3: 931 })] }, 'RECEPCION_G1_INCONSISTENTE'],
    ['equipo aún asociado al servicio', { activeEquipment: ['QA-7'] }, 'RETIRO_PARCIAL'],
  ])('bloquea: %s', (_name, over, code) => {
    const result = assess(over);
    expect(result.outcome).toBe('BLOQUEADO');
    expect(codes(result)).toContain(code);
  });
  it('pago durante el retiro: acción según la etapa, nunca baja ni reactivación automática', () => {
    expect(paymentDuringWithdrawal('EN_EJECUCION', true).accion).toBe('CONTINUAR');
    expect(paymentDuringWithdrawal('ANTES_DEL_DESPACHO', false).accion).toBe('CANCELAR_SOLICITUD');
    expect(paymentDuringWithdrawal('EN_EJECUCION', false).accion).toBe('COORDINAR_CANCELACION_CON_G3');
    expect(paymentDuringWithdrawal('DESPUES_DEL_RETIRO', false).accion).toBe('DECISION_COMERCIAL_REQUERIDA');
  });
});
