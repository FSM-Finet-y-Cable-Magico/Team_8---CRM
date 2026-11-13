// Closure payloads with the exact shape built by G3 `construirPayloadCierre`
// (Team-3-FSM main @ 8a8e5dd0b82e25001bddad8b98602bcb90181505, fsm/backend/src/ordenes/fan-out/payload-cierre.ts).
// Synthetic/sanitized values only: no real customers, serials or addresses.
// Since G3 e64c183 (08-11-2026) every closure carries falla_reportada/solucion_aplicada/resultado,
// and since 1194e22 (12-11-2026) equipos_faltantes and the four BAJA correlation fields, null when unused.

const shared = {
  resultado_llamada: 'CONFORME',
  potencia_optica_dbm: 0,
  resuelto_remotamente: false,
  id_tecnico: 14,
  usuario_tecnico: 'tecnico.qa',
  cliente: { rut: '11111111-1', nombre: 'Cliente QA' },
  direccion: { direccion_completa: 'Calle QA 123', comuna: 'Comuna QA' },
  categoria_falla: null,
  categoria_falla_otro: null,
  materiales: [{ id_tipo_equipo: 7, nombre: 'Cable drop QA', cantidad: 2 }],
  equipos_instalados: [] as unknown[],
  equipos_retirados: [] as unknown[],
  equipos_faltantes: [] as unknown[],
  falla_reportada: null as string | null,
  solucion_aplicada: null as string | null,
  resultado: null as string | null,
  request_id: null as string | null,
  trace_id: null as string | null,
  id_prospecto: null as number | null,
  id_contrato: null as number | null,
  id_plan: null as number | null,
  id_cliente_externo: null as number | null,
  id_servicio: null as number | null,
  id_solicitud_retiro: null as number | null,
  id_ticket_externo: null as number | null,
};

/** REPARACION as sent by G3 after 08-11-2026: repair data + a retired device with damage flag. */
export function g3RepairClosure(idEmpresa = 1) {
  const fecha = '2026-11-08T21:10:00.000Z';
  return {
    ...shared,
    clave_idempotencia: `912:${fecha}`,
    id_ot: 912,
    id_empresa: idEmpresa,
    tipo_ot: 'REPARACION',
    fecha_completada: fecha,
    resuelto_remotamente: false,
    categoria_falla: { id_categoria: 3, nombre: 'Sin servicio' },
    equipos_instalados: [{ numero_serie: 'QA-ONT-NEW-1', accion: 'INSTALADO_EN_CLIENTE', estado_g1: 'Instalado en cliente' }],
    equipos_retirados: [{ numero_serie: 'QA-ONT-OLD-1', accion: 'RETIRADO_PARA_DIAGNOSTICO', estado_g1: 'En revisión',
      con_dano: true, diagnostico: 'Daño físico visible', observacion_estado_fisico: 'Carcasa quemada' }],
    falla_reportada: 'Sin señal en ONT',
    solucion_aplicada: 'Se reemplazó la ONT',
    resultado: 'RESUELTO',
  };
}

/** INSTALACION requested by G8 (P0-c correlation), same shared fields in null. */
export function g3InstallationClosure(idEmpresa = 1, refs = { request_id: 'qa-request-1', trace_id: 'qa-trace-1', id_prospecto: 10, id_contrato: 20, id_plan: 7 }) {
  const fecha = '2026-11-10T15:00:00.000Z';
  return {
    ...shared,
    ...refs,
    clave_idempotencia: `901:${fecha}`,
    id_ot: 901,
    id_empresa: idEmpresa,
    tipo_ot: 'INSTALACION',
    fecha_completada: fecha,
    potencia_optica_dbm: -21.5,
    equipos_instalados: [{ numero_serie: 'QA-ONT-123', accion: 'INSTALADO_EN_CLIENTE', estado_g1: 'Instalado en cliente' }],
  };
}

/** BAJA approved by G3 (notified only at APROBACION): key `baja:{id_ot}`, no estado_ot/cierre_aprobado. */
export function g3WithdrawalClosure(idEmpresa = 1, overrides: Record<string, unknown> = {}) {
  return {
    ...shared,
    clave_idempotencia: 'baja:930',
    id_ot: 930,
    id_empresa: idEmpresa,
    tipo_ot: 'BAJA',
    fecha_completada: '2026-11-13T14:00:00.000Z',
    resultado_llamada: '',
    request_id: `g8-retiro-${idEmpresa}-15`,
    trace_id: '7d1f2c3a-9b8e-4c6d-a1b2-3c4d5e6f7a8b',
    id_contrato: 20,
    id_cliente_externo: 33,
    id_servicio: 61,
    id_solicitud_retiro: 15,
    id_ticket_externo: 77,
    equipos_retirados: [{ numero_serie: 'QA-ONT-RET-1', accion: 'RETIRADO_PARA_DIAGNOSTICO', estado_g1: 'En revisión' }],
    equipos_faltantes: [],
    ...overrides,
  };
}
