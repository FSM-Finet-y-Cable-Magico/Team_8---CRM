import axios from 'axios';

const envApiURL = import.meta.env.VITE_API_URL?.trim();
const loopbackApiURL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;
const localHostnames = new Set(['localhost', '127.0.0.1', '::1']);

const isServedFromLocalhost = localHostnames.has(window.location.hostname);
const isLoopbackApiURL = Boolean(envApiURL && loopbackApiURL.test(envApiURL));
const apiBaseURL = envApiURL && (!isLoopbackApiURL || isServedFromLocalhost) ? envApiURL : '/api';

export type AuthUser = {
  idUsuario: number;
  idEmpresa: number | null;
  email: string | null;
  nombreCompleto: string;
  roles: string[];
};

export type Company = {
  idEmpresa: number;
  nombre: string;
};

export type Role = {
  idRol: number;
  nombreRol: string;
};

export type UserRow = {
  idUsuario: number;
  nombreCompleto: string;
  email: string | null;
  activo: boolean | null;
  empresa: string | null;
  roles: Role[];
};

export type Prospect = {
  idProspecto: number;
  idCliente: number | null;
  rut: string | null;
  nombreCompleto: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  estadoPipeline: string | null;
  motivoPerdida: string | null;
  origenContacto: string | null;
  empresa?: Company | null;
};

export type InstallTechnician = {
  idTecnico: number;
  nombreCompleto: string;
  email: string | null;
};

export type InstallAvailability = {
  fechaProgramada: string;
  horaVisita: string;
  tecnicosDisponibles: InstallTechnician[];
  alternativas: Array<{
    fechaProgramada: string;
    horaVisita: string;
    tecnicosDisponibles: InstallTechnician[];
  }>;
  mensaje: string;
};

export type Plan = {
  idPlan: number;
  idEmpresa: number | null;
  nombreComercial: string;
  tipoPlan: string;
  tipoCliente: string;
  velocidadMbps: number | null;
  precioMensual: string;
  descripcion?: string | null;
  activo?: boolean | null;
  empresa?: Company | null;
};

export type AuditLog = {
  idLog: string;
  accion: string;
  entidadAfectada: string | null;
  idEntidadAfectada: number | null;
  fechaHora: string | null;
  usuario?: {
    nombreCompleto: string;
    email: string | null;
  } | null;
};

export type Customer = {
  idCliente: number;
  idEmpresa: number | null;
  rut: string | null;
  nombreCompleto: string;
  email: string | null;
  telefono: string | null;
  estado: string;
  origenContacto: string | null;
  datosTecnicos: Record<string, unknown> | null;
  empresa?: Company | null;
  empresas?: string[];
  contratos?: Array<{
    idContrato: number;
    idEmpresa: number | null;
    plan?: Plan | null;
  }>;
};

export type CustomerService = {
  idServicio: number;
  idCliente: number;
  idEmpresa: number | null;
  idContrato: number | null;
  idDireccion: number | null;
  idZonaPago?: number | null;
  tipoServicio: string;
  estadoOperativo: string;
  observaciones: string | null;
  datosTecnicos: Record<string, unknown> | null;
  fechaCreacion: string;
  cliente?: Customer;
  empresa?: Company | null;
  contrato?: {
    idContrato: number;
    estado: string | null;
    plan?: Plan | null;
  } | null;
  direccion?: {
    idDireccion: number;
    direccionCompleta: string;
    comuna: string | null;
    ciudad: string | null;
  } | null;
  zonaPago?: PaymentZone | null;
  equipos?: InventoryUnit[];
  tickets?: Ticket[];
  ordenes?: WorkOrder[];
  solicitudes?: CustomerRequest[];
  auditoria?: AuditLog[];
};

export type InventoryUnit = {
  idUnidad: number;
  idEmpresa: number | null;
  idTipoEquipo: number | null;
  idServicio: number | null;
  idCajaNap?: number | null;
  modalidadAsignacion?: string | null;
  valorArriendoMensual?: string | null;
  fechaInicioAsignacion?: string | null;
  numeroSerie: string;
  numeroPoste?: string | null;
  modelo: string | null;
  estado: string;
  idClienteInstalado: number | null;
  diagnosticoTecnico: string | null;
  empresa?: Company | null;
  clienteInstalado?: Customer | null;
  macAddress?: string | null;
  puertoOlt?: string | null;
  tipoEquipo?: {
    idTipoEquipo?: number;
    nombre: string;
    categoria: string | null;
  } | null;
};

export type BillingOverview = {
  fechaCorteCalculo: string;
  reglaCorteDias: number;
  modoNotificacion: string;
  metricas: {
    clientesMorosos: number;
    facturasVencidas: number;
    clientesProgramadosCorte: number;
  };
  morosos: Array<{
    idFactura: number;
    idContrato: number;
    monto: number;
    pagado: number;
    saldo: number;
    fechaLimitePago: string;
    diasAtraso: number;
    estadoFactura: string;
    cliente: {
      idCliente: number;
      rut: string | null;
      nombreCompleto: string;
      telefono: string | null;
      email: string | null;
      estado: string;
      empresa: string | null;
    };
    contrato: {
      idContrato: number;
      estado: string;
      plan: string | null;
    };
  }>;
  cortesProgramados: BillingOverview['morosos'];
  notificaciones: Array<{
    idNotificacion: string;
    idCliente: number | null;
    idPlantilla: number | null;
    canal: string | null;
    fechaEnvio: string | null;
    estadoEnvio: string | null;
  }>;
};

export type PaymentZone = {
  idZonaPago: number;
  idEmpresa: number | null;
  nombreZona: string;
  comuna: string | null;
  descripcion: string | null;
  diaVencimientoSugerido: number | null;
  activo: boolean | null;
  empresa?: Company | null;
};

export type ZonePriceRule = {
  idPlanZonaPrecio: number;
  idPlan: number;
  idZonaPago: number;
  precioMensual: string;
  valorInstalacion: string | null;
  activo: boolean | null;
  plan?: Plan | null;
  zonaPago?: PaymentZone | null;
};

export type CustomerRequest = {
  idSolicitud: number;
  idCliente: number | null;
  idProspecto: number | null;
  idServicio: number | null;
  idEmpresa: number | null;
  tipoSolicitud: string;
  canalOrigen: string | null;
  estado: string;
  factible: boolean | null;
  motivoNoFactible: string | null;
  descripcion: string | null;
  observaciones: string | null;
  fechaCreacion: string | null;
  fechaCierre: string | null;
  cliente?: Customer | null;
  servicio?: CustomerService | null;
};

export type OperationalObservation = {
  idObservacion: number;
  tipoEntidad: string;
  idEntidad: number;
  idCliente: number | null;
  idEmpresa: number | null;
  idUsuario: number | null;
  observacion: string;
  visibilidad: string | null;
  fechaCreacion: string | null;
  usuario?: {
    idUsuario: number;
    nombreCompleto: string;
    email: string | null;
  } | null;
};

export type DigitalContract = {
  idContratoDigital: number;
  idContrato: number;
  idCliente: number | null;
  idEmpresa: number | null;
  urlDocumento: string;
  hashDocumento: string;
  estadoFirma: string;
  fechaGeneracion: string | null;
  fechaFirma: string | null;
  version: number;
};

export type AdvancedInventory = {
  consumibles: Array<{
    idStock: number;
    idTipoEquipo: number | null;
    idBodega: number | null;
    cantidadDisponible: number;
    umbralMinimo: number | null;
    tipoEquipo?: {
      idTipoEquipo: number;
      nombre: string;
      categoria: string | null;
    } | null;
    bodega?: {
      idBodega: number;
      nombre: string;
      idEmpresa: number | null;
    } | null;
  }>;
  alertasStock: AdvancedInventory['consumibles'];
  cajasNap: Array<{
    idCajaNap: number;
    idEmpresa: number | null;
    identificadorUnico: string | null;
    numeroPoste: string | null;
    zona: string | null;
    capacidadPuertos: number | null;
  }>;
  transferencias: Array<{
    idTransferencia: number;
    idEmpresaOrigen: number | null;
    idEmpresaDestino: number | null;
    fechaTransferencia: string | null;
    observaciones: string | null;
  }>;
  usoMateriales: Array<{
    idUso: number;
    idOt: number | null;
    idTipoEquipo: number | null;
    cantidad: number;
    tipoEquipo?: {
      nombre: string;
      categoria: string | null;
    } | null;
  }>;
  evidencias: Array<{
    idFoto: number;
    idOt: number | null;
    urlCloudinary: string;
    formato: string | null;
    tamanoKb: number | null;
    fechaSubida: string | null;
  }>;
  mantenciones: Array<{
    idHistorial: string;
    idUnidad: number | null;
    motivo: string | null;
    fechaHora: string | null;
    unidad?: {
      numeroSerie: string;
    } | null;
  }>;
};
export type TechnicalNote = {
  metadata: string;
  texto: string;
};

export type TvipCredentialSummary = {
  idContrato: number;
  estadoContrato: string;
  plan: {
    idPlan: number;
    nombreComercial: string;
    tipoPlan: string;
  } | null;
  incluyeTv: boolean;
  credencial: {
    idCredencial: number;
    usuarioTvip: string | null;
    fechaGeneracion: string | null;
  } | null;
  puedeGenerar: boolean;
};

export type TvipGenerationResult = {
  idCredencial: number;
  idContrato: number | null;
  usuarioTvip: string | null;
  fechaGeneracion: string | null;
  temporaryPassword: string;
  aviso: string;
};

export type MonitoringStatus = {
  estadoConexion: string;
  mensaje: string;
  latenciaMs: number | null;
  latenciaEstado: string;
  fuente: string;
  ventanaDatoRecienteHoras: number;
  ultimaMedicion: {
    idMonitoreo: string;
    idUnidad: number | null;
    idCliente: number | null;
    idCajaNap: number | null;
    potenciaActualDbm: number | null;
    timestampMedicion: string | null;
    estadoConexion: string | null;
  } | null;
  equipo: {
    idUnidad: number;
    numeroSerie: string;
    modelo: string | null;
    estado: string;
  } | null;
  cajaNap: {
    idCajaNap: number;
    identificadorUnico: string | null;
    zona: string | null;
    numeroPoste: string | null;
  } | null;
  historial: Array<{
    idHistorialOnt: string;
    idUnidad: number | null;
    evento: string | null;
    timestamp: string | null;
  }>;
};

export type PortalCustomer = {
  idCliente: number;
  rut: string | null;
  nombreCompleto: string;
  email: string | null;
  telefono: string | null;
  estado: string;
  idEmpresa: number | null;
};
export type TicketCategory = {
  idCategoria: number;
  nombre: string;
  slaHoras: number | null;
};

export type Ticket = {
  idTicket: number;
  idCliente: number | null;
  idServicio: number | null;
  idCajaNap?: number | null;
  idCategoria: number;
  codigoSeguimiento: string | null;
  prioridad: string;
  estado: string;
  descripcion: string | null;
  cliente?: Customer | null;
  categoria?: TicketCategory | null;
  workOrders?: WorkOrder[];
  hasOpenWorkOrder?: boolean;
  observacionesTecnicas?: TechnicalNote[];
};

export type WorkOrder = {
  idOt: number;
  idEmpresa: number | null;
  idCliente: number | null;
  idTecnico: number | null;
  idTicket: number | null;
  idServicio: number | null;
  idCajaNap?: number | null;
  tipoOt: string;
  prioridad: string;
  estado: string;
  fechaProgramada: string | null;
  observaciones: string | null;
  tipoConexion?: 'Fibra Optica' | 'Television' | null;
  horaVisita?: string | null;
  observacionesAgenda?: string | null;
  observacionesCierre?: string | null;
  tecnico?: {
    idUsuario: number;
    nombreCompleto: string;
    email: string | null;
  } | null;
  cliente?: {
    idCliente: number;
    rut: string | null;
    nombreCompleto: string;
  } | null;
  prospecto?: {
    idProspecto: number;
    rut: string | null;
    nombreCompleto: string | null;
    fechaCreacion: string | null;
    fechaConversion: string | null;
    tiempoConversionDias: number | null;
    estadoPipeline: string | null;
  } | null;
  ticket?: {
    idTicket: number;
    idCliente: number | null;
    idServicio: number | null;
    idCategoria: number;
    codigoSeguimiento: string | null;
    prioridad: string;
    estado: string;
    descripcion: string | null;
  } | null;
};

export const api = axios.create({
  baseURL: apiBaseURL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('finet_token');
  const hasAuthorization = Boolean(config.headers?.Authorization ?? config.headers?.authorization);

  if (token && !hasAuthorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export function apiErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const responseMessage = error.response?.data?.message;
    return Array.isArray(responseMessage) ? responseMessage.join(', ') : responseMessage ?? error.message;
  }

  return 'Error inesperado';
}
