import { Request } from 'express';

export type AuthUser = {
  idUsuario: number;
  idEmpresa: number | null;
  email: string | null;
  nombreCompleto: string;
  roles: string[];
  versionSesion?: number;
};

export type AuthRequest = Request & {
  user?: AuthUser;
};
