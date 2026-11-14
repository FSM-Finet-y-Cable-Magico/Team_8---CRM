import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { parseG1Reception } from './g1-reception-contract';
import { withdrawalClosure } from './g3-withdrawal-closure-contract';
import { assessWithdrawalClosure, paymentDuringWithdrawal } from './withdrawal-closure';
import { g3WithdrawalClosure } from './__fixtures__/g3-closure-8a8e5dd0';
import { g1RealReceptionComplete, g1RealReceptionDiscrepancy, g1RealReceptionPartial, g1Reception } from './__fixtures__/g1-reception';

const expected = { idEmpresa: 1, idOtG3: 930, requestId: 'g8-retiro-1-15' };

describe('contrato G1 de recepción', () => {
  it('acepta la recepción real y normaliza series', () => {
    const parsed = parseG1Reception(g1Reception({}, [{ numero_serie: ' qa-ont-ret-1 ', resultado: 'RECIBIDO_CON_DANO', estado_g1: 'En revisión',
      fecha_recepcion: '2026-11-13T15:00:00Z', id_servicio_externo: 61, detalle: 'Carcasa rota' }]), expected);
    expect(parsed).toMatchObject({ ok: true, reception: { claveEvento: 'g1-recepcion-1-930-501', estadoRecepcion: 'COMPLETA',
      equipos: [{ numeroSerie: 'QA-ONT-RET-1', resultado: 'RECIBIDO_CON_DANO', idServicioExterno: 61, detalle: 'Carcasa rota' }] } });
  });
  describe('respuestas reales de G1 2131b7f5 (consultarRecepciones)', () => {
    const real = { idEmpresa: 1, idOtG3: 990, requestId: 'g8-retiro-1-15' };
    it('COMPLETA por request_id: RECIBIDO con estado_g1 y servicio externo', () => {
      expect(parseG1Reception(g1RealReceptionComplete, real)).toMatchObject({ ok: true, reception: { claveEvento: 'g1-recepcion-1-990-12', estadoRecepcion: 'COMPLETA',
        equipos: [{ numeroSerie: 'ONT-123456', resultado: 'RECIBIDO', estadoG1: 'En revisión', idServicioExterno: 245, fechaRecepcion: new Date('2026-11-12T15:00:03.512Z') }] } });
    });
    it('PARCIAL: dañado + faltante desconocido para G1 (estado_g1 null) se acepta como evidencia informativa y no bloquea la baja aprobada', () => {
      const parsed = parseG1Reception(g1RealReceptionPartial, real);
      expect(parsed).toMatchObject({ ok: true, reception: { estadoRecepcion: 'PARCIAL', equipos: [
        { numeroSerie: 'ONT-123456', resultado: 'RECIBIDO_CON_DANO', estadoG1: 'En revisión' },
        { numeroSerie: 'RTR-999', resultado: 'NO_RECIBIDO', estadoG1: null, idServicioExterno: null, detalle: 'Equipo no recuperado: Cliente no lo entregó' }] } });
      if (!parsed.ok) throw new Error('unreachable');
      const assessment = assessWithdrawalClosure({
        evidence: { idOtG3: 990, estadoOt: 'COMPLETADA', cierreClave: 'baja:990', equiposRetirados: [{ numeroSerie: 'ONT-123456' }, { numeroSerie: 'RTR-999' }], equiposFaltantes: [] },
        idServicio: 245, activeEquipment: [],
        receptions: parsed.reception.equipos.map(item => ({ ...item, idOtG3: 990, claveEvento: parsed.reception.claveEvento, estadoRecepcion: parsed.reception.estadoRecepcion })),
      });
      // FINET 13-11-2026: G3 approved; what the warehouse received is recorded, it does not block the commercial baja.
      expect(assessment.outcome).toBe('APLICAR_BAJA');
      expect(assessment.avisos.map(item => item.code)).toEqual(expect.arrayContaining(['RECEPCION_G1_INCOMPLETA', 'EQUIPO_NO_RECIBIDO']));
    });
    it('discrepancia de G1: NO_RECIBIDO con estado conocido y detalle "codigo: detalle"', () => {
      expect(parseG1Reception(g1RealReceptionDiscrepancy, real)).toMatchObject({ ok: true, reception: { estadoRecepcion: 'NO_RECIBIDA',
        equipos: [{ resultado: 'NO_RECIBIDO', estadoG1: 'Instalado en cliente', detalle: expect.stringMatching(/^TRANSICION_INVALIDA: /) }] } });
    });
    it.each([
      ['RECIBIDO sin estado_g1', { ...g1RealReceptionComplete, equipos: [{ ...g1RealReceptionComplete.equipos[0], estado_g1: null }] }, 'G1_EQUIPOS_INVALIDOS'],
      ['RECIBIDO_CON_DANO sin estado_g1', { ...g1RealReceptionPartial, equipos: [{ ...g1RealReceptionPartial.equipos[0], estado_g1: null }] }, 'G1_EQUIPOS_INVALIDOS'],
      ['NO_RECIBIDO con estado_g1 vacío', { ...g1RealReceptionPartial, equipos: [{ ...g1RealReceptionPartial.equipos[1], estado_g1: ' ' }] }, 'G1_EQUIPOS_INVALIDOS'],
      ['clave_evento con sufijo no numérico', { ...g1RealReceptionComplete, clave_evento: 'g1-recepcion-1-990-abc' }, 'G1_CLAVE_EVENTO_INVALIDA'],
      ['clave_evento con sufijo 0', { ...g1RealReceptionComplete, clave_evento: 'g1-recepcion-1-990-0' }, 'G1_CLAVE_EVENTO_INVALIDA'],
      ['request_id null (G1 sin request en el cierre)', { ...g1RealReceptionComplete, request_id: null }, 'G1_SOLICITUD_AJENA'],
      ['tipo_ot null', { ...g1RealReceptionComplete, tipo_ot: null }, 'G1_TIPO_OT_INVALIDO'],
      ['SIN_EQUIPOS_RETIRADOS con campo extra', { ...g1RealReceptionComplete, estado_recepcion: 'SIN_EQUIPOS_RETIRADOS', equipos: [], success: true }, 'G1_CAMPOS_FUERA_DE_CONTRATO'],
    ])('sigue rechazando: %s', (_name, data, code) => {
      expect(parseG1Reception(data, real)).toMatchObject({ ok: false, code });
    });
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

describe('conciliación de la evidencia: G3 aprobado decide; G1 solo informa (FINET 13-11-2026)', () => {
  const evidence = { idOtG3: 930, estadoOt: 'COMPLETADA', cierreClave: 'baja:930', equiposRetirados: [{ numeroSerie: 'QA-1' }, { numeroSerie: 'QA-2' }], equiposFaltantes: [] };
  const row = (numeroSerie: string, over: Record<string, unknown> = {}) => ({ numeroSerie, idOtG3: 930, resultado: 'RECIBIDO', idServicioExterno: 61, estadoRecepcion: 'COMPLETA', ...over });
  const assess = (over: Record<string, unknown> = {}) => assessWithdrawalClosure({ evidence, idServicio: 61, receptions: [row('QA-1'), row('QA-2', { resultado: 'RECIBIDO_CON_DANO' })], activeEquipment: [], ...over } as never);
  const codes = (result: ReturnType<typeof assess>) => result.reasons.map(reason => reason.code);
  const notices = (result: ReturnType<typeof assess>) => result.avisos.map(item => item.code);

  it('todo conciliado (incluido un equipo dañado) permite aplicar la baja sin avisos', () => {
    expect(assess()).toEqual({ outcome: 'APLICAR_BAJA', reasons: [], avisos: [] });
  });
  it.each([
    ['sin OT', { evidence: { ...evidence, idOtG3: null } }, 'SIN_OT'],
    ['OT cerrada por el técnico, pendiente de aprobación', { evidence: { ...evidence, estadoOt: 'PENDIENTE_APROBACION' } }, 'CIERRE_NO_CONFIRMADO'],
    ['OT en curso', { evidence: { ...evidence, estadoOt: 'EN_CURSO' } }, 'CIERRE_NO_CONFIRMADO'],
    ['GET aún no consultado', { evidence: { ...evidence, estadoOt: null } }, 'CIERRE_NO_CONFIRMADO'],
    ['OT cancelada', { evidence: { ...evidence, estadoOt: 'CANCELADA' } }, 'OT_CANCELADA'],
    ['sin cierre BAJA (webhook)', { evidence: { ...evidence, cierreClave: null } }, 'SIN_CIERRE_TECNICO'],
    ['cierre de otra OT', { evidence: { ...evidence, cierreClave: 'baja:931' } }, 'SIN_CIERRE_TECNICO'],
    ['serie duplicada en el cierre', { evidence: { ...evidence, equiposRetirados: [{ numeroSerie: 'QA-1' }, { numeroSerie: 'qa-1' }] }, receptions: [row('QA-1')] }, 'SERIE_DUPLICADA'],
    ['misma serie retirada y faltante', { evidence: { ...evidence, equiposFaltantes: [{ numeroSerie: ' qa-2 ' }] } }, 'SERIE_RETIRADA_Y_FALTANTE'],
  ])('bloquea: %s', (_name, over, code) => {
    const result = assess(over);
    expect(result.outcome).toBe('BLOQUEADO');
    expect(codes(result)).toContain(code);
  });
  it.each([
    ['G3 aprobada con cero equipos recuperados', { evidence: { ...evidence, equiposRetirados: [], equiposFaltantes: [{ numeroSerie: 'QA-1' }, { numeroSerie: 'QA-2' }] }, receptions: [] }, ['SIN_EQUIPOS_RETIRADOS', 'EQUIPOS_FALTANTES']],
    ['equipos faltantes', { evidence: { ...evidence, equiposFaltantes: [{ numeroSerie: 'QA-3' }] } }, ['EQUIPOS_FALTANTES']],
    ['G1 sin recepción (pendiente o ausente)', { receptions: [] }, ['RECEPCION_G1_PENDIENTE']],
    ['G1 parcial', { receptions: [row('QA-1', { estadoRecepcion: 'PARCIAL' }), row('QA-2', { estadoRecepcion: 'PARCIAL' })] }, ['RECEPCION_G1_INCOMPLETA']],
    ['G1 NO_RECIBIDO', { receptions: [row('QA-1'), row('QA-2', { resultado: 'NO_RECIBIDO' })] }, ['EQUIPO_NO_RECIBIDO']],
    ['G1 sin una serie retirada', { receptions: [row('QA-1')] }, ['RECEPCION_G1_PENDIENTE']],
    ['G1 con serie ajena', { receptions: [row('QA-1'), row('QA-2'), row('QA-9')] }, ['SERIE_AJENA']],
    ['G1 con otro servicio', { receptions: [row('QA-1'), row('QA-2', { idServicioExterno: 62 })] }, ['RECEPCION_G1_INCONSISTENTE']],
    ['G1 con otra OT', { receptions: [row('QA-1'), row('QA-2', { idOtG3: 931 })] }, ['RECEPCION_G1_INCONSISTENTE']],
    ['equipo aún asociado al servicio en inventario', { activeEquipment: ['QA-7'] }, ['EQUIPOS_ASOCIADOS_EN_INVENTARIO']],
    ['inventario no disponible', { activeEquipment: null }, ['INVENTARIO_NO_CONSULTADO']],
  ])('no bloquea y lo registra como aviso: %s', (_name, over, expected) => {
    const result = assess(over);
    expect(result.outcome).toBe('APLICAR_BAJA');
    expect(result.reasons).toEqual([]);
    expect(notices(result)).toEqual(expect.arrayContaining(expected));
  });
  it('una inconsistencia de identidad bloquea aunque haya avisos de inventario', () => {
    const result = assess({ evidence: { ...evidence, estadoOt: 'PENDIENTE_APROBACION' }, activeEquipment: null });
    expect(result.outcome).toBe('BLOQUEADO');
    expect(notices(result)).toContain('INVENTARIO_NO_CONSULTADO');
  });
  it('pago durante el retiro: acción según la etapa, nunca baja ni reactivación automática', () => {
    expect(paymentDuringWithdrawal('EN_EJECUCION', true).accion).toBe('CONTINUAR');
    expect(paymentDuringWithdrawal('ANTES_DEL_DESPACHO', false).accion).toBe('CANCELAR_SOLICITUD');
    expect(paymentDuringWithdrawal('EN_EJECUCION', false).accion).toBe('COORDINAR_CANCELACION_CON_G3');
    expect(paymentDuringWithdrawal('DESPUES_DEL_RETIRO', false).accion).toBe('DECISION_COMERCIAL_REQUERIDA');
  });
});
