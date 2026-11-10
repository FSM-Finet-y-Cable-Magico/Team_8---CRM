import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SolicitudFirmaContrato } from '@prisma/client';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { MailService } from '../mail/mail.service';
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
    requireSignatureSettings(this.config);
    await this.authorize(this.db, idContrato, actor);
    const row = await this.db.solicitudFirmaContrato.findFirst({ where: { idContrato, estado: 'FIRMADA' }, orderBy: { firmaFecha: 'desc' } });
    if (!row?.pdfFirmado || digest(row.pdfFirmado) !== row.hashFirmado) throw new NotFoundException('Documento no disponible');
    return row.pdfFirmado;
  }

  async onModuleInit() {
    const settings = signatureSettings(this.config);
    if (!settings) return; // No table access, file access, SMTP or external calls when off.
    if (settings.companies.some(id => !this.mail.isConfigured(id))) throw new Error('CONTRACT_SIGNATURE_SMTP_REQUIRED');
    try {
      // Explicitly validate the new schema only after activation was requested.
      await this.db.solicitudFirmaContrato.findFirst({ select: { idSolicitud: true, datosSnapshot: true,
        otpIntentos: true, pdfFirmado: true, firmaCorreoEstado: true } });
    } catch { throw new Error('CONTRACT_SIGNATURE_SCHEMA_NOT_READY'); }
  }

  async status(idContrato: number, actor: AuthUser) {
    const settings = signatureSettings(this.config);
    if (!settings) return { enabled: false, solicitud: null };
    const contract = await this.authorize(this.db, idContrato, actor);
    const select = { idSolicitud: true, estado: true, correoEstado: true, fechaExpiracion: true,
      firmaFecha: true, firmaCorreoEstado: true } satisfies Prisma.SolicitudFirmaContratoSelect;
    const signed = await this.db.solicitudFirmaContrato.findFirst({ where: { idContrato, estado: 'FIRMADA' },
      orderBy: { firmaFecha: 'desc' }, select });
    const row = signed ?? await this.db.solicitudFirmaContrato.findFirst({ where: { idContrato },
      orderBy: { documento: { version: 'desc' } }, select });
    return { enabled: settings.companies.includes(contract.idEmpresa!), solicitud: row };
  }

  private async authorize(tx: Tx, idContrato: number, actor: AuthUser) {
    const contract = await tx.contrato.findUnique({ where: { idContrato }, select: { idContrato: true, idEmpresa: true, estado: true } });
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
      if (['Firmado', 'Activo', 'Moroso', 'Suspendido', 'Anulado', 'Baja'].includes(contract.estado)) throw new ConflictException('El contrato no está pendiente de firma');
      const latest = await tx.contratoDigital.findFirst({ where: { idContrato }, orderBy: { version: 'desc' },
        select: { idContratoDigital: true, hashDocumento: true, estadoFirma: true, fechaFirma: true } });
      if (!latest || latest.fechaFirma || /^firmad[oa]/iu.test(latest.estadoFirma)) throw new ConflictException('Genera un PDF vigente sin firmar');
      const row = await tx.solicitudFirmaContrato.findUnique({ where: { idContratoDigital: latest.idContratoDigital } });
      if (!row) throw new ConflictException('Regenera el PDF para conservar sus datos de firma');
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
      const updated = await tx.solicitudFirmaContrato.update({ where: { idSolicitud: row.idSolicitud }, data: {
        estado: 'PENDIENTE', tokenHash: digest(token), destinatario: snapshot.cliente.email!,
        fechaCreacion: now, fechaExpiracion: new Date(now.getTime() + 48 * 3600000), correoEstado: 'EN_PROCESO',
      } });
      await this.audit.record({ idUsuario: actor.idUsuario, accion: 'SOLICITAR_FIRMA_CONTRATO',
        entidadAfectada: 'contrato', idEntidadAfectada: idContrato,
        valorNuevo: { idSolicitud: row.idSolicitud, hashOriginal: row.hashOriginal } }, tx);
      return { existing: false as const, row: updated };
    });
    if (isFailure(result)) throw new ConflictException(result.failure);
    if (!result.existing) {
      let estado = 'INDETERMINADO';
      try {
        const sent = await this.mail.sendSignatureInvitation({ idEmpresa: result.row.idEmpresa,
          to: result.row.destinatario, link: settings.url + '/firmar#' + token });
        estado = sent.status === 'sent' ? 'ENVIADO' : sent.status === 'simulated' && settings.test ? 'SIMULADO' : 'FALLIDO';
      } catch { /* Never log SMTP responses, links or recipient addresses. */ }
      await this.db.solicitudFirmaContrato.updateMany({ where: { idSolicitud: result.row.idSolicitud,
        estado: 'PENDIENTE', tokenHash: digest(token) }, data: { correoEstado: estado } });
    }
    return this.status(idContrato, actor); // Never return bearer tokens to internal callers.
  }

  async cancel(idContrato: number, actor: AuthUser) {
    requireSignatureSettings(this.config);
    return this.transaction(async tx => {
      await this.lock(tx, idContrato);
      await this.authorize(tx, idContrato, actor);
      const count = await tx.solicitudFirmaContrato.updateMany({ where: { idContrato, estado: 'PENDIENTE' },
        data: { estado: 'ANULADA', motivoAnulacion: 'OPERADOR', otpHash: null } });
      await this.audit.record({ idUsuario: actor.idUsuario, accion: 'ANULAR_SOLICITUD_FIRMA',
        entidadAfectada: 'contrato', idEntidadAfectada: idContrato, valorNuevo: { solicitudes: count.count } }, tx);
      return { anuladas: count.count };
    });
  }

  private async invalidate(tx: Tx, row: SolicitudFirmaContrato, reason: string, expired = false) {
    await tx.solicitudFirmaContrato.update({ where: { idSolicitud: row.idSolicitud }, data: {
      estado: expired ? 'EXPIRADA' : 'ANULADA', motivoAnulacion: reason, otpHash: null,
    } });
    await this.audit.record({ accion: 'INVALIDAR_SOLICITUD_FIRMA', entidadAfectada: 'contrato',
      idEntidadAfectada: row.idContrato, valorNuevo: { idSolicitud: row.idSolicitud, motivo: reason } }, tx);
  }

  private async withToken<T>(token: string, action: (tx: Tx, row: SolicitudFirmaContrato) => Promise<T | Failure>): Promise<T> {
    const settings = requireSignatureSettings(this.config);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundException('Enlace no disponible');
    const found = await this.db.solicitudFirmaContrato.findUnique({ where: { tokenHash: digest(token) },
      select: { idContrato: true, idSolicitud: true } });
    if (!found) throw new NotFoundException('Enlace no disponible');
    const result = await this.transaction(async tx => {
      await this.lock(tx, found.idContrato);
      const row = await tx.solicitudFirmaContrato.findUnique({ where: { idSolicitud: found.idSolicitud } });
      if (!row || !settings.companies.includes(row.idEmpresa) || row.tokenHash !== digest(token)) return failure('Enlace no disponible');
      if (row.estado !== 'FIRMADA' && row.estado !== 'PENDIENTE') return failure('Solicitud no vigente. Contacta a la empresa');
      if (row.fechaExpiracion.getTime() <= Date.now()) {
        if (row.estado === 'PENDIENTE') await this.invalidate(tx, row, 'PLAZO_CUMPLIDO', true);
        return failure('El enlace expiró. Contacta a la empresa');
      }
      if (row.estado === 'PENDIENTE') {
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
            || latest.fechaFirma || /^firmad[oa]/iu.test(latest.estadoFirma)
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
      await tx.solicitudFirmaContrato.update({ where: { idSolicitud: row.idSolicitud }, data: { pdfVisto: new Date() } });
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
      await tx.solicitudFirmaContrato.update({ where: { idSolicitud: row.idSolicitud }, data: {
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
    await this.db.solicitudFirmaContrato.updateMany({ where: { idSolicitud: prepared.row.idSolicitud,
      otpHash: prepared.hash, estado: 'PENDIENTE' }, data: { correoEstado: estado,
        ...(!['ENVIADO', 'SIMULADO'].includes(estado) ? { otpHash: null } : {}) } });
    if (!['ENVIADO', 'SIMULADO'].includes(estado)) throw new ConflictException('No se confirmó el envío. Espera antes de solicitar otro código');
    return { enviado: true, expiraEnSegundos: 600 };
  }

  private otpHash(id: string, code: string) {
    return createHmac('sha256', requireSignatureSettings(this.config).secret).update(id + ':' + code).digest('hex');
  }

  async sign(token: string, code: string, hashOriginal: string, consent: boolean, consentVersion: string, ip: string, agent: string) {
    if (!consent || consentVersion !== SIGNATURE_CONSENT_VERSION || !/^[a-f0-9]{64}$/.test(hashOriginal)
        || !/^\d{6}$/.test(code)) throw new BadRequestException('Revisa el documento, acepta sus condiciones e introduce el código');
    const result = await this.withToken(token, async (tx, row) => {
      if (hashOriginal !== row.hashOriginal) return failure('El PDF revisado no coincide');
      if (row.estado === 'FIRMADA') return { estado: 'FIRMADA', idSolicitud: row.idSolicitud };
      if (!row.pdfVisto || !row.otpHash || !row.otpExpiracion || row.otpExpiracion.getTime() <= Date.now()
          || !(row.correoEstado === 'ENVIADO' || row.correoEstado === 'SIMULADO' && requireSignatureSettings(this.config).test) || row.otpIntentos >= 5) return failure('Código no vigente');
      const expected = Buffer.from(row.otpHash, 'hex'), supplied = Buffer.from(this.otpHash(row.idSolicitud, code), 'hex');
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        await tx.solicitudFirmaContrato.update({ where: { idSolicitud: row.idSolicitud }, data: { otpIntentos: { increment: 1 } } });
        if (row.otpIntentos >= 4) await this.invalidate(tx, row, 'INTENTOS_AGOTADOS');
        return failure('Código incorrecto');
      }
      const signedAt = new Date();
      const pdf = await this.seal(row, signedAt);
      const actor: AuthUser = { idUsuario: row.idUsuarioCreador, idEmpresa: row.idEmpresa, roles: ['Comercial'],
        nombreCompleto: 'Aceptación por correo', email: null };
      await this.contracts.markContractSigned(tx, row.idContrato, { kind: 'electronic', actor });
      await tx.contratoDigital.update({ where: { idContratoDigital: row.idContratoDigital }, data: {
        estadoFirma: 'Firmado electronicamente', fechaFirma: signedAt,
      }, select: { idContratoDigital: true } });
      await tx.solicitudFirmaContrato.update({ where: { idSolicitud: row.idSolicitud }, data: {
        estado: 'FIRMADA', firmaFecha: signedAt, firmaIp: /^[a-fA-F0-9:.]{1,45}$/.test(ip) ? ip : null,
        firmaUserAgent: agent.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200),
        consentimientoVersion: SIGNATURE_CONSENT_VERSION, otpHash: null, pdfFirmado: pdf, hashFirmado: digest(pdf),
      } });
      await this.audit.record({ accion: 'FIRMAR_CONTRATO_CORREO', entidadAfectada: 'contrato',
        idEntidadAfectada: row.idContrato, valorNuevo: { idSolicitud: row.idSolicitud,
          hashOriginal: row.hashOriginal, hashFirmado: digest(pdf), consentimientoVersion: SIGNATURE_CONSENT_VERSION } }, tx);
      return { estado: 'FIRMADA', idSolicitud: row.idSolicitud };
    });
    try { await this.deliverSigned(result.idSolicitud); } catch { /* A delivery/status failure cannot undo a committed signature. */ }
    return { estado: result.estado };
  }

  private async seal(row: SolicitudFirmaContrato, when: Date) {
    const pdf = await PDFDocument.load(row.pdfOriginal, { updateMetadata: false });
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([595.28, 841.89]);
    const printable = (v: string) => Array.from(v).map(character => {
      try { font.encodeText(character); return character; } catch { return '?'; }
    }).join('');
    const lines = ['Constancia de firma electrónica simple', 'Aceptación mediante código enviado al correo registrado.',
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
    return Buffer.from(await pdf.save({ useObjectStreams: false }));
  }

  private async deliverSigned(idSolicitud: string) {
    // Durable one-shot claim: uncertain SMTP results or process crashes are not retried by a replay.
    const claim = await this.db.solicitudFirmaContrato.updateMany({ where: { idSolicitud, estado: 'FIRMADA',
      firmaCorreoEstado: 'PENDIENTE' }, data: { firmaCorreoEstado: 'EN_PROCESO' } });
    if (!claim.count) return;
    const row = await this.db.solicitudFirmaContrato.findUniqueOrThrow({ where: { idSolicitud } });
    let estado = 'INDETERMINADO';
    try {
      const sent = await this.mail.sendSignedContract({ idEmpresa: row.idEmpresa, to: row.destinatario,
        pdf: row.pdfFirmado!, filename: 'contrato-firmado.pdf' });
      const settings = requireSignatureSettings(this.config);
      estado = sent.status === 'sent' ? 'ENVIADO' : sent.status === 'simulated' && settings.test ? 'SIMULADO' : 'FALLIDO';
    } catch { /* The signature remains committed if delivery fails. */ }
    await this.db.solicitudFirmaContrato.updateMany({ where: { idSolicitud, firmaCorreoEstado: 'EN_PROCESO' },
      data: { firmaCorreoEstado: estado } });
  }
}
