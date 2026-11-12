import { InventoryUnit, ReceptionConfirmation, UNRECOVERED_EQUIPMENT_EXCEPTION_ENABLED, assessWithdrawalClosure, paymentDuringWithdrawal } from './withdrawal-closure';

type Receipt = NonNullable<Parameters<typeof assessWithdrawalClosure>[0]['receipt']>;
const receipt = (over: Partial<Receipt> = {}): Receipt => ({
  idOtG3: 900, estadoOt: 'COMPLETADA', cierreAprobado: true,
  equiposRetirados: [{ numeroSerie: 'ONT-001' }, { numeroSerie: 'router-002' }], equiposFaltantes: [], ...over,
});
const inventory = (over: InventoryUnit[] = []): InventoryUnit[] => [
  { numeroSerie: 'ONT-001', estado: 'En revisión' }, { numeroSerie: 'ROUTER-002', estado: 'En revisión' }, ...over,
];
const received = (over: Partial<ReceptionConfirmation> = {}): ReceptionConfirmation[] => [
  { numeroSerie: 'ONT-001', idOtG3: 900, estadoG1: 'En revisión', ...over }, { numeroSerie: 'ROUTER-002', idOtG3: 900, estadoG1: 'En bodega', ...over },
];
const assess = (over: Partial<Parameters<typeof assessWithdrawalClosure>[0]> = {}) =>
  assessWithdrawalClosure({ receipt: receipt(), inventory: inventory(), receptions: received(), ...over });
const codes = (r: ReturnType<typeof assessWithdrawalClosure>) => r.reasons.map(reason => reason.code);

describe('Cierre ordinario: G3 aprobó, G1 recibió cada equipo y G8 validó la relación', () => {
  it('OT aprobada y recepción confirmada por G1 de cada equipo permite aplicar la baja', () => {
    expect(assess()).toEqual({ outcome: 'APLICAR_BAJA', reasons: [], excepcionesAplicadas: [] });
  });

  it('un equipo recibido puede quedar «En revisión»: no necesita estar disponible', () => {
    expect(assess({ receptions: received({ estadoG1: 'En revisión' }) }).outcome).toBe('APLICAR_BAJA');
  });

  it('retirado del domicilio NO equivale a recibido: sin confirmación de G1 bloquea', () => {
    expect(codes(assess({ receptions: [] }))).toEqual(['RECEPCION_G1_PENDIENTE']);
    expect(codes(assess({ receptions: received().slice(0, 1) }))).toEqual(['RECEPCION_G1_PENDIENTE']);
  });

  it('una recepción correlacionada con otra OT o en un estado que no es de recepción es inconsistente', () => {
    expect(codes(assess({ receptions: received({ idOtG3: 901 }) }))).toEqual(['RECEPCION_G1_INCONSISTENTE']);
    expect(codes(assess({ receptions: received({ estadoG1: 'Instalado en cliente' }) }))).toEqual(['RECEPCION_G1_INCONSISTENTE']);
  });

  it('sin recibo de evidencia técnica, o sin OT aceptada, no hay baja', () => {
    expect(codes(assess({ receipt: null }))).toEqual(['SIN_EVIDENCIA_TECNICA']);
    expect(codes(assess({ receipt: receipt({ idOtG3: null }) }))).toEqual(['SIN_EVIDENCIA_TECNICA']);
  });

  it.each(['PENDIENTE', 'ASIGNADA', 'EN_CURSO', 'PENDIENTE_CLIENTE_AUSENTE'])('OT solo creada o en curso (%s) no autoriza la baja', estadoOt => {
    expect(codes(assess({ receipt: receipt({ estadoOt, cierreAprobado: false }) }))).toContain('OT_SIN_ACEPTAR');
  });

  it('cierre pendiente de aprobación, rechazado o sin aprobación registrada no es definitivo', () => {
    expect(codes(assess({ receipt: receipt({ estadoOt: 'PENDIENTE_APROBACION', cierreAprobado: false }) }))).toEqual(['CIERRE_PENDIENTE_APROBACION']);
    expect(assess({ receipt: receipt({ estadoOt: 'EN_CURSO', cierreAprobado: false }) }).reasons[0].message).toContain('rechazado');
    expect(codes(assess({ receipt: receipt({ cierreAprobado: false }) }))).toEqual(['CIERRE_NO_APROBADO']);
    expect(codes(assess({ receipt: receipt({ estadoOt: 'CANCELADA', cierreAprobado: false }) }))).toContain('OT_CANCELADA');
  });

  it('retiro parcial: un equipo del servicio sigue instalado en el cliente', () => {
    expect(codes(assess({ inventory: inventory([{ numeroSerie: 'STB-003', estado: 'Instalado en cliente' }]) }))).toEqual(['RETIRO_PARCIAL']);
  });

  it('las series se comparan sin distinguir mayúsculas ni espacios', () => {
    expect(assess({ receipt: receipt({ equiposRetirados: [{ numeroSerie: ' ont-001 ' }] }), receptions: received().slice(0, 1) }).outcome).toBe('APLICAR_BAJA');
  });

  it('un servicio sin equipos con OT aprobada no queda bloqueado por inventario', () => {
    expect(assess({ receipt: receipt({ equiposRetirados: [] }), inventory: [], receptions: [] }).outcome).toBe('APLICAR_BAJA');
  });

  it('acumula todas las razones para que el operador vea qué falta', () => {
    const result = assess({
      receipt: receipt({ estadoOt: 'PENDIENTE_APROBACION', cierreAprobado: false, equiposFaltantes: [{ numeroSerie: 'X' }] }),
      inventory: inventory([{ numeroSerie: 'STB-003', estado: 'Instalado en cliente' }]), receptions: [],
    });
    expect(codes(result)).toEqual(['CIERRE_PENDIENTE_APROBACION', 'EQUIPOS_FALTANTES', 'RETIRO_PARCIAL', 'RECEPCION_G1_PENDIENTE']);
  });
});

describe('Equipos no recuperados: excepción comercial diseñada y NO habilitada', () => {
  const missing = () => receipt({ equiposFaltantes: [{ numeroSerie: 'STB-9' }] });
  const exception = { numeroSerie: 'stb-9', decision: 'AUTORIZADA' as const, idUsuarioAutoriza: 1, motivo: 'Cliente no ubicable; decisión de jefatura comercial' };

  it('la excepción está deshabilitada por defecto', () => {
    expect(UNRECOVERED_EQUIPMENT_EXCEPTION_ENABLED).toBe(false);
  });

  it('con la excepción deshabilitada un faltante bloquea aunque exista una decisión registrada', () => {
    expect(codes(assess({ receipt: missing(), exceptions: [exception] }))).toEqual(['EQUIPOS_FALTANTES']);
  });

  it('habilitada (cuando se apruebe), una decisión explícita y trazable permite el cierre y queda informada', () => {
    const result = assess({ receipt: missing(), exceptions: [exception], exceptionsEnabled: true });
    expect(result).toEqual({ outcome: 'APLICAR_BAJA', reasons: [], excepcionesAplicadas: ['STB-9'] });
  });

  it('una decisión sin responsable, sin motivo o no autorizada no cuenta', () => {
    for (const bad of [{ ...exception, idUsuarioAutoriza: 0 }, { ...exception, motivo: '  ' }, { ...exception, decision: 'RECHAZADA' as never }]) {
      expect(codes(assess({ receipt: missing(), exceptions: [bad], exceptionsEnabled: true }))).toEqual(['EQUIPOS_FALTANTES']);
    }
  });

  it('la excepción no convierte el equipo en recuperado: los demás retirados siguen exigiendo recepción de G1', () => {
    expect(codes(assess({ receipt: missing(), exceptions: [exception], exceptionsEnabled: true, receptions: [] }))).toEqual(['RECEPCION_G1_PENDIENTE']);
  });

  it('cubre también un equipo que el inventario aún muestra instalado, sin marcarlo recuperado', () => {
    const result = assess({ receipt: missing(), exceptions: [exception], exceptionsEnabled: true, inventory: inventory([{ numeroSerie: 'STB-9', estado: 'Instalado en cliente' }]) });
    expect(result.outcome).toBe('APLICAR_BAJA');
  });
});

describe('Pago durante el retiro, por etapa', () => {
  it('con deuda vencida el retiro continúa', () => {
    for (const stage of ['ANTES_DEL_DESPACHO', 'EN_EJECUCION', 'DESPUES_DEL_RETIRO'] as const) expect(paymentDuringWithdrawal(stage, true).accion).toBe('CONTINUAR');
  });
  it('antes del despacho: cancelar la solicitud', () => {
    expect(paymentDuringWithdrawal('ANTES_DEL_DESPACHO', false).accion).toBe('CANCELAR_SOLICITUD');
  });
  it('durante la ejecución: coordinar con G3 y esperar confirmación (sin tocar su OT)', () => {
    expect(paymentDuringWithdrawal('EN_EJECUCION', false)).toMatchObject({ accion: 'COORDINAR_CANCELACION_CON_G3', message: expect.stringContaining('espera su confirmación') });
  });
  it('después del retiro físico: sin reactivación automática, decisión comercial autorizada', () => {
    expect(paymentDuringWithdrawal('DESPUES_DEL_RETIRO', false)).toMatchObject({ accion: 'DECISION_COMERCIAL_REQUERIDA', message: expect.stringContaining('no se reactiva automáticamente') });
  });
});
