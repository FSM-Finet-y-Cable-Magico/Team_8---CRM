import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { parseDateOnly, todayDateOnly } from '../common/date-rules';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.empresa.findMany({
      orderBy: { idEmpresa: 'asc' },
    });
  }

  async summary(currentUser: AuthUser, scope = 'consolidado') {
    const effectiveScope = this.resolveScope(currentUser, scope);
    const customerFilter = this.buildCustomerCompanyFilter(effectiveScope);
    const companyFilter = this.buildCompanyFilter(effectiveScope);
    const companiesFilter = 'idEmpresa' in companyFilter ? companyFilter : {};
    const today = todayDateOnly();
    const monthStart = parseDateOnly(`${today.slice(0, 8)}01`);
    const todayDate = parseDateOnly(today);

    if (!monthStart || !todayDate) {
      throw new BadRequestException('No se pudo calcular el periodo operativo');
    }

    const [
      clientes,
      prospectos,
      empresas,
      instalacionesPendientes,
      ticketsAbiertos,
      clientesMorosos,
      inventarioDisponible,
      serviciosActivos,
      instalacionesMensuales,
      ticketsCerradosMensuales,
      churnBajasMensuales,
      clientesActivos,
      ticketsCerrados,
      activeContracts,
      solicitudesAbiertas,
      solicitudesNoFactibles,
      cambiosPlanRecientes,
      origenCaptacion,
    ] = await Promise.all([
      this.prisma.cliente.count({ where: customerFilter }),
      this.prisma.prospecto.count({ where: companyFilter }),
      this.prisma.empresa.findMany({ where: companiesFilter, orderBy: { idEmpresa: 'asc' } }),
      this.prisma.ordenTrabajo.count({
        where: {
          ...companyFilter,
          tipoOt: 'Instalacion',
          estado: { notIn: ['Completada', 'Cerrada', 'Cancelada'] },
        },
      }),
      this.prisma.ticket.count({
        where: { ...companyFilter, estado: { notIn: ['Resuelto', 'Cerrado'] } },
      }),
      this.prisma.cliente.count({
        where: {
          AND: [
            customerFilter,
            { estado: { in: ['Moroso', 'Suspendido'] } },
          ],
        },
      }),
      this.prisma.unidadEquipo.count({ where: { ...companyFilter, estado: 'Disponible' } }),
      this.prisma.servicioContratado.count({ where: { ...companyFilter, estadoOperativo: 'Activo' } }),
      this.prisma.ordenTrabajo.count({
        where: {
          ...companyFilter,
          tipoOt: 'Instalacion',
          estado: 'Completada',
          fechaCompletada: { gte: monthStart },
        },
      }),
      this.prisma.ticket.count({
        where: {
          ...companyFilter,
          estado: { in: ['Resuelto', 'Cerrado'] },
          fechaCierre: { gte: monthStart },
        },
      }),
      this.prisma.contrato.count({
        where: {
          ...companyFilter,
          estado: { in: ['Baja', 'Suspendido'] },
          fechaSuspension: { gte: monthStart },
        },
      }),
      this.prisma.cliente.count({
        where: {
          AND: [
            customerFilter,
            { estado: 'Activo' },
          ],
        },
      }),
      this.prisma.ticket.findMany({
        where: {
          ...companyFilter,
          estado: { in: ['Resuelto', 'Cerrado'] },
          fechaCierre: { gte: monthStart },
        },
        select: { idCategoria: true },
      }),
      this.prisma.contrato.findMany({
        where: {
          ...companyFilter,
          estado: { in: ['Activo', 'Moroso', 'Suspendido'] },
        },
        include: {
          cliente: true,
          plan: true,
          facturas: {
            where: { estado: { notIn: ['Pagada', 'Anulada'] } },
            include: { pagos: true },
            orderBy: { fechaLimitePago: 'asc' },
          },
        },
        take: 200,
      }),
      this.prisma.solicitudCliente.count({
        where: {
          ...companyFilter,
          estado: { notIn: ['Cerrada', 'Cancelada', 'No Factible'] },
        },
      }),
      this.prisma.solicitudCliente.count({
        where: {
          ...companyFilter,
          OR: [
            { estado: 'No Factible' },
            { factible: false },
          ],
        },
      }),
      this.prisma.historialCambioPlan.findMany({
        where: companyFilter,
        include: {
          cliente: true,
          planAnterior: true,
          planNuevo: true,
        },
        orderBy: { fechaRegistro: 'desc' },
        take: 8,
      }),
      this.prisma.cliente.groupBy({
        by: ['origenContacto'],
        where: customerFilter,
        _count: { _all: true },
        orderBy: { _count: { origenContacto: 'desc' } },
        take: 8,
      }),
    ]);
    const categoryCounts = ticketsCerrados.reduce<Record<number, number>>((accumulator, ticket) => {
      accumulator[ticket.idCategoria] = (accumulator[ticket.idCategoria] ?? 0) + 1;
      return accumulator;
    }, {});
    const categories = Object.keys(categoryCounts).length
      ? await this.prisma.categoriaFalla.findMany({
          where: { idCategoria: { in: Object.keys(categoryCounts).map(Number) } },
        })
      : [];
    const categoryById = new Map(categories.map((category) => [category.idCategoria, category]));
    const churnBase = clientesActivos + churnBajasMensuales;
    const contractAlerts = activeContracts
      .map((contract) => {
        const unpaidInvoice = contract.facturas.find((invoice) => {
          const invoiceAmount = Number(invoice.monto ?? 0);
          const paidAmount = invoice.pagos.reduce((total, payment) => total + Number(payment.monto), 0);

          return invoiceAmount <= 0 || paidAmount < invoiceAmount;
        });
        const dueDate = unpaidInvoice?.fechaLimitePago ?? this.nextDueDate(todayDate, contract.diaVencimiento);
        const daysUntilDue = Math.ceil((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

        return {
          idContrato: contract.idContrato,
          idCliente: contract.idCliente,
          cliente: contract.cliente?.nombreCompleto ?? 'Cliente sin nombre',
          rut: contract.cliente?.rut ?? null,
          plan: contract.plan?.nombreComercial ?? null,
          estado: contract.estado,
          fechaVencimiento: dueDate.toISOString().slice(0, 10),
          diasRestantes: daysUntilDue,
        };
      })
      .filter((item) => item.diasRestantes <= 7);
    const alertasVencimiento = [
      ...contractAlerts
        .filter((item) => item.diasRestantes < 0)
        .sort((a, b) => a.diasRestantes - b.diasRestantes)
        .slice(0, 50),
      ...contractAlerts
        .filter((item) => item.diasRestantes >= 0)
        .sort((a, b) => a.diasRestantes - b.diasRestantes)
        .slice(0, 50),
    ];

    return {
      scope: effectiveScope,
      empresas,
      metricas: {
        clientes,
        prospectos,
        instalacionesPendientes,
        ticketsAbiertos,
        clientesMorosos,
        inventarioDisponible,
        serviciosActivos,
        instalacionesMensuales,
        ticketsCerradosMensuales,
        churnRateMensual: churnBase ? Number(((churnBajasMensuales / churnBase) * 100).toFixed(2)) : 0,
        churnBajasMensuales,
        solicitudesAbiertas,
        solicitudesNoFactibles,
      },
      cambiosPlanRecientes: cambiosPlanRecientes.map((change) => ({
        idCambioPlan: change.idCambioPlan,
        idContrato: change.idContrato,
        cliente: change.cliente?.nombreCompleto ?? 'Cliente sin nombre',
        planAnterior: change.planAnterior?.nombreComercial ?? null,
        planNuevo: change.planNuevo.nombreComercial,
        fechaRegistro: change.fechaRegistro,
      })),
      origenCaptacion: origenCaptacion.map((row) => ({
        origen: row.origenContacto ?? 'Sin origen',
        total: row._count._all,
      })),
      ticketsCerradosPorTipo: Object.entries(categoryCounts).map(([idCategoria, total]) => ({
        idCategoria: Number(idCategoria),
        categoria: categoryById.get(Number(idCategoria))?.nombre ?? `Categoria ${idCategoria}`,
        total,
      })),
      alertasVencimiento,
    };
  }

  private resolveScope(currentUser: AuthUser, requestedScope: string) {
    if (isAdministrator(currentUser.roles)) {
      return requestedScope;
    }

    if (!currentUser.idEmpresa) {
      throw new BadRequestException('El usuario no tiene empresa asociada');
    }

    return String(currentUser.idEmpresa);
  }

  private buildCompanyFilter(scope: string) {
    if (!scope || scope === 'consolidado') {
      return {};
    }

    const idEmpresa = Number(scope);

    if (!Number.isInteger(idEmpresa) || idEmpresa < 1) {
      throw new BadRequestException('Vista de empresa invalida');
    }

    return { idEmpresa };
  }

  private buildCustomerCompanyFilter(scope: string) {
    const companyFilter = this.buildCompanyFilter(scope);

    if (!('idEmpresa' in companyFilter)) {
      return {};
    }

    return {
      OR: [
        { idEmpresa: companyFilter.idEmpresa },
        { contratos: { some: { idEmpresa: companyFilter.idEmpresa } } },
      ],
    };
  }

  private nextDueDate(reference: Date, dueDay: number) {
    const safeDay = Math.min(Math.max(dueDay, 1), 28);
    const candidate = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), safeDay));

    if (candidate < reference) {
      candidate.setUTCMonth(candidate.getUTCMonth() + 1);
    }

    return candidate;
  }
}
