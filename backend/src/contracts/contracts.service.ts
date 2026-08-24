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
import { parseDateOnly } from '../common/date-rules';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePlanDto } from './dto/change-plan.dto';
import { UpdateDigitalContractStatusDto } from './dto/update-digital-contract-status.dto';

const CONTRACT_INCLUDE = {
  cliente: { include: { empresa: true, direcciones: true } },
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
  ) {}

  async changePlan(idContrato: number, dto: ChangePlanDto, currentUser: AuthUser) {
    const contract = await this.getContractOrThrow(idContrato, currentUser);
    const nextPlan = await this.prisma.plan.findUnique({ where: { idPlan: dto.newPlanId } });

    if (!nextPlan || nextPlan.activo === false) {
      throw new BadRequestException('El nuevo plan no existe o esta inactivo');
    }

    if (contract.idEmpresa && nextPlan.idEmpresa && contract.idEmpresa !== nextPlan.idEmpresa) {
      throw new BadRequestException('El plan nuevo no pertenece a la empresa del contrato');
    }

    const effectiveDate = parseDateOnly(dto.fechaEfectiva);

    if (!effectiveDate) {
      throw new BadRequestException('La fecha efectiva no es valida');
    }

    const previousPrice = contract.plan?.precioMensual ?? null;
    const nextPrice = await this.resolvePlanPrice(nextPlan.idPlan, contract.idZonaPago);

    const result = await this.prisma.$transaction(async (tx) => {
      const history = await tx.historialCambioPlan.create({
        data: {
          idContrato,
          idCliente: contract.idCliente,
          idEmpresa: contract.idEmpresa,
          idPlanAnterior: contract.idPlan,
          idPlanNuevo: nextPlan.idPlan,
          fechaEfectiva: effectiveDate,
          motivo: dto.motivo.trim(),
          observaciones: dto.observaciones?.trim() || null,
          precioAnterior: previousPrice,
          precioNuevo: nextPrice,
          idUsuarioRegistro: currentUser.idUsuario,
          fechaRegistro: new Date(),
        },
      });

      const updatedContract = await tx.contrato.update({
        where: { idContrato },
        data: { idPlan: nextPlan.idPlan },
        include: CONTRACT_INCLUDE,
      });

      for (const service of contract.servicios) {
        await tx.servicioContratado.update({
          where: { idServicio: service.idServicio },
          data: {
            datosTecnicos: this.mergeServicePlanData(service.datosTecnicos, nextPlan, nextPrice),
          },
        });
      }

      return { history, updatedContract };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CAMBIAR_PLAN_CONTRATADO',
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
      },
    });

    return result.updatedContract;
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
    const latest = await this.prisma.contratoDigital.findFirst({
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

    const created = await this.prisma.contratoDigital.create({
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
  }

  async downloadDigitalContract(idContrato: number, currentUser: AuthUser, response: Response) {
    await this.getContractOrThrow(idContrato, currentUser);
    const latest = await this.prisma.contratoDigital.findFirst({
      where: { idContrato },
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

    if (!contract || !contract.cliente) {
      throw new NotFoundException('Contrato no encontrado');
    }

    this.assertCompanyAccess(contract.idEmpresa, currentUser);

    return contract;
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
