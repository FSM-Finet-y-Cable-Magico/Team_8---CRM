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
  rut: string | null;
  nombreCompleto: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  estadoPipeline: string | null;
  motivoPerdida: string | null;
  empresa?: Company | null;
};

export type Plan = {
  idPlan: number;
  idEmpresa: number | null;
  nombreComercial: string;
  tipoPlan: string;
  tipoCliente: string;
  velocidadMbps: number | null;
  precioMensual: string;
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
  empresa?: Company | null;
  empresas?: string[];
  contratos?: Array<{
    idContrato: number;
    idEmpresa: number | null;
    plan?: Plan | null;
  }>;
};

export type InventoryUnit = {
  idUnidad: number;
  idEmpresa: number | null;
  idTipoEquipo: number | null;
  numeroSerie: string;
  modelo: string | null;
  estado: string;
  idClienteInstalado: number | null;
  diagnosticoTecnico: string | null;
  empresa?: Company | null;
  clienteInstalado?: Customer | null;
  macAddress?: string | null;
  puertoOlt?: string | null;
  tipoEquipo?: {
    nombre: string;
    categoria: string | null;
  } | null;
};

export type TicketCategory = {
  idCategoria: number;
  nombre: string;
  slaHoras: number | null;
};

export type Ticket = {
  idTicket: number;
  idCliente: number | null;
  idCategoria: number;
  codigoSeguimiento: string | null;
  prioridad: string;
  estado: string;
  descripcion: string | null;
  cliente?: Customer | null;
  categoria?: TicketCategory | null;
};

export type WorkOrder = {
  idOt: number;
  idEmpresa: number | null;
  idCliente: number | null;
  idTicket: number | null;
  tipoOt: string;
  prioridad: string;
  estado: string;
  fechaProgramada: string | null;
  observaciones: string | null;
};

export const api = axios.create({
  baseURL: apiBaseURL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('finet_token');

  if (token) {
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
