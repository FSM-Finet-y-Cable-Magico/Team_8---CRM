import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Cliente, Empresa, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCustomerTechnicalDataDto } from './dto/update-customer-technical-data.dto';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(currentUser: AuthUser, scope = 'consolidado', query = '') {
    const idEmpresa = this.readCompanyId(currentUser, scope);
    const companyFilter = idEmpresa === undefined ? {} : { idEmpresa };
    const normalizedQuery = query.trim();
    const filters: Prisma.ClienteWhereInput[] = [this.companyScope(currentUser, scope)];

    if (normalizedQuery) {
      filters.push(this.customerSearchFilter(normalizedQuery, companyFilter));
    }

    const customers = await this.prisma.cliente.findMany({
      where: { AND: filters },
      orderBy: { fechaCreacion: 'desc' },
      take: 100,
      include: {
        empresa: true,
        contratos: {
          where: companyFilter,
          include: {
            plan: {
              include: { empresa: true },
            },
          },
          orderBy: { fechaInicio: 'desc' },
        },
        direcciones: {
          where: idEmpresa === undefined ? {} : { servicios: { some: { idEmpresa } } },
          orderBy: [{ esPrincipal: 'desc' }, { idDireccion: 'asc' }],
          take: 1,
        },
      },
    });

    return customers.map((customer) => {
      const visible = this.visibleCustomer(customer, idEmpresa);
      return {
        ...visible,
        empresas: [
          visible.empresa?.nombre,
          ...this.scopedRecords(customer.contratos, idEmpresa).map((contract) => contract.plan?.empresa?.nombre),
        ].filter((name, index, names): name is string => Boolean(name) && names.indexOf(name) === index),
      };
    });
  }

  async updateStatus(idCliente: number, dto: UpdateCustomerStatusDto, currentUser: AuthUser) {
    this.assertGlobalWrite(currentUser);
    const cliente = await this.getCustomerOrThrow(idCliente, currentUser);

    const updated = await this.prisma.cliente.update({
      where: { idCliente },
      data: { estado: dto.estado },
      include: { empresa: true },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTUALIZAR_ESTADO_CLIENTE',
      entidadAfectada: 'cliente',
      idEntidadAfectada: idCliente,
      valorAnterior: { estado: cliente.estado },
      valorNuevo: { estado: dto.estado },
    });

    return this.visibleCustomer(updated);
  }

  async updateTechnicalData(idCliente: number, dto: UpdateCustomerTechnicalDataDto, currentUser: AuthUser) {
    this.assertGlobalWrite(currentUser);
    const cliente = await this.getCustomerOrThrow(idCliente, currentUser);
    const nextTechnicalData = this.mergeTechnicalData(cliente.datosTecnicos, {
      tecnologiaPrincipal: dto.tecnologiaPrincipal?.trim() || undefined,
      nodoPrincipal: dto.nodoPrincipal?.trim() || undefined,
      cajaNapPrincipal: dto.cajaNapPrincipal?.trim() || undefined,
      numeroPoste: dto.numeroPoste?.trim() || undefined,
      ipReferencia: dto.ipReferencia?.trim() || undefined,
      observacionesTecnicas: dto.observacionesTecnicas?.trim() || undefined,
    });

    const updated = await this.prisma.cliente.update({
      where: { idCliente },
      data: { datosTecnicos: nextTechnicalData },
      include: { empresa: true },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTUALIZAR_DATOS_TECNICOS_CLIENTE',
      entidadAfectada: 'cliente',
      idEntidadAfectada: idCliente,
      valorAnterior: { datosTecnicos: cliente.datosTecnicos },
      valorNuevo: { datosTecnicos: updated.datosTecnicos },
    });

    return this.visibleCustomer(updated);
  }

  async history(idCliente: number, currentUser: AuthUser) {
    const cliente = await this.getCustomerOrThrow(idCliente, currentUser);
    const scopedCompanyId = this.readCompanyId(currentUser);
    const companyFilter = scopedCompanyId === undefined ? {} : { idEmpresa: scopedCompanyId };

    const [contratos, servicios, tickets, ordenes, equipos, solicitudes, observaciones, cambiosPlan, contratosDigitales, auditoria] = await Promise.all([
      this.prisma.contrato.findMany({
        where: { idCliente, ...companyFilter },
        orderBy: { fechaInicio: 'desc' },
        include: {
          plan: true,
          zonaPago: true,
          facturas: {
            include: { pagos: true },
            orderBy: [{ periodoAnio: 'desc' }, { periodoMes: 'desc' }],
          },
          contratosDigitales: { where: companyFilter, orderBy: { version: 'desc' }, take: 5 },
        },
      }),
      this.prisma.servicioContratado.findMany({
        where: { idCliente, ...companyFilter },
        orderBy: { fechaCreacion: 'desc' },
        include: {
          contrato: { include: { plan: true } },
          direccion: true,
          zonaPago: true,
          equipos: { where: companyFilter },
          solicitudes: { where: companyFilter, orderBy: { fechaCreacion: 'desc' }, take: 20 },
        },
      }),
      this.prisma.ticket.findMany({
        where: { idCliente, ...companyFilter },
        orderBy: { fechaCreacion: 'desc' },
      }),
      this.prisma.ordenTrabajo.findMany({
        where: { idCliente, ...companyFilter },
        orderBy: { fechaCreacion: 'desc' },
      }),
      this.prisma.unidadEquipo.findMany({
        where: { idClienteInstalado: idCliente, ...companyFilter },
        orderBy: { idUnidad: 'desc' },
      }),
      this.prisma.solicitudCliente.findMany({
        where: { idCliente, ...companyFilter },
        orderBy: { fechaCreacion: 'desc' },
        take: 100,
      }),
      this.prisma.observacionOperativa.findMany({
        where: {
          OR: [
            { tipoEntidad: 'Cliente', idEntidad: idCliente },
            { idCliente },
          ],
          ...(scopedCompanyId ? { idEmpresa: scopedCompanyId } : {}),
        },
        orderBy: { fechaCreacion: 'desc' },
        take: 100,
      }),
      this.prisma.historialCambioPlan.findMany({
        where: { idCliente, ...companyFilter },
        include: { planAnterior: true, planNuevo: true },
        orderBy: { fechaRegistro: 'desc' },
        take: 50,
      }),
      this.prisma.contratoDigital.findMany({
        where: { idCliente, ...companyFilter },
        orderBy: [{ idContrato: 'desc' }, { version: 'desc' }],
        take: 50,
      }),
      // LogAuditoria has no trustworthy company attribution. Arbitrary JSON is
      // not an authorization boundary, even when it mentions this customer.
      scopedCompanyId === undefined ? this.prisma.logAuditoria.findMany({
        where: {
          OR: [
            { entidadAfectada: 'cliente', idEntidadAfectada: idCliente },
            { valorNuevo: { path: ['idCliente'], equals: idCliente } },
          ],
        },
        orderBy: { fechaHora: 'desc' },
        take: 50,
      }) : Promise.resolve([]),
    ]);

    return {
      cliente: this.visibleCustomer(cliente, scopedCompanyId),
      contratos: this.scopedRecords(contratos, scopedCompanyId),
      servicios: this.scopedRecords(servicios, scopedCompanyId),
      tickets,
      ordenes,
      equipos,
      solicitudes,
      observaciones,
      cambiosPlan: this.scopedRecords(cambiosPlan, scopedCompanyId),
      contratosDigitales,
      auditoria: auditoria.map((row) => ({ ...row, idLog: row.idLog.toString() })),
    };
  }

  async findByRutOrContract(term: string, currentUser: AuthUser) {
    const idEmpresa = this.readCompanyId(currentUser);
    const companyFilter = idEmpresa === undefined ? {} : { idEmpresa };
    const normalizedTerm = term.trim();

    if (!normalizedTerm) {
      throw new BadRequestException('Debe informar un criterio de busqueda');
    }

    const contractId = /^\d+$/.test(normalizedTerm) ? Number(normalizedTerm) : null;
    const customerByContract = contractId && Number.isSafeInteger(contractId) && contractId <= 2147483647
      ? await this.prisma.contrato.findFirst({
          where: { idContrato: contractId, ...companyFilter },
        })
      : null;

    const cliente = customerByContract?.idCliente
      ? await this.prisma.cliente.findUnique({
          where: { idCliente: customerByContract.idCliente },
          include: { contratos: { where: companyFilter, select: { idEmpresa: true } } },
        })
      : await this.prisma.cliente.findFirst({
          where: {
            AND: [
              this.customerSearchFilter(normalizedTerm, companyFilter),
              this.companyScope(currentUser, 'consolidado'),
            ],
          },
          include: { contratos: { where: companyFilter, select: { idEmpresa: true } } },
        });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (!this.canAccessCustomer(cliente, currentUser)) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }

    return this.visibleCustomer(cliente, idEmpresa);
  }

  private async getCustomerOrThrow(idCliente: number, currentUser: AuthUser) {
    const idEmpresa = this.readCompanyId(currentUser);
    const cliente = await this.prisma.cliente.findUnique({
      where: { idCliente },
      include: {
        empresa: true,
        contratos: { where: idEmpresa === undefined ? {} : { idEmpresa }, select: { idEmpresa: true } },
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (!this.canAccessCustomer(cliente, currentUser)) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }

    return cliente;
  }

  private companyScope(currentUser: AuthUser, scope: string): Prisma.ClienteWhereInput {
    const idEmpresa = this.readCompanyId(currentUser, scope);
    return idEmpresa === undefined ? {} : this.customerCompanyFilter(idEmpresa);
  }

  private customerCompanyFilter(idEmpresa: number): Prisma.ClienteWhereInput {
    return {
      OR: [
        { idEmpresa },
        { contratos: { some: { idEmpresa } } },
      ],
    };
  }

  private customerSearchFilter(term: string, companyFilter: { idEmpresa?: number } = {}): Prisma.ClienteWhereInput {
    const normalizedRut = term.replace(/\./g, '').replace(/\s/g, '').toUpperCase();
    const normalizedPhone = term.replace(/[^\d+]/g, '');
    const contractId = /^\d+$/.test(term) ? Number(term) : null;
    const alternatives: Prisma.ClienteWhereInput[] = [
      { rut: { contains: normalizedRut, mode: 'insensitive' } },
      { nombreCompleto: { contains: term, mode: 'insensitive' } },
    ];

    if (normalizedPhone.length >= 4) {
      alternatives.push({ telefono: { contains: normalizedPhone } });
    }

    if (contractId && Number.isSafeInteger(contractId) && contractId <= 2147483647) {
      alternatives.push({ contratos: { some: { idContrato: contractId, ...companyFilter } } });
    }

    return { OR: alternatives };
  }

  private canAccessCustomer(
    customer: { idEmpresa: number | null; contratos: Array<{ idEmpresa: number | null }> },
    currentUser: AuthUser,
  ) {
    return isAdministrator(currentUser.roles) || Boolean(currentUser.idEmpresa && (
      customer.idEmpresa === currentUser.idEmpresa ||
      customer.contratos.some((contract) => contract.idEmpresa === currentUser.idEmpresa)));
  }

  private readCompanyId(currentUser: AuthUser, scope = 'consolidado'): number | undefined {
    if (isAdministrator(currentUser.roles) && (!scope || scope === 'consolidado')) return undefined;
    const idEmpresa = isAdministrator(currentUser.roles) ? Number(scope) : currentUser.idEmpresa;
    if (!idEmpresa || !Number.isInteger(idEmpresa) || idEmpresa < 1) {
      throw new BadRequestException('El usuario o la vista no tiene empresa valida');
    }
    return idEmpresa;
  }

  private assertGlobalWrite(currentUser: AuthUser) {
    if (!isAdministrator(currentUser.roles)) {
      throw new ForbiddenException('El estado y los datos tecnicos globales requieren administracion consolidada; utilice las operaciones del contrato o servicio de su empresa');
    }
  }

  private visibleCustomer<T extends Cliente & {
    empresa?: Empresa | null;
    contratos?: Array<{ idEmpresa: number | null }>;
    direcciones?: unknown[];
  }>(customer: T, idEmpresa?: number) {
    const { passwordPortalHash: password, ...safe } = customer;
    void password;
    if (idEmpresa === undefined) return safe;
    // Only shared identity and attributed relationships may cross the customer's
    // primary-company boundary. Never derive a company status from global estado.
    return {
      idCliente: customer.idCliente,
      idEmpresa: customer.idEmpresa === idEmpresa ? idEmpresa : null,
      rut: customer.rut,
      nombreCompleto: customer.nombreCompleto,
      email: customer.email,
      telefono: customer.telefono,
      estado: 'Restringido por empresa',
      origenContacto: null,
      datosTecnicos: null,
      empresa: customer.empresa?.idEmpresa === idEmpresa ? customer.empresa : null,
      contratos: this.scopedRecords(customer.contratos ?? [], idEmpresa),
      ...(customer.direcciones ? { direcciones: customer.direcciones } : {}),
    };
  }

  private scopedRecords<T>(records: T[], idEmpresa?: number): T[] {
    if (idEmpresa === undefined) return records;
    // Also protect to-one nested relations (plan, zonaPago, contrato) when
    // historical foreign keys point at a different or unattributed company.
    const project = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.flatMap((child) => {
        const projected = project(child);
        return projected === null && child !== null ? [] : [projected];
      });
      if (!value || typeof value !== 'object' || value instanceof Date || value instanceof Prisma.Decimal) return value;
      const record = value as Record<string, unknown>;
      if ('idEmpresa' in record && record.idEmpresa !== idEmpresa) return null;
      return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, project(child)]));
    };
    return project(records) as T[];
  }

  private mergeTechnicalData(current: Prisma.JsonValue | null, next: Record<string, unknown>) {
    const currentObject =
      current && typeof current === 'object' && !Array.isArray(current)
        ? (current as Record<string, unknown>)
        : {};
    const cleanNext = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined));

    return { ...currentObject, ...cleanNext } as Prisma.InputJsonObject;
  }
}
