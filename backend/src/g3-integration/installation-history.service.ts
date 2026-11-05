import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { todayDateOnly } from '../common/date-rules';
import { isAdministrator } from '../common/roles';
import { installationMetrics } from '../companies/installation-metrics';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InstallationHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, requestedScope = 'consolidado') {
    const scope = isAdministrator(user.roles) ? requestedScope : String(user.idEmpresa ?? '');
    const consolidated = isAdministrator(user.roles) && scope === 'consolidado';
    const company = consolidated ? undefined : Number(scope);
    if (!consolidated && (!Number.isSafeInteger(company) || company! < 1)) {
      throw new BadRequestException('Empresa autorizada invalida');
    }
    const contract = { idContrato: true, idEmpresa: true, idCliente: true } as const;
    const service = { idServicio: true, idEmpresa: true, idContrato: true, idCliente: true,
      datosTecnicos: true, contrato: { select: contract } } as const;
    // Same evidence and snapshot semantics as CU47. No provider, activation or write.
    const [local, remote] = await this.prisma.$transaction([
      this.prisma.ordenTrabajo.findMany({
        where: { idEmpresa: company ?? { not: null }, tipoOt: 'Instalacion' },
        select: { idOt: true, estado: true, idEmpresa: true, idServicio: true, idCliente: true, fechaCompletada: true,
          servicio: { select: service } },
        orderBy: { idOt: 'desc' },
      }),
      this.prisma.integracionInstalacionG3.findMany({
        where: { ...(company ? { idEmpresa: company } : {}), estadoIntegracion: 'COMPLETADA',
          estadoOtG3: 'COMPLETADA', fechaCierreProcesado: { not: null } },
        select: { idIntegracion: true, requestId: true, traceId: true, fechaCierreProcesado: true,
          idEmpresa: true, idOtG3: true, idContrato: true, idServicio: true, idCliente: true,
          contrato: { select: contract }, servicio: { select: service } },
        orderBy: { idIntegracion: 'desc' },
      }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    type Group = { local: typeof local; remote: typeof remote };
    const groups = new Map<string, Group>();
    const group = (key: string) => {
      if (!groups.has(key)) groups.set(key, { local: [], remote: [] });
      return groups.get(key)!;
    };
    for (const row of remote) {
      const validOt = /^[1-9]\d*$/.test(row.idOtG3 ?? '') && Number.isSafeInteger(Number(row.idOtG3));
      group(validOt ? `${row.idEmpresa}:${row.idOtG3}` : `tracking:${row.idIntegracion}`).remote.push(row);
    }
    for (const row of local) {
      const key = `${row.idEmpresa}:${row.idOt}`;
      // A pending/cancelled legacy mirror is a reference, not another installation.
      // Standalone local work is included here only after its own confirmed closure.
      if (row.estado === 'Completada' || groups.has(key)) group(key).local.push(row);
    }
    const today = todayDateOnly();
    const items = [...groups.entries()].map(([key, rows]) => {
      const metric = installationMetrics(rows.local, rows.remote, today.slice(0, 7), today);
      const review = metric.instalacionesRequierenRevision > 0;
      const missing = metric.instalacionesSinFechaTecnica > 0;
      const g3 = rows.remote[0], legacy = rows.local[0];
      // Never expose a nested foreign-company reference or raw technical payload.
      const dates = !review && !missing ? rows.remote.flatMap(row => {
        const data = row.servicio?.datosTecnicos as Record<string, unknown> | null;
        const result = data?.resultadoInstalacion as Record<string, unknown> | null;
        return [data?.fechaCompletadaG3, result?.fecha_completada].filter((v): v is string => typeof v === 'string');
      }) : [];
      return {
        key, idEmpresa: g3?.idEmpresa ?? legacy.idEmpresa,
        fuente: g3 ? 'G3' as const : 'LEGACY_LOCAL' as const,
        idOt: g3 ? g3.idOtG3 : String(legacy.idOt),
        idContrato: review ? null : g3?.idContrato ?? legacy?.servicio?.idContrato ?? null,
        idServicio: review ? null : g3?.idServicio ?? legacy?.idServicio ?? null,
        idCliente: review ? null : g3?.idCliente ?? legacy?.idCliente ?? null,
        estado: 'COMPLETADA' as const,
        clasificacionFecha: review ? 'REQUIERE_REVISION' as const : missing ? 'PENDIENTE_FECHA_TECNICA' as const : 'FECHA_TECNICA_CONFIRMADA' as const,
        fechasTecnicasOriginales: g3 ? [...new Set(dates)] : !review && !missing && legacy?.fechaCompletada ? [legacy.fechaCompletada.toISOString()] : [],
        ordenesLocales: rows.local.map(row => row.idOt),
        solicitudesG3: rows.remote.map(row => ({ idIntegracion: row.idIntegracion, requestId: row.requestId,
          traceId: row.traceId, fechaCierreProcesado: row.fechaCierreProcesado })),
      };
    });
    return { scope: consolidated ? 'consolidado' : String(company), fuente: 'G8_PERSISTIDO' as const, items };
  }
}
