import { InventoryUnit, assessWithdrawalClosure } from './withdrawal-closure';

type Receipt = NonNullable<Parameters<typeof assessWithdrawalClosure>[0]['receipt']>;
const receipt = (over: Partial<Receipt> = {}): Receipt => ({
  idOtG3: 900, estadoOt: 'COMPLETADA', cierreAprobado: true,
  equiposRetirados: [{ numeroSerie: 'ONT-001' }, { numeroSerie: 'router-002' }], equiposFaltantes: [], ...over,
});
const inventory = (over: InventoryUnit[] = []): InventoryUnit[] => [
  { numeroSerie: 'ONT-001', estado: 'En revisión' }, { numeroSerie: 'ROUTER-002', estado: 'En revisión' }, ...over,
];
const codes = (r: ReturnType<typeof assessWithdrawalClosure>) => r.reasons.map(reason => reason.code);

describe('Cierre técnico de retiro: cuándo puede aplicarse la baja efectiva', () => {
  it('OT completada y aprobada, equipos retirados y confirmados por inventario permite aplicar la baja', () => {
    const result = assessWithdrawalClosure({ receipt: receipt(), inventory: inventory() });
    expect(result).toEqual({ outcome: 'APLICAR_BAJA', reasons: [] });
  });

  it('sin recibo de evidencia técnica no hay baja', () => {
    expect(codes(assessWithdrawalClosure({ receipt: null, inventory: inventory() }))).toEqual(['SIN_EVIDENCIA_TECNICA']);
  });

  it('una solicitud sin OT aceptada (sin id de orden) tampoco es evidencia', () => {
    expect(codes(assessWithdrawalClosure({ receipt: receipt({ idOtG3: null }), inventory: inventory() }))).toEqual(['SIN_EVIDENCIA_TECNICA']);
  });

  it.each(['PENDIENTE', 'ASIGNADA', 'EN_CURSO', 'PENDIENTE_CLIENTE_AUSENTE'])('OT solo creada o en curso (%s) no autoriza la baja', estadoOt => {
    const result = assessWithdrawalClosure({ receipt: receipt({ estadoOt, cierreAprobado: false }), inventory: inventory() });
    expect(result.outcome).toBe('BLOQUEADO');
    expect(codes(result)).toContain('OT_SIN_ACEPTAR');
  });

  it('cierre pendiente de aprobación no es definitivo', () => {
    const result = assessWithdrawalClosure({ receipt: receipt({ estadoOt: 'PENDIENTE_APROBACION', cierreAprobado: false }), inventory: inventory() });
    expect(codes(result)).toEqual(['CIERRE_PENDIENTE_APROBACION']);
  });

  it('cierre rechazado: la OT vuelve a EN_CURSO y no se finaliza', () => {
    const result = assessWithdrawalClosure({ receipt: receipt({ estadoOt: 'EN_CURSO', cierreAprobado: false }), inventory: inventory() });
    expect(result.outcome).toBe('BLOQUEADO');
    expect(result.reasons[0].message).toContain('rechazado');
  });

  it('OT cancelada no autoriza la baja', () => {
    expect(codes(assessWithdrawalClosure({ receipt: receipt({ estadoOt: 'CANCELADA', cierreAprobado: false }), inventory: inventory() }))).toContain('OT_CANCELADA');
  });

  it('una OT marcada COMPLETADA sin aprobación registrada sigue bloqueada', () => {
    expect(codes(assessWithdrawalClosure({ receipt: receipt({ cierreAprobado: false }), inventory: inventory() }))).toEqual(['CIERRE_NO_APROBADO']);
  });

  it('equipo no recuperado declarado por el técnico bloquea: no se asume retiro completo', () => {
    const result = assessWithdrawalClosure({ receipt: receipt({ equiposFaltantes: [{ numeroSerie: 'STB-003' }] }), inventory: inventory() });
    expect(codes(result)).toEqual(['EQUIPOS_FALTANTES']);
  });

  it('retiro parcial: un equipo del servicio sigue instalado en el cliente según el inventario', () => {
    const result = assessWithdrawalClosure({ receipt: receipt(), inventory: inventory([{ numeroSerie: 'STB-003', estado: 'Instalado en cliente' }]) });
    expect(codes(result)).toEqual(['RETIRO_PARCIAL']);
  });

  it('error de conciliación: el técnico informa un retiro que el inventario aún muestra instalado', () => {
    const result = assessWithdrawalClosure({ receipt: receipt(), inventory: [{ numeroSerie: 'ONT-001', estado: 'Instalado en cliente' }, { numeroSerie: 'ROUTER-002', estado: 'En revisión' }] });
    expect(codes(result)).toEqual(['INVENTARIO_SIN_CONFIRMAR']);
  });

  it('error de conciliación: la serie informada no existe en el inventario consultado', () => {
    const result = assessWithdrawalClosure({ receipt: receipt(), inventory: [{ numeroSerie: 'ONT-001', estado: 'En revisión' }] });
    expect(codes(result)).toEqual(['INVENTARIO_SIN_CONFIRMAR']);
  });

  it('las series se comparan sin distinguir mayúsculas ni espacios', () => {
    const result = assessWithdrawalClosure({ receipt: receipt({ equiposRetirados: [{ numeroSerie: ' ont-001 ' }] }), inventory: [{ numeroSerie: 'ONT-001', estado: 'En revisión' }] });
    expect(result.outcome).toBe('APLICAR_BAJA');
  });

  it('recepción en bodega pendiente: por defecto no bloquea (solo se exige el retiro físico)', () => {
    expect(assessWithdrawalClosure({ receipt: receipt(), inventory: inventory() }).outcome).toBe('APLICAR_BAJA');
  });

  it('con la política que exige bodega, «En revisión» bloquea y «En bodega» permite', () => {
    const policy = { requireWarehouseReception: true };
    expect(codes(assessWithdrawalClosure({ receipt: receipt(), inventory: inventory(), policy }))).toEqual(['BODEGA_PENDIENTE']);
    const inWarehouse = [{ numeroSerie: 'ONT-001', estado: 'En bodega' }, { numeroSerie: 'ROUTER-002', estado: 'En bodega' }];
    expect(assessWithdrawalClosure({ receipt: receipt(), inventory: inWarehouse, policy }).outcome).toBe('APLICAR_BAJA');
  });

  it('un servicio sin equipos y con OT aprobada no queda bloqueado por inventario', () => {
    const result = assessWithdrawalClosure({ receipt: receipt({ equiposRetirados: [] }), inventory: [] });
    expect(result.outcome).toBe('APLICAR_BAJA');
  });

  it('acumula todas las razones para que el operador vea qué falta', () => {
    const result = assessWithdrawalClosure({
      receipt: receipt({ estadoOt: 'PENDIENTE_APROBACION', cierreAprobado: false, equiposFaltantes: [{ numeroSerie: 'X' }] }),
      inventory: inventory([{ numeroSerie: 'STB-003', estado: 'Instalado en cliente' }]),
    });
    expect(codes(result)).toEqual(['CIERRE_PENDIENTE_APROBACION', 'EQUIPOS_FALTANTES', 'RETIRO_PARCIAL']);
  });
});
