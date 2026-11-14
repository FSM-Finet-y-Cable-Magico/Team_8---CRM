import { assertNoContractDebt, auditContractDebtRejection, ContractDebtException } from './contract-debt.guard';
import { inspectPrivateSignatureSchema } from './signature-schema';
import { signatureRepository, signatureStorageAvailable, SignatureRow } from './signature.repository';
import { assignAutomatic, assertPendingSignature, resolveSignatureMode } from './signature-policy';
import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { MailDeliveryError, MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildContractSnapshot, canonicalSnapshot } from './contract-snapshot';
import { ContractsService } from './contracts.service';
import { requireSignatureSettings, signatureSettings, SIGNATURE_CONSENT, SIGNATURE_CONSENT_VERSION } from './e-signature.config';

type Failure = { failure: string };
type Tx = Prisma.TransactionClient;
const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const failure = (message: string): Failure => ({ failure: message });
const isFailure = (v: unknown): v is Failure => !!v && typeof v === 'object' && 'failure' in v;
export function sameSnapshot(a: unknown, b: unknown) { return canonicalSnapshot(a) === canonicalSnapshot(b); }

@Injectable()
export class ESignatureService implements OnModuleInit {
  constructor(private readonly db: PrismaService, private readonly config: ConfigService,
    private readonly mail: MailService, private readonly audit: AuditService, private readonly contracts: ContractsService) {}

  private async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await this.db.$transaction(work, { timeout: 20000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034'
          || error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code)));
        if (!retryable) throw error;
      }
    }
    throw new ConflictException('Otra operación actualizó el contrato. Inténtalo nuevamente');
  }

  async signedPdf(idContrato: number, actor: AuthUser) {
    await this.authorize(this.db, idContrato, actor);
    if (!await signatureStorageAvailable(this.db)) throw new NotFoundException('Documento no disponible');
    const row = await signatureRepository(this.db).findFirst({ where: { idContrato, estado: 'FIRMADA' }, orderBy: { firmaFecha: 'desc' } });
    if (!row?.pdfFirmado || !await this.validReferences(this.db, row) || digest(row.pdfFirmado) !== row.hashFirmado) throw new NotFoundException('Documento no disponible');
    return row.pdfFirmado;
  }

  async onModuleInit() {
    const settings = signatureSettings(this.config);
    if (!settings) return; // No table access, file access, SMTP or external calls when off.
    if (settings.companies.some(id => !this.mail.isConfigured(id))) throw new Error('CONTRACT_SIGNATURE_SMTP_REQUIRED');
    try {
      const storage = await inspectPrivateSignatureSchema(this.db);
      if (!storage.ready) throw new Error('PRIVATE_SIGNATURE_SCHEMA_NOT_READY');
    } catch { throw new Error('CONTRACT_SIGNATURE_SCHEMA_NOT_READY'); }
    this.contracts.setAutomaticSignatureDelivery(async (id, actor) => {
      const state = await this.status(id, actor);
      if (state.enabled && state.sendAllowed && state.policy.mode === 'automatic') await this.create(id, actor);
    });
  }

  async status(idContrato: number, actor: AuthUser) {
    return this.transaction(async tx => {
      await this.lock(tx, idContrato);
      const contract = await this.authorize(tx, idContrato, actor);
      await assignAutomatic(tx, contract, this.config, actor.idUsuario);
      const mode = await resolveSignatureMode(tx, contract, this.config);
      let settings: ReturnType<typeof signatureSettings> = null;
      let configurationReason: string | null = null;
      try { settings = signatureSettings(this.config); }
      catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('CONTRACT_SIGNATURE_')) throw error;
        configurationReason = error.message === 'CONTRACT_SIGNATURE_PUBLIC_URL_INVALID'
          ? 'La dirección pública de firma no está configurada de forma segura. Solicita revisión al administrador.'
          : 'La configuración de firma requiere revisión del administrador antes de habilitar envíos.';
      }
      const storage = await signatureStorageAvailable(tx);
      const authorizedCompany = !!settings && settings.companies.includes(contract.idEmpresa!);
      const mailReady = mode === 'automatic' && authorizedCompany && storage && this.mail.isConfigured(contract.idEmpresa!);
      const available = mode === 'automatic' && authorizedCompany && storage && mailReady;
      const latest = await tx.contratoDigital.findFirst({ where: { idContrato }, orderBy: { version: 'desc' } });
      let financialReason: string | null = null;
      if (mode !== 'unknown' && contract.estado === 'Pendiente firma contrato') {
        try { await assertNoContractDebt(tx, { idEmpresa: contract.idEmpresa, idCliente: contract.idCliente,
          idContrato, idProspecto: contract.idProspecto ?? undefined,
          rut: contract.cliente?.rut ?? contract.prospecto?.rut, idUsuario: actor.idUsuario }); }
        catch (error) {
          if (!(error instanceof ContractDebtException)) throw error;
          financialReason = error.reason === 'DEUDA_PENDIENTE'
            ? 'Existe deuda pendiente en esta empresa. Regulariza el saldo antes de enviar o confirmar la firma.'
            : 'Se requiere revisión financiera en esta empresa antes de enviar o confirmar la firma.';
        }
      }
      const manualAllowed = mode === 'manual' && !financialReason && contract.estado === 'Pendiente firma contrato'
        && !!latest && latest.idEmpresa === contract.idEmpresa && ['Generado','Enviado','Firmado manualmente'].includes(latest.estadoFirma);
      const repo = signatureRepository(tx);
      const row = storage ? await repo.findFirst({ where: { idContrato, idEmpresa: contract.idEmpresa!, estado: 'FIRMADA' }, orderBy: { firmaFecha: 'desc' } })
        ?? await repo.findFirst({ where: { idContrato, idEmpresa: contract.idEmpresa! }, orderBy: { documento: { version: 'desc' } } }) : null;
      const email = contract.cliente?.email ?? contract.prospecto?.email;
      let reason: string | null = mode === 'unknown'
        ? 'El contrato no tiene una modalidad de firma autorizada. Solicita su asignación al administrador.'
        : mode === 'automatic' && configurationReason ? configurationReason
        : mode === 'automatic' && !settings ? 'La firma por correo está deshabilitada en este entorno; generar un PDF no envía una solicitud.'
        : mode === 'automatic' && !authorizedCompany ? 'Esta empresa no está habilitada para firma por correo.'
        : mode === 'automatic' && !storage ? 'La firma por correo no está disponible: falta completar su habilitación segura. Solicita revisión al administrador.'
        : mode === 'automatic' && !mailReady ? 'El correo de esta empresa no está configurado para enviar solicitudes de firma.'
        : financialReason;
      if (!reason && contract.estado === 'Pendiente firma contrato') {
        if (!latest) reason = 'Genera un PDF vigente del contrato antes de continuar con la firma.';
        else if (latest.idEmpresa !== contract.idEmpresa || !['Generado','Enviado','Firmado manualmente'].includes(latest.estadoFirma)
          || mode === 'automatic' && latest.fechaFirma) {
          reason = 'El documento no está vigente para una firma pendiente. Revisa el contrato y sus versiones.';
        } else if (mode === 'automatic') {
          if (!row || row.idContratoDigital !== latest.idContratoDigital || row.idEmpresa !== contract.idEmpresa) {
            reason = 'Genera una nueva versión del PDF para preparar su solicitud de firma por correo.';
          } else if (row.estado === 'PENDIENTE' && row.fechaExpiracion.getTime() <= Date.now()) {
            reason = 'El enlace de firma expiró. Genera una nueva versión del PDF para continuar.';
          } else if (!['BORRADOR','PENDIENTE'].includes(row.estado) || latest.estadoFirma === 'Firmado manualmente') {
            reason = 'La solicitud no admite un nuevo envío. Revisa su estado antes de generar otra versión.';
          } else if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            reason = 'Registra un correo válido del titular antes de enviar el contrato a firma.';
          }
        }
      } else if (!reason && !['Firmado','Activo','Suspendido','Moroso'].includes(contract.estado)) {
        reason = 'El contrato no está pendiente de firma. Revisa su estado comercial.';
      }
      const sendAllowed = available && !reason && contract.estado === 'Pendiente firma contrato' && !!latest && !!row
        && row.idContratoDigital === latest.idContratoDigital && row.idEmpresa === contract.idEmpresa
        && ['Generado','Enviado'].includes(latest.estadoFirma) && !latest.fechaFirma
        && (row.estado === 'BORRADOR' || row.estado === 'PENDIENTE' && row.fechaExpiracion.getTime() > Date.now());
      return { enabled: available, sendAllowed, policy: { mode, available, manualAllowed, reason },
        solicitud: row ? { idSolicitud: row.idSolicitud, estado: row.estado, correoEstado: row.correoEstado,
          fechaExpiracion: row.fechaExpiracion, firmaFecha: row.firmaFecha, firmaCorreoEstado: row.firmaCorreoEstado } : null,
        signedDownloadAvailable: row?.estado === 'FIRMADA' };
    });
  }

  private async validReferences(tx: Tx, row: SignatureRow) {
    const contract = await tx.contrato.findUnique({ where: { idContrato: row.idContrato }, select: { idEmpresa: true } });
    const doc = await tx.contratoDigital.findUnique({ where: { idContratoDigital: row.idContratoDigital },
      select: { idContrato: true, idEmpresa: true, version: true } });
    return contract?.idEmpresa === row.idEmpresa && doc?.idContrato === row.idContrato
      && doc.idEmpresa === row.idEmpresa && doc.version === row.version;
  }

  private async authorize(tx: Tx, idContrato: number, actor: AuthUser) {
    const contract = await tx.contrato.findUnique({ where: { idContrato }, select: {
      idContrato: true, idEmpresa: true, idCliente: true, idProspecto: true, estado: true,
      cliente: { select: { rut: true, email: true } }, prospecto: { select: { rut: true, email: true } },
    } });
    if (!contract || (!isAdministrator(actor.roles) && (!actor.idEmpresa || contract.idEmpresa !== actor.idEmpresa))) {
      throw new NotFoundException('Contrato no encontrado');
    }
    return contract;
  }

  private async lock(tx: Tx, idContrato: number) {
    await tx.$queryRaw`SELECT id_contrato FROM contrato WHERE id_contrato = ${idContrato} FOR UPDATE`;
  }

  async create(idContrato: number, actor: AuthUser) {
    const settings = requireSignatureSettings(this.config);
    await this.authorize(this.db, idContrato, actor);
    const token = randomBytes(32).toString('base64url');
    const result = await this.transaction(async tx => {
      await this.lock(tx, idContrato);
      const contract = await this.authorize(tx, idContrato, actor);
      if (!contract.idEmpresa || !settings.companies.includes(contract.idEmpresa)) throw new BadRequestException('Empresa no habilitada para firma');
      assertPendingSignature(contract.estado);
      await assignAutomatic(tx, contract, this.config, actor.idUsuario);
      if (await resolveSignatureMode(tx, contract, this.config) !== 'automatic') throw new ConflictException('Contrato no asignado a firma automática');
      await assertNoContractDebt(tx, { idEmpresa: contract.idEmpresa, idCliente: contract.idCliente,
        idContrato, idProspecto: contract.idProspecto ?? undefined,
        rut: contract.cliente?.rut ?? contract.prospecto?.rut, idUsuario: actor.idUsuario });
      if (!await signatureStorageAvailable(tx)) throw new ConflictException('Almacenamiento de firma no disponible');
      const latest = await tx.contratoDigital.findFirst({ where: { idContrato }, orderBy: { version: 'desc' },
        select: { idContratoDigital: true, idEmpresa: true, version: true, hashDocumento: true, estadoFirma: true, fechaFirma: true } });
      if (!latest || latest.idEmpresa !== contract.idEmpresa || !['Generado','Enviado'].includes(latest.estadoFirma) || latest.fechaFirma) throw new ConflictException('Genera un PDF vigente sin firmar');
      const row = await signatureRepository(tx).findUnique({ where: { idContratoDigital: latest.idContratoDigital } });
      if (!row || !await this.validReferences(tx, row)) throw new ConflictException('Regenera el PDF para conservar sus datos de firma');
      if (row.estado === 'PENDIENTE' && row.fechaExpiracion.getTime() <= Date.now()) {
        await this.invalidate(tx, row, 'PLAZO_CUMPLIDO', true); return failure('El enlace expiró. Genera una nueva versión');
      }
      if (row.estado === 'PENDIENTE') return { existing: true as const, row };
      if (row.estado !== 'BORRADOR') throw new ConflictException('Genera una nueva versión para reenviar a firma');
      const snapshot = await buildContractSnapshot(tx, idContrato, true);
      if (!sameSnapshot(snapshot, row.datosSnapshot) || row.hashOriginal !== latest.hashDocumento
        || digest(row.pdfOriginal) !== row.hashOriginal) {
        await this.invalidate(tx, row, 'DATOS_CAMBIADOS');
        return failure('Los datos cambiaron. Genera un nuevo PDF antes de enviar a firma');
      }
      if (!this.mail.isConfigured(row.idEmpresa)) throw new BadRequestException('Correo de empresa no configurado');
      const now = new Date();
      const updated = await signatureRepository(tx).update({ where: { idSolicitud: row.idSolicitud }, data: {
        estado: 'PENDIENTE', tokenHash: digest(token), destinatario: snapshot.cliente.email!,
        fechaCreacion: now, fechaExpiracion: new Date(now.getTime() + 48 * 3600000), correoEstado: 'EN_PROCESO',
      } });
      await this.audit.record({ idUsuario: actor.idUsuario, accion: 'SOLICITAR_FIRMA_CONTRATO',
        entidadAfectada: 'contrato', idEntidadAfectada: idContrato,
        valorNuevo: { modo: 'automatic' } }, tx);
      return { existing: false as const, row: updated };
    }).catch(error => auditContractDebtRejection(this.db, this.audit, error));
    if (isFailure(result)) throw new ConflictException(result.failure);
    if (!result.existing) {
      let estado = 'INDETERMINADO';
      try {
        const sent = await this.mail.sendSignatureInvitation({ idEmpresa: result.row.idEmpresa,
          to: result.row.destinatario, link: settings.url + '/firmar#' + token });
        estado = sent.status === 'sent' ? 'ENVIADO' : sent.status === 'simulated' && settings.test ? 'SIMULADO' : 'FALLIDO';
      } catch { /* Never log SMTP responses, links or recipient addresses. */ }
      await signatureRepository(this.db).updateMany({ where: { idSolicitud: result.row.idSolicitud,
        estado: 'PENDIENTE', tokenHash: digest(token) }, data: { correoEstado: estado } });
    }
    return this.status(idContrato, actor); // Never return bearer tokens to internal callers.
  }

  async cancel(idContrato: number, actor: AuthUser) {
    requireSignatureSettings(this.config);
    return this.transaction(async tx => {
      await this.lock(tx, idContrato);
      await this.authorize(tx, idContrato, actor);
      const count = await signatureRepository(tx).updateMany({ where: { idContrato, estado: 'PENDIENTE' },
        data: { estado: 'ANULADA', motivoAnulacion: 'OPERADOR', otpHash: null } });
      await this.audit.record({ idUsuario: actor.idUsuario, accion: 'ANULAR_SOLICITUD_FIRMA',
        entidadAfectada: 'contrato', idEntidadAfectada: idContrato, valorNuevo: { solicitudes: count.count } }, tx);
      return { anuladas: count.count };
    });
  }

  private async invalidate(tx: Tx, row: SignatureRow, reason: string, expired = false) {
    await signatureRepository(tx).update({ where: { idSolicitud: row.idSolicitud }, data: {
      estado: expired ? 'EXPIRADA' : 'ANULADA', motivoAnulacion: reason, otpHash: null,
    } });
    await this.audit.record({ accion: 'INVALIDAR_SOLICITUD_FIRMA', entidadAfectada: 'contrato',
      idEntidadAfectada: row.idContrato, valorNuevo: { motivo: reason } }, tx);
  }

  private async withToken<T>(token: string, action: (tx: Tx, row: SignatureRow) => Promise<T | Failure>): Promise<T> {
    const settings = requireSignatureSettings(this.config);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundException('Enlace no disponible');
    const found = await signatureRepository(this.db).findUnique({ where: { tokenHash: digest(token) },
      select: { idContrato: true, idSolicitud: true } });
    if (!found) throw new NotFoundException('Enlace no disponible');
    const result = await this.transaction(async tx => {
      await this.lock(tx, found.idContrato);
      const row = await signatureRepository(tx).findUnique({ where: { idSolicitud: found.idSolicitud } });
      if (!row || !settings.companies.includes(row.idEmpresa) || row.tokenHash !== digest(token) || !await this.validReferences(tx, row)) return failure('Enlace no disponible');
      if (row.estado === 'ANULADA' && row.motivoAnulacion === 'CONTRATO_CANCELADO') return failure('Este contrato fue cancelado. El enlace de firma ya no está disponible.');
      if (row.estado !== 'FIRMADA' && row.estado !== 'PENDIENTE') return failure('Solicitud no vigente. Contacta a la empresa');
      if (row.fechaExpiracion.getTime() <= Date.now()) {
        if (row.estado === 'PENDIENTE') await this.invalidate(tx, row, 'PLAZO_CUMPLIDO', true);
        return failure('El enlace expiró. Contacta a la empresa');
      }
      if (row.estado === 'PENDIENTE') {
        const current = await tx.contrato.findUniqueOrThrow({ where: { idContrato: row.idContrato } });
        if (current.estado !== 'Pendiente firma contrato' || await resolveSignatureMode(tx, current, this.config) !== 'automatic') {
          await this.invalidate(tx, row, 'CONTRATO_NO_ELEGIBLE'); return failure('Contrato no elegible para firma');
        }
        let snapshot;
        try { snapshot = await buildContractSnapshot(tx, row.idContrato, true); }
        catch (error) {
          if (!(error instanceof BadRequestException || error instanceof NotFoundException)) throw error;
          await this.invalidate(tx, row, 'DATOS_CAMBIADOS');
          return failure('Los datos cambiaron. Solicita un nuevo documento');
        }
        const latest = await tx.contratoDigital.findFirst({ where: { idContrato: row.idContrato }, orderBy: { version: 'desc' },
          select: { idContratoDigital: true, hashDocumento: true, fechaFirma: true, estadoFirma: true } });
        if (snapshot.idEmpresa !== row.idEmpresa || !sameSnapshot(snapshot, row.datosSnapshot)
            || latest?.idContratoDigital !== row.idContratoDigital || latest.hashDocumento !== row.hashOriginal
            || latest.fechaFirma || !['Generado','Enviado'].includes(latest.estadoFirma)
            || digest(row.pdfOriginal) !== row.hashOriginal) {
          await this.invalidate(tx, row, 'DATOS_CAMBIADOS');
          return failure('Los datos cambiaron. Solicita un nuevo documento');
        }
      }
      return action(tx, row);
    });
    if (isFailure(result)) throw new ConflictException(result.failure);
    return result;
  }

  view(token: string) {
    return this.withToken(token, async (_tx, row) => ({ estado: row.estado, hashOriginal: row.hashOriginal,
      hashFirmado: row.hashFirmado, vence: row.fechaExpiracion, firmado: row.firmaFecha,
      correo: row.destinatario.replace(/^(.).+(@.+)$/, '$1***$2'), consentimiento: SIGNATURE_CONSENT,
      consentimientoVersion: SIGNATURE_CONSENT_VERSION }));
  }

  pdf(token: string) {
    return this.withToken(token, async (tx, row) => {
      if (row.estado === 'FIRMADA') {
        if (!row.pdfFirmado || digest(row.pdfFirmado) !== row.hashFirmado) return failure('Documento no disponible');
        return row.pdfFirmado;
      }
      await signatureRepository(tx).update({ where: { idSolicitud: row.idSolicitud }, data: { pdfVisto: new Date() } });
      return row.pdfOriginal;
    });
  }

  async requestCode(token: string) {
    const settings = requireSignatureSettings(this.config);
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const prepared = await this.withToken(token, async (tx, row) => {
      if (row.estado === 'FIRMADA') return failure('La solicitud ya fue firmada');
      if (!row.pdfVisto) return failure('Descarga y revisa el PDF antes de solicitar el código');
      if (row.otpEnvios >= 5 || row.otpIntentos >= 5 || row.otpSolicitado && Date.now() - row.otpSolicitado.getTime() < 60000) {
        return failure('Límite de códigos alcanzado o espera de 60 segundos pendiente');
      }
      const hash = this.otpHash(row.idSolicitud, code);
      await signatureRepository(tx).update({ where: { idSolicitud: row.idSolicitud }, data: {
        otpHash: hash, otpExpiracion: new Date(Date.now() + 10 * 60000), otpSolicitado: new Date(),
        otpEnvios: { increment: 1 }, correoEstado: 'EN_PROCESO',
      } });
      return { row, hash };
    });
    let estado = 'INDETERMINADO';
    try {
      const sent = await this.mail.sendSignatureCode({ idEmpresa: prepared.row.idEmpresa,
        to: prepared.row.destinatario, code });
      estado = sent.status === 'sent' ? 'ENVIADO' : sent.status === 'simulated' && settings.test ? 'SIMULADO' : 'FALLIDO';
    } catch { /* Unknown delivery is never automatically retried. */ }
    await signatureRepository(this.db).updateMany({ where: { idSolicitud: prepared.row.idSolicitud,
      otpHash: prepared.hash, estado: 'PENDIENTE' }, data: { correoEstado: estado,
        ...(!['ENVIADO', 'SIMULADO'].includes(estado) ? { otpHash: null } : {}) } });
    if (!['ENVIADO', 'SIMULADO'].includes(estado)) throw new ConflictException('No se confirmó el envío. Espera antes de solicitar otro código');
    return { enviado: true, expiraEnSegundos: 600 };
  }

  private otpHash(id: string, code: string) {
    return createHmac('sha256', requireSignatureSettings(this.config).secret).update(id + ':' + code).digest('hex');
  }

  async sign(token: string, _code: string, hashOriginal: string, consent: boolean, consentVersion: string, ip: string, agent: string) {
    if (!consent || consentVersion !== SIGNATURE_CONSENT_VERSION || !/^[a-f0-9]{64}$/.test(hashOriginal)
        ) throw new BadRequestException('Revisa el documento y acepta sus condiciones');
    const result = await this.withToken(token, async (tx, row) => {
      if (hashOriginal !== row.hashOriginal) return failure('El PDF revisado no coincide');
      if (row.estado === 'FIRMADA') return { estado: 'FIRMADA', idSolicitud: row.idSolicitud };
      if (!row.pdfVisto) return failure('Revisa el contrato antes de firmar');
      if (!(row.correoEstado === 'ENVIADO' || row.correoEstado === 'SIMULADO' && requireSignatureSettings(this.config).test)) return failure('La entrega del enlace personal no está confirmada');
      const signedAt = new Date();
      const pdf = await this.seal(row, signedAt);
      const actor: AuthUser = { idUsuario: row.idUsuarioCreador, idEmpresa: row.idEmpresa, roles: ['Comercial'],
        nombreCompleto: 'Aceptación por correo', email: null };
      await this.contracts.markContractSigned(tx, row.idContrato, { kind: 'electronic', actor });
      await tx.contratoDigital.update({ where: { idContratoDigital: row.idContratoDigital }, data: {
        estadoFirma: 'Firmado electronicamente', fechaFirma: signedAt,
      }, select: { idContratoDigital: true } });
      await signatureRepository(tx).update({ where: { idSolicitud: row.idSolicitud }, data: {
        estado: 'FIRMADA', firmaFecha: signedAt, firmaIp: /^[a-fA-F0-9:.]{1,45}$/.test(ip) ? ip : null,
        firmaUserAgent: agent.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200),
        consentimientoVersion: SIGNATURE_CONSENT_VERSION, otpHash: null, pdfFirmado: pdf, hashFirmado: digest(pdf),
      } });
      await this.audit.record({ accion: 'FIRMAR_CONTRATO_CORREO', entidadAfectada: 'contrato',
        idEntidadAfectada: row.idContrato, valorNuevo: { estado: 'Firmado', origenFirma: 'electronic' } }, tx);
      return { estado: 'FIRMADA', idSolicitud: row.idSolicitud };
    }).catch(error => auditContractDebtRejection(this.db, this.audit, error));
    try { await this.deliverSigned(result.idSolicitud); } catch { /* A delivery/status failure cannot undo a committed signature. */ }
    return { estado: result.estado };
  }

  private async seal(row: SignatureRow, when: Date) {
    const pdf = await PDFDocument.load(row.pdfOriginal, { updateMetadata: false });
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([595.28, 841.89]);
    const printable = (v: string) => Array.from(v).map(character => {
      try { font.encodeText(character); return character; } catch { return '?'; }
    }).join('');
    const lines = ['Constancia de firma electrónica simple', 'Aceptación mediante enlace personal enviado al correo registrado.',
      'Solicitud: ' + row.idSolicitud, 'Fecha UTC: ' + when.toISOString(),
      'Correo: ' + row.destinatario, 'SHA-256 del PDF original:', row.hashOriginal,
      'SHA-256 de los datos congelados:', digest(canonicalSnapshot(row.datosSnapshot)),
      'Consentimiento: ' + SIGNATURE_CONSENT_VERSION, SIGNATURE_CONSENT,
      'Esta constancia no constituye una firma electrónica avanzada.'];
    let y = 785;
    for (const line of lines) {
      const clean = printable(line);
      let remaining = clean;
      while (remaining.length) {
        let length = 1;
        while (length < remaining.length && font.widthOfTextAtSize(remaining.slice(0, length + 1), 10) <= 505) length++;
        if (length < remaining.length) { const space = remaining.lastIndexOf(' ', length); if (space > 0) length = space; }
        if (y < 50) throw new BadRequestException('La constancia excede el tamaño permitido');
        page.drawText(remaining.slice(0, length).trimEnd(), { x: 45, y, font, size: 10 });
        remaining = remaining.slice(length).trimStart(); y -= 16;
      }
      y -= 8;
    }
    const sealed = Buffer.from(await pdf.save({ useObjectStreams: false }));
    if (sealed.length > 5 * 1024 * 1024) throw new BadRequestException('La constancia supera el límite de entrega de 5 MiB');
    return sealed;
  }

  async retryDelivery(idContrato: number, actor: AuthUser) {
    const settings = requireSignatureSettings(this.config);
    const row = await this.transaction(async tx => {
      await this.lock(tx, idContrato);
      const contract = await this.authorize(tx, idContrato, actor);
      if (!contract.idEmpresa || !settings.companies.includes(contract.idEmpresa) || !this.mail.isConfigured(contract.idEmpresa)) {
        throw new ConflictException('Empresa no habilitada para entrega de firma');
      }
      const saved = await signatureRepository(tx).findFirst({ where: { idContrato, estado: 'FIRMADA' }, orderBy: { firmaFecha: 'desc' } });
      if (!saved || !await this.validReferences(tx, saved) || saved.firmaCorreoEstado !== 'FALLIDO') {
        throw new ConflictException('Solo puede reintentarse un correo con rechazo confirmado. Revisa los resultados inciertos sin reenviar.');
      }
      await signatureRepository(tx).update({ where: { idSolicitud: saved.idSolicitud }, data: { firmaCorreoEstado: 'PENDIENTE' } });
      await this.audit.record({ idUsuario: actor.idUsuario, accion: 'REINTENTAR_ENTREGA_CONTRATO', entidadAfectada: 'contrato', idEntidadAfectada: idContrato }, tx);
      return saved;
    });
    await this.deliverSigned(row.idSolicitud); return this.status(idContrato, actor);
  }

  private async deliverSigned(idSolicitud: string) {
    // Recheck availability and company before any claim or external send.
    const settings = requireSignatureSettings(this.config);
    const prepared = await signatureRepository(this.db).findUniqueOrThrow({ where: { idSolicitud } });
    if (!settings.companies.includes(prepared.idEmpresa) || !await this.validReferences(this.db, prepared)) {
      throw new ConflictException('Empresa o documento no habilitado para entrega');
    }
    // Durable one-shot claim: uncertain SMTP results or process crashes are not retried by a replay.
    const claim = await signatureRepository(this.db).updateMany({ where: { idSolicitud, estado: 'FIRMADA',
      firmaCorreoEstado: 'PENDIENTE' }, data: { firmaCorreoEstado: 'EN_PROCESO' } });
    if (!claim.count) return;
    const row = await signatureRepository(this.db).findUniqueOrThrow({ where: { idSolicitud } });
    let estado = 'INDETERMINADO';
    try {
      const sent = await this.mail.sendSignedContract({ idEmpresa: row.idEmpresa, to: row.destinatario,
        pdf: row.pdfFirmado!, filename: 'contrato-firmado.pdf' });
      const settings = requireSignatureSettings(this.config);
      estado = sent.status === 'sent' ? 'ENVIADO' : sent.status === 'simulated' && settings.test ? 'SIMULADO' : 'FALLIDO';
    } catch (error) { estado = error instanceof MailDeliveryError && error.confirmedNotAccepted ? 'FALLIDO' : 'INDETERMINADO'; }
    await signatureRepository(this.db).updateMany({ where: { idSolicitud, firmaCorreoEstado: 'EN_PROCESO' },
      data: { firmaCorreoEstado: estado } });
  }
}
