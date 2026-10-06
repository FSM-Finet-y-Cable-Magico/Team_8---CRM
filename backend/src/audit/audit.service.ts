import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput, transaction?: Prisma.TransactionClient) {
    // Financial operations require audit persistence in the same transaction.
    if (transaction) return transaction.logAuditoria.create({ data: {
      idUsuario: input.idUsuario ?? null, accion: input.accion, entidadAfectada: input.entidadAfectada,
      idEntidadAfectada: input.idEntidadAfectada ?? null, valorAnterior: input.valorAnterior ?? Prisma.JsonNull,
      valorNuevo: input.valorNuevo ?? Prisma.JsonNull, ipOrigen: input.ipOrigen ?? null,
    } });
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
    } catch {
      // La auditoria no debe romper la operacion principal, pero si queda visible en logs.
      // No registrar el error crudo: el driver puede incluir URL, SQL o datos sensibles.
      this.logger.error('No se pudo registrar auditoria');
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
