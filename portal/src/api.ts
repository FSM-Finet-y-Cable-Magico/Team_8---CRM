import axios from 'axios';

const envApiURL = import.meta.env.VITE_API_URL?.trim();
const loopbackApiURL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;
const localHostnames = new Set(['localhost', '127.0.0.1', '::1']);

const isServedFromLocalhost = localHostnames.has(window.location.hostname);
const isLoopbackApiURL = Boolean(envApiURL && loopbackApiURL.test(envApiURL));
const apiBaseURL = envApiURL && (!isLoopbackApiURL || isServedFromLocalhost) ? envApiURL : '/api';

export type PortalCustomer = {
  idCliente: number;
  rut: string | null;
  nombreCompleto: string;
  email: string | null;
  telefono: string | null;
  estado: string;
  idEmpresa: number | null;
};

export type Plan = {
  idPlan: number;
  nombreComercial: string;
  tipoPlan: string;
  velocidadMbps: number | null;
  precioMensual: string;
};

export type CustomerService = {
  idServicio: number;
  idContrato: number | null;
  tipoServicio: string;
  estadoOperativo: string;
  observaciones: string | null;
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
  equipos?: Array<{
    idUnidad: number;
    numeroSerie: string;
    estado: string;
    modelo: string | null;
  }>;
};

export type TicketCategory = {
  idCategoria: number;
  nombre: string;
  slaHoras: number | null;
};

export type Ticket = {
  idTicket: number;
  idServicio: number | null;
  idCategoria: number;
  codigoSeguimiento: string | null;
  prioridad: string;
  estado: string;
  descripcion: string | null;
  categoria?: TicketCategory | null;
};

export type TvipCredentialSummary = {
  idContrato: number;
  plan?: Plan | null;
  credencial?: {
    idCredencialTvip: number;
    usuarioTvip: string | null;
    fechaGeneracion: string | null;
  } | null;
};

export type TvipGenerationResult = {
  usuarioTvip: string | null;
  temporaryPassword: string;
};

export const api = axios.create({
  baseURL: apiBaseURL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('finet_portal_token');
  const hasAuthorization = Boolean(config.headers?.Authorization ?? config.headers?.authorization);

  if (token && !hasAuthorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export function apiErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const responseMessage = error.response?.data?.message;

    if (Array.isArray(responseMessage)) {
      return responseMessage.join(', ');
    }

    return responseMessage ?? error.response?.data?.error ?? error.message;
  }

  return error instanceof Error ? error.message : 'Error inesperado';
}

export function normalizeRutInput(value: string) {
  return value.replace(/\./g, '').replace(/\s/g, '').toUpperCase();
}
