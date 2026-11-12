import { assertNoContractDebt, auditContractDebtRejection } from './contract-debt.guard';
import { assignAutomatic, assertManualMode, assertPendingSignature, resolveSignatureMode, SignatureMode } from './signature-policy';
import { signatureRepository, signatureStorageAvailable } from './signature.repository';
import { signatureSettings } from './e-signature.config';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional, StreamableFile } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { mkdir, open, unlink } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import PDFDocument from 'pdfkit';
import { ConfigService } from '@nestjs/config';
import { buildContractSnapshot, ContractSnapshot, CONTRACT_INCLUDE } from './contract-snapshot';
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

type OwnedContractFile = { idContrato?: number; fullPath?: string; relativePath?: string };

@Injectable()
export class ContractsService {
  private readonly contractsDir = resolve(process.cwd(), 'generated', 'contracts');
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly servicesService: ServicesService,
    @Optional() private readonly config?: ConfigService,
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
    return this.prisma.$transaction(async tx => {
    await assertNoContractDebt(tx, { idEmpresa, idCliente: customer.idCliente, rut: customer.rut, idUsuario: currentUser.idUsuario });
    const contract = await tx.contrato.create({
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

    await assignAutomatic(tx, contract, this.config, currentUser.idUsuario);
    await this.reconcileCustomerStatus(customer.idCliente, tx);
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
    }, tx);

    return contract;
    }, { timeout: 20000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      .catch(error => auditContractDebtRejection(this.prisma, this.auditService, error));
  }

  async confirmManualSignature(idContrato: number, dto: ConfirmContractSignatureDto, currentUser: AuthUser) {
    // Check access before waiting, then revalidate the current row under its lock.
    await this.getContractOrThrow(idContrato, currentUser);
    return this.prisma.$transaction(
      tx => this.markContractSigned(tx, idContrato, {
        kind: 'manual', actor: currentUser, observation: dto.observacion,
      }),
      { timeout: 20000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ).catch(error => auditContractDebtRejection(this.prisma, this.auditService, error));
  }

  async markContractSigned(
    tx: Prisma.TransactionClient,
    idContrato: number,
    origin: { kind: 'manual' | 'electronic'; actor: AuthUser; observation?: string },
  ) {
    await tx.$queryRaw`SELECT id_contrato FROM contrato WHERE id_contrato = ${idContrato} FOR UPDATE`;
    const contract = await this.getContractOrThrow(idContrato, origin.actor, tx);

    const mode = await resolveSignatureMode(tx, contract, this.config);
    if (origin.kind === 'manual') assertManualMode(mode);
    else if (mode !== 'automatic') throw new ConflictException('Contrato no asignado a firma automática');
    // Replays preserve the original signature, financial state and audit.
    if (this.isSignedContract(contract.estado)) return contract;
    assertPendingSignature(contract.estado);
    await assertNoContractDebt(tx, { idEmpresa: contract.idEmpresa, idCliente: contract.idCliente,
      rut: contract.cliente?.rut ?? contract.prospecto?.rut, idContrato, idProspecto: contract.idProspecto ?? undefined,
      idUsuario: origin.actor.idUsuario });
    const document = await tx.contratoDigital.findFirst({ where: { idContrato }, orderBy: { version: 'desc' } });
    if (!document || document.idEmpresa !== contract.idEmpresa || !['Generado','Enviado','Firmado manualmente'].includes(document.estadoFirma)) {
      throw new ConflictException('El contrato necesita un PDF vigente y elegible para firma');
    }

    const installationAddress = contract.direccionInstalacion?.trim()
      || contract.prospecto?.direccion?.trim()
      || contract.cliente?.direcciones.find(address => address.direccionCompleta?.trim())?.direccionCompleta;
    if (!installationAddress) {
      throw new BadRequestException('El contrato necesita una direccion de instalacion registrada antes de confirmar la firma');
    }

    // Different contracts may share a customer. Serialize their lifecycle rollups.
    if (contract.idCliente) {
      await tx.$queryRaw`SELECT id_cliente FROM cliente WHERE id_cliente = ${contract.idCliente} FOR UPDATE`;
    }
    const signedContract = await tx.contrato.update({
      where: { idContrato },
      data: {
        estado: 'Firmado',
        ...(origin.kind === 'manual' ? { fechaFirmaManual: new Date(),
          idUsuarioFirmaManual: origin.actor.idUsuario,
          observacionFirmaManual: origin.observation?.trim() || null } : {}),
      },
      include: CONTRACT_INCLUDE,
    });

    if (origin.kind === 'manual' && await signatureStorageAvailable(tx)) {
      await signatureRepository(tx).updateMany({ where: { idContrato, estado: 'PENDIENTE' },
        data: { estado: 'ANULADA', motivoAnulacion: 'FIRMA_MANUAL', otpHash: null } });
    }
    if (signedContract.idProspecto && !signedContract.idCliente) {
      await tx.prospecto.update({
        where: { idProspecto: signedContract.idProspecto },
        data: { estadoPipeline: 'Pendiente activacion' },
      });
    }
    if (signedContract.idCliente) {
      await this.reconcileCustomerStatus(signedContract.idCliente, tx);
    }
    await this.auditService.record({
      idUsuario: origin.kind === 'manual' ? origin.actor.idUsuario : null,
      accion: origin.kind === 'manual' ? 'CONFIRMAR_FIRMA_CONTRATO_MANUAL' : 'CONFIRMAR_FIRMA_CONTRATO_ELECTRONICA',
      entidadAfectada: 'contrato',
      idEntidadAfectada: idContrato,
      valorAnterior: { estado: contract.estado },
      valorNuevo: {
        estado: signedContract.estado,
        origenFirma: origin.kind,
        fechaFirmaManual: signedContract.fechaFirmaManual?.toISOString() ?? null,
        idProspecto: signedContract.idProspecto,
        estadoActivacion: signedContract.idCliente ? null : 'Pendiente Instalacion',
      },
    }, tx);

    return this.getContractOrThrow(idContrato, origin.actor, tx);
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
    const contract = await this.getContractOrThrow(idContrato, currentUser);
    const documents = await this.prisma.contratoDigital.findMany({
      where: { idContrato },
      orderBy: { version: 'desc' },
    });

    const quotes = contract.idProspecto ? await this.prisma.cotizacion.findMany({
      where: { idProspecto: contract.idProspecto, idPlan: contract.idPlan ?? undefined, fechaEnvio: { not: null } },
      select: { idCotizacion: true, codigo: true, fechaEnvio: true },
      orderBy: { idCotizacion: 'desc' },
    }) : [];
    return {
      latest: documents[0] ?? null,
      documents,
      quotes,
      idProspecto: contract.idProspecto,
    };
  }

  async generateDigitalContract(idContrato: number, currentUser: AuthUser, onlyIfMissing = false) {
    // Reject unauthorized callers before taking a lock, then refresh under that lock.
    await this.getContractOrThrow(idContrato, currentUser);
    return this.withDigitalContractTransaction(async (tx, ownedFile) => {
      await tx.$queryRaw`SELECT id_contrato FROM contrato WHERE id_contrato = ${idContrato} FOR UPDATE`;
      return this.writeDigitalContract(tx, idContrato, currentUser, ownedFile, onlyIfMissing);
    });
  }

  async registerWithDigitalContract<T extends { contrato: { idContrato: number } }>(
    currentUser: AuthUser,
    register: (tx: Prisma.TransactionClient) => Promise<{ result: T; reuseDocument: boolean }>,
  ): Promise<T> {
    return this.withDigitalContractTransaction(async (tx, ownedFile) => {
      // Registration holds the contract row lock or has just inserted the row.
      const { result, reuseDocument } = await register(tx);
      await this.writeDigitalContract(tx, result.contrato.idContrato, currentUser, ownedFile, reuseDocument);
      return result;
    }, Prisma.TransactionIsolationLevel.Serializable);
  }

  private async writeDigitalContract(
    tx: Prisma.TransactionClient,
    idContrato: number,
    currentUser: AuthUser,
    ownedFile: OwnedContractFile,
    onlyIfMissing: boolean,
  ) {
    const contract = await this.getContractOrThrow(idContrato, currentUser, tx);
    const latest = await tx.contratoDigital.findFirst({
      where: { idContrato },
      orderBy: { version: 'desc' },
    });
    if (onlyIfMissing && latest) return latest;
    await assignAutomatic(tx, contract, this.config, currentUser.idUsuario);
    const mode = await resolveSignatureMode(tx, contract, this.config);
    const settings = signatureSettings(this.config ?? new ConfigService());
    const storage = await signatureStorageAvailable(tx);
    const automaticAvailable = mode === 'automatic' && !!settings && settings.companies.includes(contract.idEmpresa!) && storage;
    const version = (latest?.version ?? 0) + 1;
    const snapshot = await buildContractSnapshot(tx, idContrato, false, contract);
    const buffer = await this.renderDigitalContract(contract, version, tx, snapshot, mode);
    const hash = createHash('sha256').update(buffer).digest('hex');
    // A rollback may release the version for another attempt. Never share its filename.
    const relativePath = join('generated', 'contracts', `contrato-${idContrato}-v${version}-${randomUUID()}.pdf`).replace(/\\/g, '/');
    const fullPath = resolve(process.cwd(), relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    const file = await open(fullPath, 'wx');
    ownedFile.idContrato = idContrato;
    ownedFile.fullPath = fullPath;
    ownedFile.relativePath = relativePath;
    try { await file.writeFile(buffer); }
    finally { await file.close(); }

    const created = await tx.contratoDigital.create({
      data: {
        idContrato,
        idCliente: contract.idCliente,
        idEmpresa: contract.idEmpresa,
        urlDocumento: relativePath,
        hashDocumento: hash,
        estadoFirma: 'Generado',
        fechaGeneracion: new Date(),
        idUsuarioGenerador: currentUser.idUsuario,
        version,
      },
    });
    if (mode === 'automatic' && storage) {
      await signatureRepository(tx).updateMany({ where: { idContrato, estado: 'PENDIENTE' }, data: { estado: 'ANULADA', motivoAnulacion: 'NUEVA_VERSION', otpHash: null } });
    }
    if (automaticAvailable) {
      if (buffer.length > 4 * 1024 * 1024) throw new BadRequestException('El PDF supera el límite de firma de 4 MiB');
      if (!contract.idEmpresa) throw new BadRequestException('El contrato necesita una empresa');
      await signatureRepository(tx).create({ data: {
        idSolicitud: randomUUID(), idEmpresa: contract.idEmpresa, idContrato,
        idContratoDigital: created.idContratoDigital, version, idUsuarioCreador: currentUser.idUsuario,
        tokenHash: createHash('sha256').update(randomUUID() + randomUUID()).digest('hex'),
        estado: 'BORRADOR', destinatario: snapshot.cliente.email ?? '',
        datosSnapshot: snapshot as unknown as Prisma.InputJsonObject, hashOriginal: hash,
        pdfOriginal: buffer, fechaExpiracion: new Date(Date.now() + 48 * 3600000),
      } });
    }
    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'GENERAR_CONTRATO_DIGITAL',
      entidadAfectada: 'contrato_digital',
      idEntidadAfectada: created.idContratoDigital,
      valorNuevo: { idContrato, idCliente: created.idCliente, version, hashDocumento: hash, estadoFirma: created.estadoFirma },
    }, tx);
    return created;
  }

  private async withDigitalContractTransaction<T>(
    operation: (tx: Prisma.TransactionClient, ownedFile: OwnedContractFile) => Promise<T>,
    isolationLevel?: Prisma.TransactionIsolationLevel,
  ): Promise<T> {
    const ownedFile: OwnedContractFile = {};
    let transactionBodyCompleted = false;
    try {
      return await this.prisma.$transaction(async tx => {
        const result = await operation(tx, ownedFile);
        transactionBodyCompleted = true;
        return result;
      }, { timeout: 20000, ...(isolationLevel ? { isolationLevel } : {}) });
    } catch (error) {
      if (ownedFile.fullPath && ownedFile.relativePath) {
        try {
          // Outside the ended transaction. Preserve a file if commit succeeded but its ACK was lost.
          const persisted = await this.prisma.contratoDigital.findFirst({
            where: { urlDocumento: ownedFile.relativePath }, select: { idContratoDigital: true },
          });
          if (!persisted && !transactionBodyCompleted) await unlink(ownedFile.fullPath);
          else if (!persisted) {
            // The COMMIT response is uncertain. An immediate empty read does not
            // prove rollback; retain this attempt's file for explicit inspection.
            this.logger.error(`CONTRACT_PDF_CLEANUP_PENDING contrato=${ownedFile.idContrato}`);
          }
        } catch {
          // No safe DB confirmation or failed unlink: retain for inspection, never delete blindly.
          this.logger.error(`CONTRACT_PDF_CLEANUP_PENDING contrato=${ownedFile.idContrato}`);
        }
      }
      throw error;
    }
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
    return this.prisma.$transaction(async tx => {
      // Use the same parent lock as PDF generation and business signature.
      await tx.$queryRaw`SELECT id_contrato FROM contrato WHERE id_contrato = ${idContrato} FOR UPDATE`;
      const contract = await this.getContractOrThrow(idContrato, currentUser, tx);
      const mode = await resolveSignatureMode(tx, contract, this.config);
      if (dto.estadoFirma === 'Firmado manualmente') assertManualMode(mode);
      await tx.$queryRaw`SELECT id_contrato_digital FROM contrato_digital WHERE id_contrato = ${idContrato} ORDER BY version DESC LIMIT 1 FOR UPDATE`;
      const latest = await tx.contratoDigital.findFirst({
        where: { idContrato },
        orderBy: { version: 'desc' },
      });
      if (!latest) throw new NotFoundException('El contrato digital aun no fue generado');
      if (latest.idEmpresa !== contract.idEmpresa) throw new ConflictException('El documento no pertenece a la empresa del contrato');
      if (latest.estadoFirma === 'Anulado' && dto.estadoFirma !== 'Anulado') throw new ConflictException('Una versión anulada no se reactiva. Genera una nueva versión');
      // Preserve every signed variant and any persisted signing timestamp.
      if (this.isSignedDigitalContract(latest)) {
        if (dto.estadoFirma !== latest.estadoFirma) {
          throw new BadRequestException('Un contrato firmado no se modifica destructivamente; genera una nueva version si necesitas corregir');
        }
        return latest;
      }
      if (dto.estadoFirma === 'Firmado manualmente') {
        assertPendingSignature(contract.estado);
        await assertNoContractDebt(tx, { idEmpresa: contract.idEmpresa, idCliente: contract.idCliente,
          rut: contract.cliente?.rut ?? contract.prospecto?.rut, idContrato,
          idProspecto: contract.idProspecto ?? undefined, idUsuario: currentUser.idUsuario });
      }

      const updated = await tx.contratoDigital.update({
        where: { idContratoDigital: latest.idContratoDigital },
        data: {
          estadoFirma: dto.estadoFirma,
          fechaFirma: dto.estadoFirma === 'Firmado manualmente' ? new Date() : latest.fechaFirma,
        },
      });
      if (dto.estadoFirma === 'Anulado' && await signatureStorageAvailable(tx)) {
        await signatureRepository(tx).updateMany({ where: { idContrato, estado: 'PENDIENTE' }, data: { estado: 'ANULADA', motivoAnulacion: 'DOCUMENTO_ANULADO', otpHash: null } });
      }
      await this.auditService.record({
        idUsuario: currentUser.idUsuario,
        accion: 'ACTUALIZAR_ESTADO_CONTRATO_DIGITAL',
        entidadAfectada: 'contrato_digital',
        idEntidadAfectada: updated.idContratoDigital,
        valorAnterior: { estadoFirma: latest.estadoFirma },
        valorNuevo: { estadoFirma: updated.estadoFirma, observaciones: dto.observaciones },
      }, tx);
      return updated;
    }, { timeout: 20000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      .catch(error => auditContractDebtRejection(this.prisma, this.auditService, error));
  }

  private isSignedDigitalContract(document: { estadoFirma: string; fechaFirma?: Date | null }) {
    return document.fechaFirma != null || /^firmad[oa](?:\s|$)/iu.test(document.estadoFirma.trim());
  }

  private async getContractOrThrow(idContrato: number, currentUser: AuthUser, client: Prisma.TransactionClient = this.prisma) {
    const contract = await client.contrato.findUnique({
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

  private async reconcileCustomerStatus(idCliente: number, client: Prisma.TransactionClient = this.prisma) {
    const customer = await client.cliente.findUnique({
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
      await client.cliente.update({ where: { idCliente }, data: { estado: nextStatus } });
    }
  }

  private async resolvePlanPrice(idPlan: number, idZonaPago: number | null, client: Prisma.TransactionClient = this.prisma) {
    if (idZonaPago) {
      const zonePrice = await client.planZonaPrecio.findFirst({
        where: { idPlan, idZonaPago, activo: true },
        orderBy: { idPlanZonaPrecio: 'desc' },
      });

      if (zonePrice) {
        return zonePrice.precioMensual;
      }
    }

    const plan = await client.plan.findUnique({ where: { idPlan } });
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

  private async renderDigitalContract(contract: Awaited<ReturnType<ContractsService['getContractOrThrow']>>, version: number, client: Prisma.TransactionClient = this.prisma, savedSnapshot?: ContractSnapshot, mode: SignatureMode = 'manual') {
    const snapshot = savedSnapshot ?? await buildContractSnapshot(client, contract.idContrato, false, contract);
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolveBuffer, reject) => {
      doc.on('end', () => resolveBuffer(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const width = doc.page.width - 100;
    const ensureSpace = (height: number) => {
      if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
    };
    const row = (label: string, value: string | number | null) => {
      doc.font('Helvetica').fontSize(11);
      const line = `${label}: ${value ?? 'No informado'}`;
      const options = { width, lineGap: 3 };
      // Keep each bounded label/value together; PDFKit wraps long words within the page width.
      ensureSpace(doc.heightOfString(line, options) + 5);
      doc.text(line, 50, doc.y, options);
      doc.moveDown(0.3);
    };
    const section = (title: string) => {
      ensureSpace(80);
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(14).text(title, 50, doc.y, { width });
      doc.moveDown(0.4);
    };
    const block = (title: string, rows: Array<[string, string | number | null]>) => {
      doc.font('Helvetica').fontSize(11);
      const height = rows.reduce((total, [label, value]) => total
        + doc.heightOfString(`${label}: ${value ?? 'No informado'}`, { width, lineGap: 3 }) + 5, 40);
      // Keep a service and the document notes together instead of leaving orphan rows on a new page.
      ensureSpace(height);
      section(title);
      rows.forEach(([label, value]) => row(label, value));
    };
    doc.font('Helvetica-Bold').fontSize(18).text('Contrato digital de servicios', { align: 'center' });
    doc.moveDown();
    row('Versión', version);
    row('Fecha de generación (Chile)', new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' }));
    section('Cliente');
    row('Nombre', snapshot.cliente.nombre);
    row('RUT', snapshot.cliente.rut);
    row('Correo electrónico', snapshot.cliente.email);
    row('Teléfono', snapshot.cliente.telefono);
    section('Condiciones comerciales');
    row('Empresa', snapshot.comercial.empresa);
    row('Plan', snapshot.comercial.plan);
    row('Velocidad del plan', snapshot.comercial.velocidad ? snapshot.comercial.velocidad + ' Mbps' : null);
    row('Precio mensual', snapshot.comercial.precio !== null ? '$' + snapshot.comercial.precio.toLocaleString('es-CL') : null);
    row('Día de vencimiento', snapshot.comercial.vencimiento);
    row('Estado del contrato', snapshot.comercial.estado);
    row('Zona de pago', snapshot.comercial.zona);
    if (!snapshot.servicios.length) {
      section('Servicio contratado');
      row('Dirección de instalación', snapshot.direccion);
      row('Datos de instalación', 'Todavía no registrados');
    }
    snapshot.servicios.forEach((rows, index) => block('Servicio contratado ' + (index + 1), rows));
    block('Información del documento', [
      ['Datos técnicos', 'Corresponden a la información registrada al generar esta versión.'],
      ['Equipos físicos', 'La asignación de equipos se consulta en el registro de inventario.'],
      ['Firma', mode === 'automatic'
        ? 'La aceptación por correo se registra en una constancia de firma electrónica simple. Este documento no incorpora firma electrónica avanzada.'
        : mode === 'manual' ? 'El estado de firma se gestiona manualmente en el CRM. Este documento no incorpora firma electrónica avanzada.'
        : 'Documento pendiente de autorización del modo de firma. No incorpora firma electrónica avanzada.'],
    ]);
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
