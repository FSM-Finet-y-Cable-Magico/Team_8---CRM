import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { hasRole, isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { APPROVED_EXTENSIONS, invoiceBalance } from './invoice-balance';

const PAYMENT_SELECT = { idPago: true, monto: true, fechaPago: true, pasarela: true, codigoTransaccion: true } as const;
const INVOICE_INCLUDE = {
  pagos: { select: PAYMENT_SELECT, orderBy: { fechaPago: 'desc' } },
  prorrogasPago: APPROVED_EXTENSIONS,
  contrato: { select: { idContrato: true, idEmpresa: true, idCliente: true, estado: true, diaVencimiento: true,
    cliente: { select: { idCliente: true, idEmpresa: true, nombreCompleto: true, rut: true } },
    plan: { select: { nombreComercial: true } } } },
} satisfies Prisma.FacturaInclude;

type IntegrationInvoiceQuery = Pick<InvoiceQueryDto, 'search' | 'estado' | 'page' | 'pageSize'> & {
  rut?: string;
  idCliente?: number;
  idContrato?: number;
};

@Injectable()
export class BillingReadService {
  constructor(private readonly prisma: PrismaService) {}

  private company(user: AuthUser, scope: string) {
    if (!isAdministrator(user.roles) && !hasRole(user.roles, 'Comercial') && !hasRole(user.roles, 'Soporte')) throw new ForbiddenException('Sin permiso para consultar facturación');
    if (!isAdministrator(user.roles)) {
      if (!user.idEmpresa) throw new ForbiddenException('El usuario no tiene empresa');
      if (scope && scope !== 'consolidado' && Number(scope) !== user.idEmpresa) {
        throw new ForbiddenException('No puedes consultar facturación de otra empresa');
      }
      return user.idEmpresa;
    }
    if (!scope || scope === 'consolidado') return undefined;
    const id = Number(scope);
    if (!Number.isSafeInteger(id) || id < 1) throw new BadRequestException('Vista de empresa inválida');
    return id;
  }

  async invoices(query: InvoiceQueryDto, user: AuthUser) {
    const idEmpresa = this.company(user, query.scope);
    return this.queryInvoices(query, idEmpresa);
  }

  invoicesForCompany(query: IntegrationInvoiceQuery, idEmpresa: number) {
    if (!Number.isSafeInteger(idEmpresa) || idEmpresa < 1) throw new BadRequestException('Empresa de integracion invalida');
    return this.queryInvoices(query, idEmpresa, {
      rut: query.rut,
      idCliente: query.idCliente,
      idContrato: query.idContrato,
    });
  }

  private async queryInvoices(
    query: Pick<InvoiceQueryDto, 'search' | 'estado' | 'page' | 'pageSize'>,
    idEmpresa?: number,
    identity?: Pick<IntegrationInvoiceQuery, 'rut' | 'idCliente' | 'idContrato'>,
  ) {
    const search = query.search?.trim();
    const contractScope: Prisma.ContratoWhereInput | undefined = idEmpresa ? {
      idEmpresa,
      ...(identity?.idContrato ? { idContrato: identity.idContrato } : {}),
      cliente: { is: {
        idEmpresa,
        ...(identity?.idCliente ? { idCliente: identity.idCliente } : {}),
        ...(identity?.rut ? { rut: identity.rut } : {}),
      } },
    } : undefined;
    const where: Prisma.FacturaWhereInput = {
      ...(contractScope ? { contrato: { is: contractScope } } : {}),
      ...(query.estado ? { estado: query.estado } : {}),
      ...(search ? { OR: [
        { folioExterno: { contains: search, mode: 'insensitive' } },
        { contrato: { is: { cliente: { is: { OR: [
          { nombreCompleto: { contains: search, mode: 'insensitive' } },
          { rut: { contains: search, mode: 'insensitive' } },
        ] } } } } },
        ...(/^\d+$/.test(search) && Number(search) <= 2147483647 ? [{ idFactura: Number(search) }] : []),
      ] } : {}),
    };
    const page = query.page ?? 1, pageSize = query.pageSize ?? 20;
    const [rows, totalRows] = await this.prisma.$transaction([
      this.prisma.factura.findMany({ where, include: INVOICE_INCLUDE, orderBy: [{ fechaLimitePago: 'desc' }, { idFactura: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.factura.count({ where }),
    ]);
    return { items: rows.map(row => this.present(row)), pagination: { page, pageSize, totalRows, totalPages: Math.max(1, Math.ceil(totalRows / pageSize)) } };
  }

  async detail(idFactura: number, user: AuthUser, scope = 'consolidado') {
    const idEmpresa = this.company(user, scope);
    return this.detailForScope(idFactura, idEmpresa);
  }

  detailForCompany(idFactura: number, idEmpresa: number) {
    if (!Number.isSafeInteger(idEmpresa) || idEmpresa < 1) throw new BadRequestException('Empresa de integracion invalida');
    return this.detailForScope(idFactura, idEmpresa);
  }

  private async detailForScope(idFactura: number, idEmpresa?: number) {
    const row = await this.prisma.factura.findFirst({
      where: { idFactura, ...(idEmpresa ? { contrato: { is: { idEmpresa, cliente: { is: { idEmpresa } } } } } : {}) },
      include: INVOICE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Factura no encontrada en este alcance');
    const company = row.contrato?.idEmpresa;
    const customer = row.contrato?.idCliente;
    // Orphan/inconsistent legacy rows remain visible to admins, but expose no related domain data.
    if (!company || !customer || row.contrato?.cliente?.idEmpresa !== company) return { ...this.present(row), convenios: [], prorrogas: [], cargos: [], cambios: [], eventos: [] };
    const scopeFilter = { idEmpresa: company, idCliente: customer };
    const [convenios, prorrogas, cargos, cambios, eventos] = await Promise.all([
      this.prisma.convenioPago.findMany({ where: { ...scopeFilter, idFactura }, include: { cuotas: { orderBy: { numero: 'asc' } } }, orderBy: { idConvenio: 'desc' } }),
      this.prisma.prorrogaPago.findMany({ where: { ...scopeFilter, idFactura }, orderBy: { idProrroga: 'desc' } }),
      this.prisma.cargoAdicional.findMany({ where: { ...scopeFilter, idContrato: row.idContrato }, orderBy: { idCargo: 'desc' } }),
      this.prisma.cambioCondicionPago.findMany({ where: { ...scopeFilter, OR: [{ idFactura }, { idContrato: row.idContrato, idFactura: null }] }, orderBy: { idCambio: 'desc' } }),
      this.prisma.eventoGestionComercial.findMany({ where: { ...scopeFilter, idFactura }, orderBy: [{ fecha: 'desc' }, { idEvento: 'desc' }] }),
    ]);
    return { ...this.present(row), convenios, prorrogas, cargos, cambios, eventos };
  }

  private present(row: Prisma.FacturaGetPayload<{ include: typeof INVOICE_INCLUDE }>) {
    const { prorrogasPago: _extensions, ...invoice } = row;
    const consistent = row.contrato?.idEmpresa && row.contrato.cliente?.idEmpresa === row.contrato.idEmpresa;
    const balance = invoiceBalance(row);
    return { ...invoice, ...balance, aceptaPagos: Boolean(consistent) && balance.aceptaPagos };
  }
}
