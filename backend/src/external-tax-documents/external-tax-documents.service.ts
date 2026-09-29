import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { parseDateOnly } from '../common/date-rules';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExternalTaxDocumentDto, ExternalTaxDocumentQueryDto, UpdateExternalTaxDocumentDto } from './external-tax-documents.dto';

const DOCUMENT_INCLUDE = {
  empresa: { select: { idEmpresa: true, nombre: true } },
  cliente: { select: { idCliente: true, nombreCompleto: true, rut: true } },
  contrato: { select: { idContrato: true, estado: true } },
  factura: { select: { idFactura: true, tipoDocumento: true, folioExterno: true } },
  cargoAdicional: { select: { idCargo: true, tipo: true, estado: true } },
  usuarioRegistro: { select: { idUsuario: true, nombreCompleto: true } },
} as const;

type RelationIds = Pick<CreateExternalTaxDocumentDto, 'idCliente' | 'idContrato' | 'idFactura' | 'idCargoAdicional'>;
type MoneyFields = Pick<CreateExternalTaxDocumentDto, 'montoNeto' | 'montoExento' | 'iva' | 'montoTotal'>;

@Injectable()
export class ExternalTaxDocumentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async create(dto: CreateExternalTaxDocumentDto, user: AuthUser) {
    this.assertAdministrator(user);
    const idEmpresa = this.resolveWriteCompany(dto.idEmpresa, user);
    await this.assertCompanyExists(idEmpresa);
    const identity = this.identity(dto.tipoDocumento, dto.emisorProveedor, dto.folioONumero);
    const fechaEmision = this.dateOnly(dto.fechaEmision, 'fechaEmision');
    const urlDocumento = this.safeUrl(dto.urlDocumento);
    this.validateMoney(dto);
    await this.validateRelations(idEmpresa, dto);
    await this.assertNotDuplicate(idEmpresa, identity, undefined, user);

    try {
      const document = await this.prisma.documentoTributarioExterno.create({
        data: {
          idEmpresa,
          ...identity,
          fechaEmision,
          montoNeto: this.decimal(dto.montoNeto),
          montoExento: this.decimal(dto.montoExento),
          iva: this.decimal(dto.iva),
          montoTotal: this.decimal(dto.montoTotal)!,
          urlDocumento,
          referenciaExterna: this.optionalText(dto.referenciaExterna),
          estado: dto.estado ?? 'REGISTRADO',
          fuente: 'EXTERNO_MANUAL',
          idCliente: dto.idCliente,
          idContrato: dto.idContrato,
          idFactura: dto.idFactura,
          idCargoAdicional: dto.idCargoAdicional,
          idUsuarioRegistro: user.idUsuario,
        },
        include: DOCUMENT_INCLUDE,
      });
      await this.audit.record({
        idUsuario: user.idUsuario,
        accion: 'CREAR_DOCUMENTO_TRIBUTARIO_EXTERNO',
        entidadAfectada: 'documento_tributario_externo',
        idEntidadAfectada: document.idDocumento,
        valorNuevo: this.auditValue(document),
      });
      if (dto.idFactura) await this.auditLink(document.idDocumento, idEmpresa, dto.idFactura, user);
      return document;
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        await this.auditDuplicate(idEmpresa, identity, user);
        throw new ConflictException('Ya existe un documento con el mismo tipo, emisor y folio en esta empresa');
      }
      throw error;
    }
  }

  async list(query: ExternalTaxDocumentQueryDto, user: AuthUser) {
    this.assertAdministrator(user);
    const page = query.page || 1;
    const pageSize = query.pageSize || 30;
    const where = this.listWhere(query, user);
    const [items, totalRows] = await this.prisma.$transaction([
      this.prisma.documentoTributarioExterno.findMany({
        where,
        include: DOCUMENT_INCLUDE,
        orderBy: [{ fechaEmision: 'desc' }, { idDocumento: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.documentoTributarioExterno.count({ where }),
    ]);
    return { items, pagination: { page, pageSize, totalRows, totalPages: Math.max(1, Math.ceil(totalRows / pageSize)) } };
  }

  async findOne(idDocumento: number, user: AuthUser) {
    this.assertAdministrator(user);
    const document = await this.prisma.documentoTributarioExterno.findUnique({ where: { idDocumento }, include: DOCUMENT_INCLUDE });
    if (!document) throw new NotFoundException('Documento tributario externo no encontrado');
    this.assertCompanyAccess(document.idEmpresa, user);
    await this.audit.record({
      idUsuario: user.idUsuario,
      accion: 'CONSULTAR_DOCUMENTO_TRIBUTARIO_EXTERNO',
      entidadAfectada: 'documento_tributario_externo',
      idEntidadAfectada: idDocumento,
      valorNuevo: { idEmpresa: document.idEmpresa },
    });
    return document;
  }

  async update(idDocumento: number, dto: UpdateExternalTaxDocumentDto, user: AuthUser) {
    this.assertAdministrator(user);
    const current = await this.prisma.documentoTributarioExterno.findUnique({ where: { idDocumento }, include: DOCUMENT_INCLUDE });
    if (!current) throw new NotFoundException('Documento tributario externo no encontrado');
    this.assertCompanyAccess(current.idEmpresa, user);

    const values = {
      tipoDocumento: dto.tipoDocumento ?? current.tipoDocumento,
      folioONumero: dto.folioONumero ?? current.folioONumero,
      emisorProveedor: dto.emisorProveedor ?? current.emisorProveedor,
      fechaEmision: dto.fechaEmision ?? this.dateString(current.fechaEmision),
      montoNeto: dto.montoNeto === undefined ? this.numberOrUndefined(current.montoNeto) : dto.montoNeto ?? undefined,
      montoExento: dto.montoExento === undefined ? this.numberOrUndefined(current.montoExento) : dto.montoExento ?? undefined,
      iva: dto.iva === undefined ? this.numberOrUndefined(current.iva) : dto.iva ?? undefined,
      montoTotal: dto.montoTotal ?? Number(current.montoTotal),
    };
    const identity = this.identity(values.tipoDocumento, values.emisorProveedor, values.folioONumero);
    this.validateMoney(values);
    await this.assertNotDuplicate(current.idEmpresa, identity, idDocumento, user);

    const relations: RelationIds = {
      idCliente: dto.idCliente === undefined ? current.idCliente ?? undefined : dto.idCliente ?? undefined,
      idContrato: dto.idContrato === undefined ? current.idContrato ?? undefined : dto.idContrato ?? undefined,
      idFactura: dto.idFactura === undefined ? current.idFactura ?? undefined : dto.idFactura ?? undefined,
      idCargoAdicional: dto.idCargoAdicional === undefined ? current.idCargoAdicional ?? undefined : dto.idCargoAdicional ?? undefined,
    };
    await this.validateRelations(current.idEmpresa, relations);
    const urlDocumento = dto.urlDocumento === undefined ? current.urlDocumento : this.safeUrl(dto.urlDocumento ?? undefined);

    try {
      const updated = await this.prisma.documentoTributarioExterno.update({
        where: { idDocumento },
        data: {
          ...identity,
          fechaEmision: this.dateOnly(values.fechaEmision, 'fechaEmision'),
          montoNeto: this.decimal(values.montoNeto),
          montoExento: this.decimal(values.montoExento),
          iva: this.decimal(values.iva),
          montoTotal: this.decimal(values.montoTotal)!,
          urlDocumento,
          referenciaExterna: dto.referenciaExterna === undefined ? current.referenciaExterna : this.optionalText(dto.referenciaExterna ?? undefined),
          estado: dto.estado ?? current.estado,
          idCliente: dto.idCliente === undefined ? current.idCliente : dto.idCliente,
          idContrato: dto.idContrato === undefined ? current.idContrato : dto.idContrato,
          idFactura: dto.idFactura === undefined ? current.idFactura : dto.idFactura,
          idCargoAdicional: dto.idCargoAdicional === undefined ? current.idCargoAdicional : dto.idCargoAdicional,
        },
        include: DOCUMENT_INCLUDE,
      });
      await this.audit.record({
        idUsuario: user.idUsuario,
        accion: 'ACTUALIZAR_DOCUMENTO_TRIBUTARIO_EXTERNO',
        entidadAfectada: 'documento_tributario_externo',
        idEntidadAfectada: idDocumento,
        valorAnterior: this.auditValue(current),
        valorNuevo: this.auditValue(updated),
      });
      if (updated.idFactura && updated.idFactura !== current.idFactura) await this.auditLink(idDocumento, current.idEmpresa, updated.idFactura, user);
      return updated;
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        await this.auditDuplicate(current.idEmpresa, identity, user);
        throw new ConflictException('Ya existe un documento con el mismo tipo, emisor y folio en esta empresa');
      }
      throw error;
    }
  }

  async deactivate(idDocumento: number, user: AuthUser) {
    this.assertAdministrator(user);
    const current = await this.prisma.documentoTributarioExterno.findUnique({ where: { idDocumento }, include: DOCUMENT_INCLUDE });
    if (!current) throw new NotFoundException('Documento tributario externo no encontrado');
    this.assertCompanyAccess(current.idEmpresa, user);
    if (current.estado === 'ANULADO') return current;
    const updated = await this.prisma.documentoTributarioExterno.update({ where: { idDocumento }, data: { estado: 'ANULADO' }, include: DOCUMENT_INCLUDE });
    await this.audit.record({
      idUsuario: user.idUsuario,
      accion: 'DESACTIVAR_DOCUMENTO_TRIBUTARIO_EXTERNO',
      entidadAfectada: 'documento_tributario_externo',
      idEntidadAfectada: idDocumento,
      valorAnterior: { estado: current.estado },
      valorNuevo: { estado: updated.estado },
    });
    return updated;
  }

  private listWhere(query: ExternalTaxDocumentQueryDto, user: AuthUser): Prisma.DocumentoTributarioExternoWhereInput {
    const idEmpresa = this.resolveQueryCompany(query.idEmpresa, user);
    const fechaDesde = query.fechaDesde ? this.dateOnly(query.fechaDesde, 'fechaDesde') : undefined;
    const fechaHasta = query.fechaHasta ? this.dateOnly(query.fechaHasta, 'fechaHasta') : undefined;
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) throw new BadRequestException('fechaDesde no puede ser posterior a fechaHasta');
    const search = query.search?.trim();
    return {
      ...(idEmpresa ? { idEmpresa } : {}),
      ...(query.tipoDocumento ? { tipoDocumento: query.tipoDocumento } : {}),
      ...(query.folio ? { folioONumero: { contains: query.folio.trim(), mode: 'insensitive' } } : {}),
      ...(query.emisorProveedor ? { emisorProveedor: { contains: query.emisorProveedor.trim(), mode: 'insensitive' } } : {}),
      ...(query.idCliente ? { idCliente: query.idCliente } : {}),
      ...(query.idContrato ? { idContrato: query.idContrato } : {}),
      ...(query.idFactura ? { idFactura: query.idFactura } : {}),
      ...(query.idCargoAdicional ? { idCargoAdicional: query.idCargoAdicional } : {}),
      ...(query.estado ? { estado: query.estado } : {}),
      ...(fechaDesde || fechaHasta ? { fechaEmision: { gte: fechaDesde, lte: fechaHasta } } : {}),
      ...(search ? { OR: [
        { folioONumero: { contains: search, mode: 'insensitive' } },
        { emisorProveedor: { contains: search, mode: 'insensitive' } },
        { cliente: { is: { OR: [
          { nombreCompleto: { contains: search, mode: 'insensitive' } },
          { rut: { contains: search, mode: 'insensitive' } },
        ] } } },
      ] } : {}),
    };
  }

  private async validateRelations(idEmpresa: number, ids: RelationIds) {
    const [customer, contract, invoice, charge] = await Promise.all([
      ids.idCliente ? this.prisma.cliente.findUnique({ where: { idCliente: ids.idCliente }, select: { idCliente: true, idEmpresa: true } }) : null,
      ids.idContrato ? this.prisma.contrato.findUnique({ where: { idContrato: ids.idContrato }, select: { idContrato: true, idEmpresa: true, idCliente: true } }) : null,
      ids.idFactura ? this.prisma.factura.findUnique({ where: { idFactura: ids.idFactura }, select: { idFactura: true, idContrato: true, contrato: { select: { idEmpresa: true, idCliente: true } } } }) : null,
      ids.idCargoAdicional ? this.prisma.cargoAdicional.findUnique({ where: { idCargo: ids.idCargoAdicional }, select: { idCargo: true, idEmpresa: true, idCliente: true, idContrato: true } }) : null,
    ]);
    if (ids.idCliente && !customer) throw new NotFoundException('Cliente no encontrado');
    if (customer?.idEmpresa !== undefined && customer.idEmpresa !== idEmpresa) throw new BadRequestException('El cliente pertenece a otra empresa');
    if (ids.idContrato && !contract) throw new NotFoundException('Contrato no encontrado');
    if (contract && contract.idEmpresa !== idEmpresa) throw new BadRequestException('El contrato pertenece a otra empresa');
    if (contract && ids.idCliente && contract.idCliente !== ids.idCliente) throw new BadRequestException('El contrato no corresponde al cliente');
    if (ids.idFactura && !invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice && invoice.contrato?.idEmpresa !== idEmpresa) throw new BadRequestException('La factura pertenece a otra empresa o no tiene contrato válido');
    if (invoice && ids.idContrato && invoice.idContrato !== ids.idContrato) throw new BadRequestException('La factura no corresponde al contrato');
    if (invoice && ids.idCliente && invoice.contrato?.idCliente !== ids.idCliente) throw new BadRequestException('La factura no corresponde al cliente');
    if (ids.idCargoAdicional && !charge) throw new NotFoundException('Cargo adicional no encontrado');
    if (charge && charge.idEmpresa !== idEmpresa) throw new BadRequestException('El cargo adicional pertenece a otra empresa');
    if (charge && ids.idCliente && charge.idCliente !== ids.idCliente) throw new BadRequestException('El cargo adicional no corresponde al cliente');
    if (charge && ids.idContrato && charge.idContrato !== ids.idContrato) throw new BadRequestException('El cargo adicional no corresponde al contrato');
  }

  private validateMoney(values: MoneyFields) {
    const provided = [values.montoNeto, values.montoExento, values.iva].filter((value): value is number => value !== undefined);
    const totalCents = this.cents(values.montoTotal);
    if (totalCents < 0) throw new BadRequestException('El monto total no puede ser negativo');
    const componentCents = provided.reduce((sum, value) => sum + this.cents(value), 0);
    if (componentCents > totalCents) throw new BadRequestException('Los componentes del monto no pueden superar el total');
    if (provided.length === 3 && componentCents !== totalCents) throw new BadRequestException('Neto, exento e IVA deben coincidir con el monto total');
  }

  private safeUrl(value?: string) {
    const cleaned = value?.trim();
    if (!cleaned) return null;
    let parsed: URL;
    try { parsed = new URL(cleaned); } catch { throw new BadRequestException('La URL del documento no es válida'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new BadRequestException('La URL solo puede usar http o https');
    if (!parsed.hostname) throw new BadRequestException('La URL debe incluir un host válido');
    if (parsed.username || parsed.password) throw new BadRequestException('La URL no puede incluir credenciales');
    return parsed.toString();
  }

  private identity(tipoDocumento: string, emisorProveedor: string, folioONumero: string) {
    const issuer = this.cleanRequired(emisorProveedor, 'emisorProveedor');
    const folio = this.cleanRequired(folioONumero, 'folioONumero');
    return {
      tipoDocumento,
      folioONumero: folio,
      folioNormalizado: this.normalize(folio),
      emisorProveedor: issuer,
      emisorNormalizado: this.normalize(issuer),
    };
  }

  private async assertNotDuplicate(idEmpresa: number, identity: ReturnType<ExternalTaxDocumentsService['identity']>, excludedId: number | undefined, user: AuthUser) {
    const duplicate = await this.prisma.documentoTributarioExterno.findFirst({ where: {
      idEmpresa,
      tipoDocumento: identity.tipoDocumento,
      emisorNormalizado: identity.emisorNormalizado,
      folioNormalizado: identity.folioNormalizado,
      ...(excludedId ? { idDocumento: { not: excludedId } } : {}),
    }, select: { idDocumento: true } });
    if (!duplicate) return;
    await this.auditDuplicate(idEmpresa, identity, user);
    throw new ConflictException('Ya existe un documento con el mismo tipo, emisor y folio en esta empresa');
  }

  private async auditDuplicate(idEmpresa: number, identity: ReturnType<ExternalTaxDocumentsService['identity']>, user: AuthUser) {
    await this.audit.record({
      idUsuario: user.idUsuario,
      accion: 'INTENTO_DOCUMENTO_TRIBUTARIO_DUPLICADO',
      entidadAfectada: 'documento_tributario_externo',
      valorNuevo: { idEmpresa, tipoDocumento: identity.tipoDocumento, emisorNormalizado: identity.emisorNormalizado, folioNormalizado: identity.folioNormalizado },
    });
  }

  private async auditLink(idDocumento: number, idEmpresa: number, idFactura: number, user: AuthUser) {
    await this.audit.record({ idUsuario: user.idUsuario, accion: 'VINCULAR_DOCUMENTO_FACTURA', entidadAfectada: 'documento_tributario_externo', idEntidadAfectada: idDocumento, valorNuevo: { idEmpresa, idFactura } });
  }

  private auditValue(document: Record<string, unknown>) {
    const rawUrl = typeof document.urlDocumento === 'string' ? document.urlDocumento : undefined;
    return {
      idEmpresa: document.idEmpresa as number,
      tipoDocumento: document.tipoDocumento as string,
      folioONumero: document.folioONumero as string,
      emisorProveedor: document.emisorProveedor as string,
      fechaEmision: document.fechaEmision instanceof Date ? this.dateString(document.fechaEmision) : document.fechaEmision as string,
      montoTotal: String(document.montoTotal),
      estado: document.estado as string,
      fuente: document.fuente as string,
      idCliente: document.idCliente as number | null,
      idContrato: document.idContrato as number | null,
      idFactura: document.idFactura as number | null,
      idCargoAdicional: document.idCargoAdicional as number | null,
      urlDocumento: this.sanitizedAuditUrl(rawUrl),
    } satisfies Prisma.InputJsonObject;
  }

  private sanitizedAuditUrl(value?: string) {
    if (!value) return null;
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  }

  private assertAdministrator(user: AuthUser) {
    if (!isAdministrator(user.roles)) throw new ForbiddenException('Solo un administrador puede gestionar documentos tributarios externos');
  }

  private resolveWriteCompany(requested: number | undefined, user: AuthUser) {
    const idEmpresa = requested ?? user.idEmpresa;
    if (!idEmpresa) throw new BadRequestException('Debe indicar una empresa');
    this.assertCompanyAccess(idEmpresa, user);
    return idEmpresa;
  }

  private resolveQueryCompany(requested: number | undefined, user: AuthUser) {
    if (requested) this.assertCompanyAccess(requested, user);
    if (!isAdministrator(user.roles)) return user.idEmpresa ?? undefined;
    return requested ?? user.idEmpresa ?? undefined;
  }

  private assertCompanyAccess(idEmpresa: number, user: AuthUser) {
    if (!user.idEmpresa) throw new ForbiddenException('El usuario no tiene empresa asociada');
    if (user.idEmpresa !== idEmpresa) throw new ForbiddenException('El documento pertenece a otra empresa');
  }

  private async assertCompanyExists(idEmpresa: number) {
    const company = await this.prisma.empresa.findUnique({ where: { idEmpresa }, select: { idEmpresa: true } });
    if (!company) throw new NotFoundException('Empresa no encontrada');
  }

  private dateOnly(value: string, field: string) {
    const parsed = parseDateOnly(value);
    if (!parsed) throw new BadRequestException(`${field} debe ser una fecha válida YYYY-MM-DD`);
    return parsed;
  }

  private dateString(value: Date) { return value.toISOString().slice(0, 10); }
  private normalize(value: string) { return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('es-CL'); }
  private cleanRequired(value: string, field: string) {
    const cleaned = value.trim().replace(/\s+/g, ' ');
    if (!cleaned) throw new BadRequestException(`${field} es obligatorio`);
    return cleaned;
  }
  private optionalText(value?: string) { return value?.trim() || null; }
  private decimal(value?: number) { return value === undefined ? null : new Prisma.Decimal(value.toFixed(2)); }
  private cents(value: number) { return Math.round(value * 100); }
  private numberOrUndefined(value: Prisma.Decimal | null) { return value === null ? undefined : Number(value); }
  private isUniqueConflict(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'; }
}
