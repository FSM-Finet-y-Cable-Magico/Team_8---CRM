export type ControlRow = {
  rowId: string; idEmpresa: number | null; idCliente: number; rut: string | null; nombre: string; telefono: string | null; email: string | null; direccion: string | null;
  idServicio: number | null; serviciosRelacionados: number[]; estadoServicio: string | null; idContrato: number | null; numeroContrato: string | null; idPlan: number | null; plan: string | null;
  idZona: number | null; zona: string | null; tipoDocumento: string | null; idFactura: number | null; numeroDocumento: string | null; fechaEmision: string | null; fechaVencimiento: string | null;
  fechaVencimientoEfectiva: string | null; estadoDocumento: string | null; montoDocumento: number | null; totalPagado: number | null; saldoPendiente: number | null; saldoFavor: number | null;
  diasAtraso: number | null; estadoComercial: string; ultimaGestion: string | null; fechaUltimaGestion: string | null; responsableUltimaGestion: string | null; accionSugerida: string;
  convenioActivo: boolean; prorrogaActiva: boolean; diaPago: number | null; cambioFecha: string | null; fechaInstalacion: string | null; fechaCorte: string | null; estadoCorte: string | null;
  avisoRetiro: boolean; retiroPendiente: boolean; observacionRelevante: string | null; ultimoPago: string | null; formaPago: string | null; codigoTransaccion: string | null;
  valorRecibido: number | null; cargosPendientes: number;
};

export type ControlResponse = {
  items: ControlRow[];
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
  summary: { totalRows: number; totalDebt: number; overdueCount: number; agreementsCount: number; extensionsCount: number };
  filterOptions: { plans: Array<{ id: number; label: string }>; zones: Array<{ id: number; label: string }>; commercialStatuses: string[]; serviceStatuses: string[] };
};

export type ActionName = 'event' | 'lastNotice' | 'agreement' | 'extension' | 'paymentDay' | 'charge' | 'withdrawal';
export type Filters = {
  search: string; estadoComercial: string; estadoServicio: string; idPlan: string; idZona: string;
  conDeuda: string; vencido: string; conConvenio: string; conProrroga: string; conUltimoAviso: string;
  retiroPendiente: string; diasAtrasoMin: string; diasAtrasoMax: string; fechaVencimientoDesde: string;
  fechaVencimientoHasta: string; sort: string; order: string;
};
export const EMPTY_FILTERS: Filters = {
  search: '', estadoComercial: '', estadoServicio: '', idPlan: '', idZona: '', conDeuda: '', vencido: '',
  conConvenio: '', conProrroga: '', conUltimoAviso: '', retiroPendiente: '', diasAtrasoMin: '', diasAtrasoMax: '',
  fechaVencimientoDesde: '', fechaVencimientoHasta: '', sort: 'diasAtraso', order: 'desc',
};
export const currency = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 2 });
export function dateLabel(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-CL');
}
export function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const STATUS_LABELS: Record<string, string> = {
  AL_DIA: 'Al día', SALDO_PENDIENTE: 'Por vencer', DEUDA_VENCIDA: 'Deuda vencida', CON_PRORROGA: 'Con prórroga',
  CON_CONVENIO: 'Con convenio', ULTIMO_AVISO_REGISTRADO: 'Último aviso', RETIRO_PENDIENTE: 'Retiro pendiente', SIN_DATOS_FINANCIEROS: 'Sin datos financieros', SIN_FACTURAS: 'Sin facturas',
};
export const readable = (value: string | null | undefined) => value ? STATUS_LABELS[value] ?? value.replace(/_/g, ' ').toLocaleLowerCase('es-CL') : '—';
export const ACTION_LABELS: Record<ActionName, string> = {
  event: 'Registrar contacto', lastNotice: 'Registrar último aviso', agreement: 'Crear convenio', extension: 'Otorgar prórroga',
  paymentDay: 'Cambiar día de pago', charge: 'Agregar cargo', withdrawal: 'Aviso de retiro',
};
export function actionDisabledReason(action: ActionName, row: ControlRow) {
  if (['lastNotice', 'agreement', 'extension'].includes(action) && !row.idFactura) return 'Requiere una factura asociada';
  if (['lastNotice', 'agreement', 'extension'].includes(action) && !(Number(row.saldoPendiente) > 0)) return 'Requiere saldo pendiente';
  if (action === 'lastNotice' && !(Number(row.diasAtraso) > 0)) return 'Requiere deuda vencida';
  if (action === 'withdrawal' && !row.idServicio) return 'Requiere un servicio asociado';
  if (action === 'paymentDay' && !row.idContrato) return 'Requiere un contrato asociado';
  return '';
}

export function recordContext(row: ControlRow) {
  return [
    row.idContrato ? 'Contrato ' + row.numeroContrato : 'Sin contrato',
    row.idFactura ? (row.tipoDocumento ? readable(row.tipoDocumento) : 'Documento') + ' ' + row.numeroDocumento : 'Sin facturas',
  ].join(' · ');
}

export function managementRelations(row: ControlRow) {
  return { idCliente: row.idCliente, idContrato: row.idContrato ?? undefined, idServicio: row.idServicio ?? undefined, idFactura: row.idFactura ?? undefined };
}

type Column = { label: string; fields: (keyof ControlRow)[]; group: string; sort?: string };
export const COLUMNS: Record<string, Column> = {
  cliente: { label: 'Cliente', fields: ['nombre', 'rut'], group: 'Esenciales', sort: 'nombre' },
  servicio: { label: 'Servicio / documento', fields: ['plan', 'numeroContrato', 'tipoDocumento', 'numeroDocumento'], group: 'Esenciales' },
  deuda: { label: 'Saldo pendiente', fields: ['saldoPendiente'], group: 'Esenciales', sort: 'saldo' },
  estado: { label: 'Estado / atraso', fields: ['estadoComercial', 'diasAtraso'], group: 'Esenciales', sort: 'diasAtraso' },
  accion: { label: 'Próxima acción', fields: ['accionSugerida'], group: 'Esenciales' },
  contacto: { label: 'Contacto', fields: ['telefono', 'email'], group: 'Cliente y servicio' },
  direccion: { label: 'Dirección', fields: ['direccion'], group: 'Cliente y servicio' },
  zona: { label: 'Zona', fields: ['zona'], group: 'Cliente y servicio' },
  estadoServicio: { label: 'Estado del servicio', fields: ['estadoServicio'], group: 'Cliente y servicio' },
  montoDocumento: { label: 'Monto documento', fields: ['montoDocumento'], group: 'Facturación' },
  fechaEmision: { label: 'Emisión', fields: ['fechaEmision'], group: 'Facturación' },
  vencimiento: { label: 'Vencimiento', fields: ['fechaVencimientoEfectiva'], group: 'Facturación', sort: 'fechaVencimiento' },
  totalPagado: { label: 'Pagado', fields: ['totalPagado'], group: 'Facturación' },
  diaPago: { label: 'Día de pago', fields: ['diaPago'], group: 'Facturación' },
  formaPago: { label: 'Último pago', fields: ['formaPago'], group: 'Facturación' },
  codigoTransaccion: { label: 'Voucher / transacción', fields: ['codigoTransaccion'], group: 'Facturación' },
  gestion: { label: 'Última gestión', fields: ['ultimaGestion', 'fechaUltimaGestion', 'responsableUltimaGestion'], group: 'Seguimiento', sort: 'ultimaGestion' },
  convenioActivo: { label: 'Convenio', fields: ['convenioActivo'], group: 'Seguimiento' },
  prorrogaActiva: { label: 'Prórroga', fields: ['prorrogaActiva'], group: 'Seguimiento' },
  avisoRetiro: { label: 'Aviso de retiro', fields: ['avisoRetiro'], group: 'Seguimiento' },
  cargosPendientes: { label: 'Cargos por facturar', fields: ['cargosPendientes'], group: 'Seguimiento' },
};
export const ESSENTIAL = ['cliente', 'servicio', 'deuda', 'estado'];
export const OPERATIONAL = ['cliente', 'servicio', 'deuda', 'estado', 'vencimiento', 'gestion'];
export const WORK_VIEWS = {
  general: { label: 'General', description: 'Clientes, servicios y situación comercial', columns: ESSENTIAL, tab: 'summary' },
  followup: { label: 'Seguimiento', description: 'Contacto, avisos y última gestión', columns: ['cliente', 'contacto', 'estado', 'gestion', 'avisoRetiro'], tab: 'history' },
  commitments: { label: 'Compromisos', description: 'Convenios, prórrogas y fechas de pago', columns: ['cliente', 'deuda', 'convenioActivo', 'prorrogaActiva', 'vencimiento', 'diaPago'], tab: 'commitments' },
  billing: { label: 'Facturas y pagos', description: 'Documentos, saldos y pagos registrados', columns: ['cliente', 'servicio', 'montoDocumento', 'totalPagado', 'deuda', 'vencimiento'], tab: 'billing' },
} as const;
export type WorkView = keyof typeof WORK_VIEWS;
export type DetailTab = 'summary' | 'billing' | 'history' | 'commitments';
export const VIEW_ACTIONS: Record<WorkView, ActionName[]> = {
  general: ['event', 'lastNotice', 'withdrawal', 'agreement', 'extension', 'paymentDay', 'charge'],
  followup: ['event', 'lastNotice', 'withdrawal'],
  commitments: ['agreement', 'extension', 'paymentDay'],
  billing: ['charge'],
};
export function exportColumns(visible: string[]) {
  return [...new Set(visible.flatMap((key) => COLUMNS[key]?.fields ?? []))];
}

// Build once for both the preview and request, retaining the starting day across shorter months.
export function buildInstallments(amount: number, count: number, start: string) {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(count) || count < 1 || count > 60 || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  const [year, month, day] = start.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, day));
  if (first.toISOString().slice(0, 10) !== start) return [];
  // Whole-peso debts stay in whole pesos; fractional debts retain their cents.
  const scale = Number.isInteger(amount) ? 1 : 100;
  const total = Math.round(amount * scale);
  const portion = Math.floor(total / count);
  if (portion < 1) return [];
  return Array.from({ length: count }, (_, index) => {
    const lastDay = new Date(Date.UTC(year, month + index, 0)).getUTCDate();
    const due = new Date(Date.UTC(year, month - 1 + index, Math.min(day, lastDay)));
    return { numero: index + 1, monto: (index === count - 1 ? total - portion * (count - 1) : portion) / scale, fechaVencimiento: due.toISOString().slice(0, 10) };
  });
}
