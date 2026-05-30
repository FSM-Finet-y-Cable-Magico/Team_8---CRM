import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AuditInput = {
  idUsuario?: number | null;
  accion: string;
  entidadAfectada?: string;
  idEntidadAfectada?: number | null;
  valorAnterior?: Prisma.InputJsonValue | null;
  valorNuevo?: Prisma.InputJsonValue | null;
  ipOrigen?: string | null;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput) {
    try {
      await this.prisma.logAuditoria.create({
        data: {
          idUsuario: input.idUsuario ?? null,
          accion: input.accion,
          entidadAfectada: input.entidadAfectada,
          idEntidadAfectada: input.idEntidadAfectada ?? null,
          valorAnterior: input.valorAnterior ?? Prisma.JsonNull,
          valorNuevo: input.valorNuevo ?? Prisma.JsonNull,
          ipOrigen: input.ipOrigen ?? null,
        },
      });
    } catch (error) {
      // La auditoria no debe romper la operacion principal, pero si queda visible en logs.
      // eslint-disable-next-line no-console
      console.error('No se pudo registrar auditoria', error);
    }
  }

  async list(limit = 50) {
    const rows = await this.prisma.logAuditoria.findMany({
      orderBy: { fechaHora: 'desc' },
      take: Math.min(limit, 200),
      include: {
        usuario: {
          select: {
            nombreCompleto: true,
            email: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      ...row,
      idLog: row.idLog.toString(),
    }));
  }
}
