import { Request } from 'express';

export type AuthUser = {
  idUsuario: number;
  idEmpresa: number | null;
  email: string | null;
  nombreCompleto: string;
  roles: string[];
};

export type AuthRequest = Request & {
  user?: AuthUser;
};
