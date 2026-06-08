import axios from 'axios';

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
  idCliente: number | null;
  idTicket: number | null;
  tipoOt: string;
  prioridad: string;
  estado: string;
  fechaProgramada: string | null;
  observaciones: string | null;
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
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
