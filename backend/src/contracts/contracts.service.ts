import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { createHash } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { resolveCustomerLifecycleStatus } from '../common/customer-lifecycle';
import { parseDateOnly, todayDateOnly } from '../common/date-rules';
import { isAdministrator } from '../common/roles';
import { serviceTypeFromPlan } from '../common/service-type';
import { PrismaService } from '../prisma/prisma.service';
import { ServicesService } from '../services/services.service';
import { ChangePlanDto } from './dto/change-plan.dto';
import { ConfirmContractSignatureDto } from './dto/confirm-contract-signature.dto';
import { CreateCustomerContractDto } from './dto/create-customer-contract.dto';
import { UpdateDigitalContractStatusDto } from './dto/update-digital-contract-status.dto';

const CONTRACT_INCLUDE = {
  cliente: { include: { empresa: true, direcciones: true } },
  prospecto: { include: { empresa: true } },
  plan: true,
  zonaPago: true,
  servicios: {
    include: {
      direccion: true,
      equipos: true,
      tickets: { take: 10, orderBy: { fechaCreacion: 'desc' } },
      ordenes: { take: 10, orderBy: { fechaCreacion: 'desc' } },
    },
    orderBy: { fechaCreacion: 'desc' },
  },
} satisfies Prisma.ContratoInclude;

@Injectable()
export class ContractsService {
  private readonly contractsDir = resolve(process.cwd(), 'generated', 'contracts');

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly servicesService: ServicesService,
  ) {}

  async createCustomerContract(dto: CreateCustomerContractDto, currentUser: AuthUser) {
    const customer = await this.prisma.cliente.findUnique({
      where: { idCliente: dto.idCliente },
      include: { contratos: { select: { idEmpresa: true } } },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const plan = await this.prisma.plan.findUnique({ where: { idPlan: dto.idPlan } });

    if (!plan || plan.activo === false) {
      throw new BadRequestException('El plan no existe o esta inactivo');
    }

    const idEmpresa = plan.idEmpresa ?? customer.idEmpresa;
    this.assertCompanyAccess(idEmpresa, currentUser);

    let diaVencimiento = 1;
    if (dto.idZonaPago) {
      const zone = await this.prisma.zonaPago.findUnique({ where: { idZonaPago: dto.idZonaPago } });

      if (!zone || zone.activo === false || (zone.idEmpresa && idEmpresa && zone.idEmpresa !== idEmpresa)) {
        throw new BadRequestException('La zona de pago no corresponde a la empresa del contrato');
      }
      diaVencimiento = zone.diaVencimientoSugerido ?? 1;
    }

    const fechaInicio = dto.fechaContratacion ? parseDateOnly(dto.fechaContratacion) ?? new Date() : new Date();
    const contract = await this.prisma.contrato.create({
      data: {
        idCliente: customer.idCliente,
        idPlan: plan.idPlan,
        idEmpresa,
        idZonaPago: dto.idZonaPago,
        fechaInicio,
        diaVencimiento,
        estado: 'Pendiente firma contrato',
        observacionContrato: dto.observacion?.trim() || null,
      },
      include: CONTRACT_INCLUDE,
    });

    await this.reconcileCustomerStatus(customer.idCliente);
    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_CONTRATACION_CLIENTE',
      entidadAfectada: 'contrato',
      idEntidadAfectada: contract.idContrato,
      valorNuevo: {
        idCliente: customer.idCliente,
        idPlan: plan.idPlan,
        estadoContrato: contract.estado,
      },
    });

    return contract;
  }

  async confirmManualSignature(idContrato: number, dto: ConfirmContractSignatureDto, currentUser: AuthUser) {
    const contract = await this.getContractOrThrow(idContrato, currentUser);

    if (this.isSignedContract(contract.estado)) {
      return contract;
    }

    if (['Anulado', 'Baja'].includes(contract.estado)) {
      throw new BadRequestException('No se puede confirmar la firma de un contrato anulado');
    }

    const installationAddress = contract.direccionInstalacion?.trim()
      || contract.prospecto?.direccion?.trim()
      || contract.cliente?.direcciones.find((address) => address.direccionCompleta?.trim())?.direccionCompleta;

    if (!installationAddress) {
      throw new BadRequestException('El contrato necesita una direccion de instalacion registrada antes de confirmar la firma');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const signedContract = await tx.contrato.update({
        where: { idContrato },
        data: {
          estado: 'Firmado',
          fechaFirmaManual: new Date(),
          idUsuarioFirmaManual: currentUser.idUsuario,
          observacionFirmaManual: dto.observacion?.trim() || null,
        },
        include: CONTRACT_INCLUDE,
      });

      if (signedContract.idProspecto && !signedContract.idCliente) {
        await tx.prospecto.update({
          where: { idProspecto: signedContract.idProspecto },
          data: { estadoPipeline: 'Pendiente activacion' },
        });
      }

      return signedContract;
    });

    if (updated.idCliente) {
      await this.reconcileCustomerStatus(updated.idCliente);
    }

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CONFIRMAR_FIRMA_CONTRATO_MANUAL',
      entidadAfectada: 'contrato',
      idEntidadAfectada: idContrato,
      valorAnterior: { estado: contract.estado },
      valorNuevo: {
        estado: updated.estado,
        fechaFirmaManual: updated.fechaFirmaManual?.toISOString() ?? null,
        idProspecto: updated.idProspecto,
        estadoActivacion: updated.idCliente ? null : 'Pendiente Instalacion',
      },
    });

    return this.getContractOrThrow(idContrato, currentUser);
  }
  async prepareInstallation(idContrato: number, currentUser: AuthUser) {
    const contract = await this.getContractOrThrow(idContrato, currentUser);

    if (!this.isSignedContract(contract.estado)) {
      throw new BadRequestException('Debes confirmar la firma del contrato antes de preparar la instalacion');
    }

    if (!contract.idCliente) {
      throw new BadRequestException('La instalacion de este contrato se solicitara mediante la futura integracion G3');
    }

    return this.servicesService.ensureInstallationServiceForContract(idContrato, currentUser);
  }

  async changePlan(idContrato: number, dto: ChangePlanDto, currentUser: AuthUser) {
    const contract = await this.getContractOrThrow(idContrato, currentUser);
    const nextPlan = await this.prisma.plan.findUnique({ where: { idPlan: dto.newPlanId } });

    if (!this.isSignedContract(contract.estado)) {
      throw new BadRequestException('Solo puedes cambiar el plan de un contrato firmado y vigente');
    }
    if (contract.idPlan === dto.newPlanId) {
      throw new BadRequestException('Selecciona un plan diferente al actual');
    }

    if (!nextPlan || nextPlan.activo === false) {
      throw new BadRequestException('El nuevo plan no existe o esta inactivo');
    }

    const nextServiceType = serviceTypeFromPlan(nextPlan.tipoPlan);

    if (!nextServiceType) {
      throw new BadRequestException('El tipo del plan nuevo no permite determinar el servicio contratado');
    }

    if (contract.idEmpresa && nextPlan.idEmpresa && contract.idEmpresa !== nextPlan.idEmpresa) {
      throw new BadRequestException('El plan nuevo no pertenece a la empresa del contrato');
    }

    const effectiveDate = parseDateOnly(dto.fechaEfectiva);

    if (!effectiveDate || dto.fechaEfectiva < todayDateOnly()) {
      throw new BadRequestException('La fecha efectiva debe ser hoy o una fecha futura');
    }

    const scheduled = dto.fechaEfectiva > todayDateOnly();
    const previousPrice = await this.resolvePlanPrice(contract.idPlan ?? 0, contract.idZonaPago);
    const nextPrice = await this.resolvePlanPrice(nextPlan.idPlan, contract.idZonaPago);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id_contrato FROM contrato WHERE id_contrato = ${idContrato} FOR UPDATE`;
      const current = await tx.contrato.findUnique({ where: { idContrato } });
      if (!current || current.idPlan !== contract.idPlan || !this.isSignedContract(current.estado)) {
        throw new BadRequestException('El contrato cambió; actualiza la pantalla antes de continuar');
      }
      const pending = await tx.historialCambioPlan.findFirst({ where: { idContrato, estadoCambio: 'Pendiente' } });
      if (pending) throw new BadRequestException('Ya existe un cambio pendiente; cancélalo antes de programar otro');
      const history = await tx.historialCambioPlan.create({
        data: {
          idContrato,
          idCliente: contract.idCliente,
          idEmpresa: contract.idEmpresa,
          idPlanAnterior: contract.idPlan,
          idPlanNuevo: nextPlan.idPlan,
          fechaEfectiva: effectiveDate,
          motivo: dto.motivo?.trim() || 'Cambio de plan',
          observaciones: dto.observaciones?.trim() || null,
          precioAnterior: previousPrice,
          precioNuevo: nextPrice,
          idUsuarioRegistro: currentUser.idUsuario,
          fechaRegistro: new Date(),
          estadoCambio: scheduled ? 'Pendiente' : 'Aplicado',
          fechaAplicacion: scheduled ? null : new Date(),
        },
      });

      if (scheduled) {
        await this.auditPlanChange(tx, history.idCambioPlan, idContrato, 'PROGRAMAR_CAMBIO_PLAN', currentUser.idUsuario);
        return { history, updatedContract: contract };
      }

      const updatedContract = await tx.contrato.update({
        where: { idContrato },
        data: { idPlan: nextPlan.idPlan },
        include: CONTRACT_INCLUDE,
      });

      for (const service of contract.servicios) {
        if (service.estadoOperativo === 'Baja') continue;
        await tx.servicioContratado.update({
          where: { idServicio: service.idServicio },
          data: {
            tipoServicio: nextServiceType,
            datosTecnicos: this.mergeServicePlanData(service.datosTecnicos, nextPlan, nextPrice),
          },
        });
      }

      await this.auditPlanChange(tx, history.idCambioPlan, idContrato, 'CAMBIAR_PLAN_CONTRATADO', currentUser.idUsuario);
      return { history, updatedContract };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: scheduled ? 'DETALLE_PROGRAMACION_PLAN' : 'DETALLE_CAMBIO_PLAN',
      entidadAfectada: 'contrato',
      idEntidadAfectada: idContrato,
      valorAnterior: {
        idPlan: contract.idPlan,
        precioMensual: previousPrice ? Number(previousPrice) : null,
      },
      valorNuevo: {
        idPlan: nextPlan.idPlan,
        precioMensual: nextPrice ? Number(nextPrice) : null,
        idCambioPlan: result.history.idCambioPlan,
        fechaEfectiva: dto.fechaEfectiva,
        tipoServicio: nextServiceType,
      },
    });

    return { ...result.updatedContract, cambioPlan: result.history };
  }

  async planChanges(idContrato: number, user: AuthUser) {
    await this.getContractOrThrow(idContrato, user);
    return this.prisma.historialCambioPlan.findMany({
      where: { idContrato }, include: { planAnterior: true, planNuevo: true },
      orderBy: { idCambioPlan: 'desc' },
    });
  }

  async cancelPlanChange(idContrato: number, idCambioPlan: number, user: AuthUser) {
    await this.getContractOrThrow(idContrato, user);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id_contrato FROM contrato WHERE id_contrato = ${idContrato} FOR UPDATE`;
      const result = await tx.historialCambioPlan.updateMany({
        where: { idCambioPlan, idContrato, estadoCambio: 'Pendiente' }, data: { estadoCambio: 'Cancelado' },
      });
      if (!result.count) throw new BadRequestException('El cambio ya no está pendiente');
      await this.auditPlanChange(tx, idCambioPlan, idContrato, 'CANCELAR_CAMBIO_PLAN', user.idUsuario);
      return { estadoCambio: 'Cancelado' };
    });
  }

  async applyDuePlanChanges(reference = new Date()) {
    const today = parseDateOnly(todayDateOnly(reference))!;
    const pending = await this.prisma.historialCambioPlan.findMany({
      where: { estadoCambio: 'Pendiente', fechaEfectiva: { lte: today } },
      orderBy: [{ fechaEfectiva: 'asc' }, { idCambioPlan: 'asc' }], take: 100,
    });
    for (const item of pending) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id_contrato FROM contrato WHERE id_contrato = ${item.idContrato} FOR UPDATE`;
        const change = await tx.historialCambioPlan.findUnique({ where: { idCambioPlan: item.idCambioPlan } });
        if (!change || change.estadoCambio !== 'Pendiente') return;
        const contract = await tx.contrato.findUnique({ where: { idContrato: item.idContrato }, include: { servicios: true } });
        const plan = await tx.plan.findUnique({ where: { idPlan: change.idPlanNuevo } });
        const type = plan && serviceTypeFromPlan(plan.tipoPlan);
        const invalid = !contract || !this.isSignedContract(contract.estado) || contract.idPlan !== change.idPlanAnterior
          || !plan || plan.activo === false || !type
          || (contract.idEmpresa && plan.idEmpresa && contract.idEmpresa !== plan.idEmpresa);
        if (invalid || !contract || !plan || !type) {
          await tx.historialCambioPlan.update({ where: { idCambioPlan: item.idCambioPlan }, data: { estadoCambio: 'Cancelado' } });
          await this.auditPlanChange(tx, item.idCambioPlan, item.idContrato, 'CANCELAR_CAMBIO_PLAN_NO_VIGENTE', null);
          return;
        }
        await tx.contrato.update({ where: { idContrato: contract.idContrato }, data: { idPlan: plan.idPlan } });
        for (const service of contract.servicios.filter(s => s.estadoOperativo !== 'Baja')) {
          await tx.servicioContratado.update({ where: { idServicio: service.idServicio }, data: {
            tipoServicio: type, datosTecnicos: this.mergeServicePlanData(service.datosTecnicos, plan, change.precioNuevo),
          } });
        }
        await tx.historialCambioPlan.update({ where: { idCambioPlan: item.idCambioPlan }, data: { estadoCambio: 'Aplicado', fechaAplicacion: reference } });
        await this.auditPlanChange(tx, item.idCambioPlan, item.idContrato, 'APLICAR_CAMBIO_PLAN_PROGRAMADO', null);
      });
    }
  }

  private auditPlanChange(tx: Prisma.TransactionClient, id: number, idContrato: number, accion: string, idUsuario: number | null) {
    return tx.logAuditoria.create({ data: { idUsuario, accion, entidadAfectada: 'contrato', idEntidadAfectada: idContrato,
      valorNuevo: { idCambioPlan: id, idContrato },
    } });
  }

  async getDigitalContracts(idContrato: number, currentUser: AuthUser) {
    await this.getContractOrThrow(idContrato, currentUser);
    const documents = await this.prisma.contratoDigital.findMany({
      where: { idContrato },
      orderBy: { version: 'desc' },
    });

    return {
      latest: documents[0] ?? null,
      documents,
    };
  }

  async generateDigitalContract(idContrato: number, currentUser: AuthUser) {
    const contract = await this.getContractOrThrow(idContrato, currentUser);
    return this.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id_contrato FROM contrato WHERE id_contrato = ${idContrato} FOR UPDATE`;
    const latest = await tx.contratoDigital.findFirst({
      where: { idContrato },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;
    const buffer = await this.renderDigitalContract(contract, version);
    const hash = createHash('sha256').update(buffer).digest('hex');
    const relativePath = join('generated', 'contracts', `contrato-${idContrato}-v${version}.pdf`);
    const fullPath = resolve(process.cwd(), relativePath);

    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);

    const created = await tx.contratoDigital.create({
      data: {
        idContrato,
        idCliente: contract.idCliente,
        idEmpresa: contract.idEmpresa,
        urlDocumento: relativePath.replace(/\\/g, '/'),
        hashDocumento: hash,
        estadoFirma: 'Generado',
        fechaGeneracion: new Date(),
        idUsuarioGenerador: currentUser.idUsuario,
        version,
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'GENERAR_CONTRATO_DIGITAL',
      entidadAfectada: 'contrato_digital',
      idEntidadAfectada: created.idContratoDigital,
      valorNuevo: {
        idContrato,
        idCliente: created.idCliente,
        version,
        hashDocumento: hash,
        estadoFirma: created.estadoFirma,
      },
    });

    return created;
    }, { timeout: 20000 });
  }

  async downloadDigitalContract(idContrato: number, currentUser: AuthUser, response: Response, version?: number) {
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) throw new BadRequestException('Versión inválida');
    await this.getContractOrThrow(idContrato, currentUser);
    const latest = await this.prisma.contratoDigital.findFirst({
      where: { idContrato, ...(version === undefined ? {} : { version }) },
      orderBy: { version: 'desc' },
    });

    if (!latest) {
      throw new NotFoundException('El contrato digital aun no fue generado');
    }

    const filePath = resolve(process.cwd(), latest.urlDocumento);

    if (!filePath.startsWith(this.contractsDir) || !existsSync(filePath)) {
      throw new BadRequestException('El archivo del contrato digital no esta disponible');
    }

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'DESCARGAR_CONTRATO_DIGITAL',
      entidadAfectada: 'contrato_digital',
      idEntidadAfectada: latest.idContratoDigital,
      valorNuevo: { idContrato, version: latest.version },
    });

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `inline; filename="contrato-${idContrato}-v${latest.version}.pdf"`);

    return new StreamableFile(createReadStream(filePath));
  }

  async updateDigitalContractStatus(idContrato: number, dto: UpdateDigitalContractStatusDto, currentUser: AuthUser) {
    await this.getContractOrThrow(idContrato, currentUser);
    const latest = await this.prisma.contratoDigital.findFirst({
      where: { idContrato },
      orderBy: { version: 'desc' },
    });

    if (!latest) {
      throw new NotFoundException('El contrato digital aun no fue generado');
    }

    if (latest.estadoFirma === 'Firmado manualmente' && dto.estadoFirma !== 'Firmado manualmente') {
      throw new BadRequestException('Un contrato firmado no se modifica destructivamente; genera una nueva version si necesitas corregir');
    }

    const updated = await this.prisma.contratoDigital.update({
      where: { idContratoDigital: latest.idContratoDigital },
      data: {
        estadoFirma: dto.estadoFirma,
        fechaFirma: dto.estadoFirma === 'Firmado manualmente' ? new Date() : latest.fechaFirma,
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTUALIZAR_ESTADO_CONTRATO_DIGITAL',
      entidadAfectada: 'contrato_digital',
      idEntidadAfectada: updated.idContratoDigital,
      valorAnterior: { estadoFirma: latest.estadoFirma },
      valorNuevo: {
        estadoFirma: updated.estadoFirma,
        observaciones: dto.observaciones,
      },
    });

    return updated;
  }

  private async getContractOrThrow(idContrato: number, currentUser: AuthUser) {
    const contract = await this.prisma.contrato.findUnique({
      where: { idContrato },
      include: CONTRACT_INCLUDE,
    });

    if (!contract || (!contract.cliente && !contract.prospecto)) {
      throw new NotFoundException('Contrato no encontrado');
    }

    this.assertCompanyAccess(contract.idEmpresa, currentUser);

    return contract;
  }

  private isSignedContract(status: string | null | undefined) {
    return ['Firmado', 'Activo', 'Suspendido', 'Moroso'].includes(status ?? '');
  }

  private async reconcileCustomerStatus(idCliente: number) {
    const customer = await this.prisma.cliente.findUnique({
      where: { idCliente },
      include: {
        contratos: { select: { estado: true } },
        servicios: { select: { estadoOperativo: true } },
      },
    });

    if (!customer) {
      return;
    }

    const nextStatus = resolveCustomerLifecycleStatus({
      currentStatus: customer.estado,
      contractStates: customer.contratos.map((item) => item.estado),
      serviceStates: customer.servicios.map((service) => service.estadoOperativo),
    });

    if (nextStatus !== customer.estado) {
      await this.prisma.cliente.update({ where: { idCliente }, data: { estado: nextStatus } });
    }
  }

  private async resolvePlanPrice(idPlan: number, idZonaPago: number | null) {
    if (idZonaPago) {
      const zonePrice = await this.prisma.planZonaPrecio.findFirst({
        where: { idPlan, idZonaPago, activo: true },
        orderBy: { idPlanZonaPrecio: 'desc' },
      });

      if (zonePrice) {
        return zonePrice.precioMensual;
      }
    }

    const plan = await this.prisma.plan.findUnique({ where: { idPlan } });
    return plan?.precioMensual ?? null;
  }

  private mergeServicePlanData(
    current: Prisma.JsonValue | null,
    plan: { nombreComercial: string; velocidadMbps: number | null },
    price: Prisma.Decimal | null,
  ): Prisma.InputJsonObject {
    const currentObject =
      current && typeof current === 'object' && !Array.isArray(current)
        ? (current as Record<string, unknown>)
        : {};

    return {
      ...currentObject,
      plan: plan.nombreComercial,
      velocidadMbps: plan.velocidadMbps,
      precioMensual: price ? Number(price) : undefined,
      fechaActualizacionPlan: new Date().toISOString(),
    } as Prisma.InputJsonObject;
  }

  private async renderDigitalContract(contract: Awaited<ReturnType<ContractsService['getContractOrThrow']>>, version: number) {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50 });
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolveBuffer, reject) => {
      doc.on('end', () => resolveBuffer(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const price = await this.resolvePlanPrice(contract.idPlan ?? 0, contract.idZonaPago);

    doc.fontSize(18).text('Contrato digital de servicios', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text(`Version: ${version}`);
    doc.text(`Fecha generacion: ${new Date().toLocaleString('es-CL')}`);
    doc.moveDown();
    doc.fontSize(14).text('Cliente');
    doc.fontSize(11).text(`Nombre: ${contract.cliente?.nombreCompleto ?? '-'}`);
    doc.text(`RUT: ${contract.cliente?.rut ?? '-'}`);
    doc.text(`Email: ${contract.cliente?.email ?? '-'}`);
    doc.text(`Telefono: ${contract.cliente?.telefono ?? '-'}`);
    doc.moveDown();
    doc.fontSize(14).text('Contrato');
    doc.fontSize(11).text(`ID contrato: ${contract.idContrato}`);
    doc.text(`Empresa: ${contract.cliente?.empresa?.nombre ?? contract.idEmpresa ?? '-'}`);
    doc.text(`Plan: ${contract.plan?.nombreComercial ?? '-'}`);
    doc.text(`Precio mensual: ${price ? `$${Number(price).toLocaleString('es-CL')}` : '-'}`);
    doc.text(`Dia de vencimiento: ${contract.diaVencimiento}`);
    doc.text(`Estado: ${contract.estado}`);
    doc.text(`Zona de pago: ${contract.zonaPago?.nombreZona ?? '-'}`);
    doc.moveDown();
    doc.fontSize(14).text('Servicios asociados');
    contract.servicios.forEach((service) => {
      doc.fontSize(11).text(`Servicio ${service.idServicio}: ${service.tipoServicio} - ${service.estadoOperativo}`);
      doc.text(`Direccion: ${service.direccion?.direccionCompleta ?? '-'}`);
      doc.text(`Datos tecnicos: ${JSON.stringify(service.datosTecnicos ?? {})}`);
      if (service.equipos.length) {
        doc.text('Equipos:');
        service.equipos.forEach((unit) => {
          doc.text(`- ${unit.numeroSerie} ${unit.modelo ?? ''} (${unit.estado}) modalidad: ${unit.modalidadAsignacion ?? '-'}`);
        });
      }
      doc.moveDown(0.5);
    });
    doc.moveDown();
    doc.fontSize(10).text('Documento generado por el CRM FiNet/Cable Magico. La firma electronica avanzada queda fuera de esta etapa; el estado de firma se gestiona manualmente en el CRM.');
    doc.end();

    return finished;
  }

  private assertCompanyAccess(idEmpresa: number | null, currentUser: AuthUser) {
    if (isAdministrator(currentUser.roles)) {
      return;
    }

    if (!currentUser.idEmpresa || idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El registro no pertenece a tu empresa');
    }
  }
}
