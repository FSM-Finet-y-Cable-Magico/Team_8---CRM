import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { ESignatureService } from './e-signature.service';
import { SIGNATURE_CONSENT_VERSION } from './e-signature.config';
import { Prisma, PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ContractsService } from './contracts.service';

// Explicit opt-in; never fall back to DATABASE_URL or a developer's private dotenv.
// The runner must create a fresh cluster and set its independent run marker.
const qaOtpSecret = randomBytes(32).toString('hex');
const enabled = process.env.RUN_CONTRACT_SIGNATURE_PG_QA === '1';
const isolated = enabled ? describe : describe.skip;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};

isolated('Firma de contratos con PostgreSQL exclusivo y datos ficticios', () => {
  let db: PrismaClient;
  let other: PrismaClient;
  let user: AuthUser;
  let company: number;
  let otherCompany: number;

  async function attest(client: PrismaClient, database: string, runId: string) {
    const rows = await client.$queryRaw<Array<{ base: string; rol: string; marca: string; host: string }>>`
      SELECT current_database() AS base, current_user AS rol,
             current_setting('qa_signature.run_id', true) AS marca,
             inet_server_addr()::text AS host`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ base: database, rol: 'qa_contract', marca: runId });
    expect(['127.0.0.1', '127.0.0.1/32']).toContain(rows[0].host);
  }

  beforeAll(async () => {
    const raw = process.env.QA_CONTRACT_SIGNATURE_DB_URL;
    const runId = process.env.QA_CONTRACT_SIGNATURE_RUN_ID;
    if (!raw || !runId || !/^[a-f0-9]{32}$/.test(runId)) throw new Error('ISOLATED_QA_REQUIRED');
    const url = new URL(raw);
    if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '5432' ||
        url.username !== 'qa_contract' || url.pathname !== '/qa_contract_signature_' + runId ||
        url.search !== '?schema=public&connection_limit=1' || url.hash) throw new Error('ISOLATED_QA_REQUIRED');
    db = new PrismaClient({ log: [], datasources: { db: { url: raw } } });
    other = new PrismaClient({ log: [], datasources: { db: { url: raw } } });
    await attest(db, url.pathname.slice(1), runId);
    await attest(other, url.pathname.slice(1), runId);
    expect(await db.empresa.count()).toBe(0);
    expect(await db.cliente.count()).toBe(0);
    expect(await db.contrato.count()).toBe(0);
    company = (await db.empresa.create({ data: { nombre: 'QA Firma empresa A' } })).idEmpresa;
    otherCompany = (await db.empresa.create({ data: { nombre: 'QA Firma empresa B' } })).idEmpresa;
    const operator = await db.usuario.create({ data: {
      idEmpresa: company, nombreCompleto: 'Operador ficticio QA', passwordHash: 'QA_NO_LOGIN',
    } });
    user = { idUsuario: operator.idUsuario, idEmpresa: company, roles: ['Comercial'],
      nombreCompleto: 'Operador ficticio QA', email: null };
  }, 30000);

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await db?.$disconnect();
    await other?.$disconnect();
  });

  function services(client: PrismaClient) {
    const audit = new AuditService(client as PrismaService);
    const installation = { ensureInstallationServiceForContract: jest.fn() };
    const service = new ContractsService(client as PrismaService, audit, installation as never);
    return { service, audit, installation };
  }

  async function fixture(prospectOnly = false) {
    const customer = prospectOnly ? null : await db.cliente.create({ data: {
      idEmpresa: company, nombreCompleto: 'Cliente ficticio fase 0', estado: 'Pendiente firma contrato',
    } });
    const prospect = prospectOnly ? await db.prospecto.create({ data: {
      idEmpresa: company, nombreCompleto: 'Prospecto ficticio fase 0',
      direccion: 'DIRECCION FICTICIA QA', estadoPipeline: 'Pendiente firma contrato',
    } }) : null;
    const contract = await db.contrato.create({ data: {
      idEmpresa: company, idCliente: customer?.idCliente, idProspecto: prospect?.idProspecto,
      fechaInicio: new Date('2026-01-01'), diaVencimiento: 10, estado: 'Pendiente firma contrato',
      direccionInstalacion: 'DIRECCION FICTICIA QA',
    } });
    return { contract, customer, prospect };
  }

  async function signatureAudits(idContrato: number) {
    return db.logAuditoria.findMany({ where: { entidadAfectada: 'contrato',
      idEntidadAfectada: idContrato, accion: 'CONFIRMAR_FIRMA_CONTRATO_MANUAL' } });
  }

  async function document(idContrato: number) {
    return db.contratoDigital.create({ data: {
      idContrato, idEmpresa: company, version: 1, estadoFirma: 'Generado',
      hashDocumento: 'f'.repeat(64), urlDocumento: 'generated/contracts/qa-unmodified.pdf',
      idUsuarioGenerador: user.idUsuario,
    } });
  }

  it('dos confirmaciones concurrentes y su repeticion conservan una sola firma y auditoria', async () => {
    const f = await fixture();
    const first = services(db), second = services(other);
    const results = await Promise.all([
      first.service.confirmManualSignature(f.contract.idContrato, { observacion: 'Solicitud A' }, user),
      second.service.confirmManualSignature(f.contract.idContrato, { observacion: 'Solicitud B' }, user),
    ]);
    expect(results.map(r => r.estado)).toEqual(['Firmado', 'Firmado']);
    const saved = await db.contrato.findUniqueOrThrow({ where: { idContrato: f.contract.idContrato } });
    expect(saved.fechaFirmaManual).not.toBeNull();
    expect(results[0].fechaFirmaManual).toEqual(saved.fechaFirmaManual);
    expect(results[1].fechaFirmaManual).toEqual(saved.fechaFirmaManual);
    await second.service.confirmManualSignature(saved.idContrato, { observacion: 'No sobrescribir' }, user);
    expect(await db.contrato.findUniqueOrThrow({ where: { idContrato: saved.idContrato } })).toEqual(saved);
    expect(await signatureAudits(saved.idContrato)).toHaveLength(1);
    expect((await db.cliente.findUniqueOrThrow({ where: { idCliente: f.customer!.idCliente } })).estado).toBe('Pendiente Instalacion');
    expect(first.installation.ensureInstallationServiceForContract).not.toHaveBeenCalled();
    expect(second.installation.ensureInstallationServiceForContract).not.toHaveBeenCalled();
    expect(await db.ordenTrabajo.count()).toBe(0);
    expect(await db.servicioContratado.count()).toBe(0);
  });

  it.each([false, true])('fallo de auditoria revierte contrato y relacion asociada (prospecto=%s)', async prospectOnly => {
    const f = await fixture(prospectOnly), ctx = services(db);
    const realRecord = ctx.audit.record.bind(ctx.audit);
    jest.spyOn(ctx.audit, 'record').mockImplementation(async (input, tx) => {
      await realRecord(input, tx);
      throw new Error('QA_AUDIT_AFTER_WRITE_FAILED');
    });
    await expect(ctx.service.confirmManualSignature(f.contract.idContrato, {}, user)).rejects.toThrow('QA_AUDIT_AFTER_WRITE_FAILED');
    expect(await db.contrato.findUniqueOrThrow({ where: { idContrato: f.contract.idContrato } })).toEqual(f.contract);
    if (f.customer) expect(await db.cliente.findUniqueOrThrow({ where: { idCliente: f.customer.idCliente } })).toEqual(f.customer);
    if (f.prospect) expect(await db.prospecto.findUniqueOrThrow({ where: { idProspecto: f.prospect.idProspecto } })).toEqual(f.prospect);
    expect(await signatureAudits(f.contract.idContrato)).toHaveLength(0);
  });

  it('dos firmas del documento conservan fecha, hash, ruta y una sola auditoria', async () => {
    const f = await fixture(), doc = await document(f.contract.idContrato);
    const a = services(db), b = services(other);
    const results = await Promise.all([
      a.service.updateDigitalContractStatus(f.contract.idContrato, { estadoFirma: 'Firmado manualmente' }, user),
      b.service.updateDigitalContractStatus(f.contract.idContrato, { estadoFirma: 'Firmado manualmente' }, user),
    ]);
    const saved = await db.contratoDigital.findUniqueOrThrow({ where: { idContratoDigital: doc.idContratoDigital } });
    expect(saved.estadoFirma).toBe('Firmado manualmente');
    expect(saved.fechaFirma).not.toBeNull();
    expect(results[0].fechaFirma).toEqual(saved.fechaFirma);
    expect(results[1].fechaFirma).toEqual(saved.fechaFirma);
    expect(saved.hashDocumento).toBe(doc.hashDocumento);
    expect(saved.urlDocumento).toBe(doc.urlDocumento);
    await expect(b.service.updateDigitalContractStatus(f.contract.idContrato, { estadoFirma: 'Anulado' }, user)).rejects.toThrow('firmado');
    expect(await db.contratoDigital.findUniqueOrThrow({ where: { idContratoDigital: doc.idContratoDigital } })).toEqual(saved);
    expect(await db.logAuditoria.count({ where: { entidadAfectada: 'contrato_digital',
      idEntidadAfectada: doc.idContratoDigital, accion: 'ACTUALIZAR_ESTADO_CONTRATO_DIGITAL' } })).toBe(1);
    // The existing document-status route still does not fabricate a business signature.
    expect((await db.contrato.findUniqueOrThrow({ where: { idContrato: f.contract.idContrato } })).estado).toBe('Pendiente firma contrato');
  });

  it('una carrera entre enviar y firmar nunca degrada un documento firmado', async () => {
    const f = await fixture(), doc = await document(f.contract.idContrato);
    const outcomes = await Promise.allSettled([
      services(db).service.updateDigitalContractStatus(f.contract.idContrato, { estadoFirma: 'Firmado manualmente' }, user),
      services(other).service.updateDigitalContractStatus(f.contract.idContrato, { estadoFirma: 'Enviado' }, user),
    ]);
    expect(outcomes[0].status).toBe('fulfilled');
    const saved = await db.contratoDigital.findUniqueOrThrow({ where: { idContratoDigital: doc.idContratoDigital } });
    expect(saved.estadoFirma).toBe('Firmado manualmente');
    expect(saved.fechaFirma).not.toBeNull();
    expect(saved.hashDocumento).toBe(doc.hashDocumento);
  });

  it('revalida la empresa despues de esperar una transaccion concurrente', async () => {
    const f = await fixture(), locked = deferred(), release = deferred(), checked = deferred();
    const ctx = services(db);
    const original = ctx.service['getContractOrThrow'].bind(ctx.service);
    jest.spyOn(ctx.service as never, 'getContractOrThrow' as never).mockImplementation((async (...args: unknown[]) => {
      const result = await (original as (...values: unknown[]) => Promise<unknown>)(...args);
      if (args[2] === undefined) checked.resolve();
      return result;
    }) as never);
    const blocker = other.$transaction(async tx => {
      await tx.$queryRaw`SELECT id_contrato FROM contrato WHERE id_contrato = ${f.contract.idContrato} FOR UPDATE`;
      locked.resolve();
      await release.promise;
      await tx.contrato.update({ where: { idContrato: f.contract.idContrato }, data: { idEmpresa: otherCompany } });
    }, { timeout: 15000 });
    await locked.promise;
    const signing = ctx.service.confirmManualSignature(f.contract.idContrato, {}, user);
    const outcome = signing.then(value => ({ value, error: null }), error => ({ value: null, error }));
    try { await checked.promise; } finally { release.resolve(); }
    await blocker;
    expect((await outcome).error?.message).toContain('empresa');
    const saved = await db.contrato.findUniqueOrThrow({ where: { idContrato: f.contract.idContrato } });
    expect(saved.idEmpresa).toBe(otherCompany);
    expect(saved.estado).toBe('Pendiente firma contrato');
    expect(saved.fechaFirmaManual).toBeNull();
    expect(await signatureAudits(saved.idContrato)).toHaveLength(0);
  });

  it.each(['Moroso', 'Suspendido'])('conserva el estado financiero %s al firmar', async estado => {
    const f = await fixture();
    await db.cliente.update({ where: { idCliente: f.customer!.idCliente }, data: { estado } });
    await services(db).service.confirmManualSignature(f.contract.idContrato, {}, user);
    expect((await db.cliente.findUniqueOrThrow({ where: { idCliente: f.customer!.idCliente } })).estado).toBe(estado);
    expect(await signatureAudits(f.contract.idContrato)).toHaveLength(1);
    expect(await db.servicioContratado.count()).toBe(0);
  });
  function electronicServices(client = db) {
    const config = new ConfigService({ NODE_ENV: 'test', CONTRACT_SIGNATURE_ENABLED: 'true',
      CONTRACT_SIGNATURE_PUBLIC_URL: 'http://localhost/', CONTRACT_SIGNATURE_COMPANIES: JSON.stringify([company, otherCompany]),
      CONTRACT_SIGNATURE_OTP_SECRET: qaOtpSecret });
    const audit = new AuditService(client as PrismaService);
    const installation = { ensureInstallationServiceForContract: jest.fn() };
    const contracts = new ContractsService(client as PrismaService, audit, installation as never, config);
    const mail = { isConfigured: jest.fn().mockReturnValue(true),
      sendSignatureInvitation: jest.fn().mockResolvedValue({ status: 'simulated' }),
      sendSignatureCode: jest.fn().mockResolvedValue({ status: 'simulated' }),
      sendSignedContract: jest.fn().mockResolvedValue({ status: 'simulated' }) };
    const electronic = new ESignatureService(client as PrismaService, config, mail as never, audit, contracts);
    return { config, audit, installation, contracts, mail, electronic };
  }

  async function electronicFixture(targetCompany = company) {
    const f = await fixture(), ctx = electronicServices();
    const plan = await db.plan.create({ data: { idEmpresa: targetCompany, nombreComercial: 'Plan ficticio firma',
      tipoPlan: 'Internet', tipoCliente: 'Residencial', precioMensual: 19990, velocidadMbps: 300 } });
    const base = String(90000000 + f.customer!.idCliente);
    let sum = 0, factor = 2;
    for (const digit of [...base].reverse()) { sum += Number(digit) * factor; factor = factor === 7 ? 2 : factor + 1; }
    const check = 11 - sum % 11;
    const rut = base + '-' + (check === 11 ? '0' : check === 10 ? 'K' : String(check));
    await db.cliente.update({ where: { idCliente: f.customer!.idCliente }, data: { rut, email: 'qa@example.invalid' } });
    await db.contrato.update({ where: { idContrato: f.contract.idContrato }, data: { idEmpresa: targetCompany, idPlan: plan.idPlan } });
    const creator = targetCompany === company ? null : await db.usuario.create({ data: { idEmpresa: targetCompany, nombreCompleto: 'Operador ficticio B', passwordHash: 'QA_NO_LOGIN' } });
    const actor = creator ? { ...user, idUsuario: creator.idUsuario, idEmpresa: targetCompany } : user;
    await ctx.electronic.onModuleInit();
    const doc = await ctx.contracts.generateDigitalContract(f.contract.idContrato, actor);
    await ctx.electronic.create(f.contract.idContrato, actor);
    const token = ctx.mail.sendSignatureInvitation.mock.calls[0][0].link.split('#')[1] as string;
    const original = await ctx.electronic.pdf(token);
    await ctx.electronic.requestCode(token);
    const code = ctx.mail.sendSignatureCode.mock.calls[0][0].code as string;
    return { ...f, ...ctx, doc, token, code, original, plan, actor };
  }

  it('firma por correo el mismo PDF y su repetición concurrente no duplica firma, auditoría ni correo', async () => {
    const f = await electronicFixture();
    const second = electronicServices(other);
    const args = [f.token, f.code, f.doc.hashDocumento!, true, SIGNATURE_CONSENT_VERSION, '127.0.0.1', 'QA'] as const;
    const results = await Promise.all([f.electronic.sign(...args), second.electronic.sign(...args)]);
    expect(results).toEqual([{ estado: 'FIRMADA' }, { estado: 'FIRMADA' }]);
    const row = await db.solicitudFirmaContrato.findUniqueOrThrow({ where: { idContratoDigital: f.doc.idContratoDigital } });
    expect(row.pdfOriginal).toEqual(f.original);
    expect(createHash('sha256').update(row.pdfOriginal).digest('hex')).toBe(row.hashOriginal);
    expect(createHash('sha256').update(row.pdfFirmado!).digest('hex')).toBe(row.hashFirmado);
    expect((await PDFDocument.load(row.pdfFirmado!)).getPageCount()).toBe((await PDFDocument.load(f.original)).getPageCount() + 1);
    expect(await f.electronic.pdf(f.token)).toEqual(row.pdfFirmado);
    expect(row.otpHash).toBeNull();
    expect(row.firmaCorreoEstado).toBe('SIMULADO');
    expect(f.mail.sendSignedContract.mock.calls.length + second.mail.sendSignedContract.mock.calls.length).toBe(1);
    expect(await db.logAuditoria.count({ where: { accion: 'FIRMAR_CONTRATO_CORREO', idEntidadAfectada: f.contract.idContrato } })).toBe(1);
    const contract = await db.contrato.findUniqueOrThrow({ where: { idContrato: f.contract.idContrato } });
    expect(contract.estado).toBe('Firmado');
    expect(contract.fechaFirmaManual).toBeNull();
    expect(f.installation.ensureInstallationServiceForContract).not.toHaveBeenCalled();
    expect(await db.ordenTrabajo.count()).toBe(0);
  });

  it.each(['email', 'price', 'address'])('cambio relevante de %s anula sin firmar ni enviar documento', async changed => {
    const f = await electronicFixture();
    if (changed === 'email') await other.cliente.update({ where: { idCliente: f.customer!.idCliente }, data: { email: 'otro@example.invalid' } });
    if (changed === 'address') await other.contrato.update({ where: { idContrato: f.contract.idContrato }, data: { direccionInstalacion: 'Otra dirección ficticia' } });
    if (changed === 'price') await other.plan.update({ where: { idPlan: f.plan.idPlan }, data: { precioMensual: 29990 } });
    await expect(f.electronic.sign(f.token, f.code, f.doc.hashDocumento!, true, SIGNATURE_CONSENT_VERSION, '', '')).rejects.toThrow('datos cambiaron');
    expect((await db.solicitudFirmaContrato.findUniqueOrThrow({ where: { idContratoDigital: f.doc.idContratoDigital } })).estado).toBe('ANULADA');
    expect((await db.contrato.findUniqueOrThrow({ where: { idContrato: f.contract.idContrato } })).estado).toBe('Pendiente firma contrato');
    expect(f.mail.sendSignedContract).not.toHaveBeenCalled();
  });

  it('cinco códigos incorrectos bloquean la solicitud de forma persistente y no reinician el presupuesto', async () => {
    const f = await electronicFixture();
    const wrong = f.code === '000000' ? '111111' : '000000';
    for (let n = 0; n < 5; n++) await expect(f.electronic.sign(f.token, wrong, f.doc.hashDocumento!, true,
      SIGNATURE_CONSENT_VERSION, '', '')).rejects.toThrow('Código incorrecto');
    const row = await db.solicitudFirmaContrato.findUniqueOrThrow({ where: { idContratoDigital: f.doc.idContratoDigital } });
    expect(row).toMatchObject({ estado: 'ANULADA', otpIntentos: 5, otpHash: null });
    await expect(f.electronic.requestCode(f.token)).rejects.toThrow('no vigente');
    expect(f.mail.sendSignatureCode).toHaveBeenCalledTimes(1);
  });

  it('caducidad del código y del enlace impiden firmar', async () => {
    const f = await electronicFixture();
    await db.solicitudFirmaContrato.update({ where: { idContratoDigital: f.doc.idContratoDigital }, data: { otpExpiracion: new Date(Date.now() - 1000) } });
    await expect(f.electronic.sign(f.token, f.code, f.doc.hashDocumento!, true, SIGNATURE_CONSENT_VERSION, '', '')).rejects.toThrow('Código no vigente');
    await db.solicitudFirmaContrato.update({ where: { idContratoDigital: f.doc.idContratoDigital },
      data: { fechaCreacion: new Date(Date.now() - 10000), fechaExpiracion: new Date(Date.now() - 1000) } });
    await expect(f.electronic.view(f.token)).rejects.toThrow('expiró');
    expect((await db.solicitudFirmaContrato.findUniqueOrThrow({ where: { idContratoDigital: f.doc.idContratoDigital } })).estado).toBe('EXPIRADA');
  });

  it('no acepta consentimiento falso, huella distinta ni códigos solicitados sin revisar PDF', async () => {
    const f = await electronicFixture();
    await expect(f.electronic.sign(f.token, f.code, f.doc.hashDocumento!, false, SIGNATURE_CONSENT_VERSION, '', '')).rejects.toThrow('acepta');
    await expect(f.electronic.sign(f.token, f.code, '0'.repeat(64), true, SIGNATURE_CONSENT_VERSION, '', '')).rejects.toThrow('no coincide');
    await db.solicitudFirmaContrato.update({ where: { idContratoDigital: f.doc.idContratoDigital }, data: { pdfVisto: null } });
    await expect(f.electronic.requestCode(f.token)).rejects.toThrow('revisa el PDF');
    expect(f.mail.sendSignatureCode).toHaveBeenCalledTimes(1);
  });

  it.each(['manual', 'version'])('invalida la solicitud pendiente al confirmar %s', async kind => {
    const f = await electronicFixture();
    if (kind === 'manual') await f.contracts.confirmManualSignature(f.contract.idContrato, {}, user);
    else await f.contracts.generateDigitalContract(f.contract.idContrato, user);
    await expect(f.electronic.sign(f.token, f.code, f.doc.hashDocumento!, true, SIGNATURE_CONSENT_VERSION, '', '')).rejects.toThrow('no vigente');
    expect((await db.solicitudFirmaContrato.findUniqueOrThrow({ where: { idContratoDigital: f.doc.idContratoDigital } })).estado).toBe('ANULADA');
  });

  it('un fallo de auditoría revierte PDF firmado, estado comercial y consumo del código', async () => {
    const f = await electronicFixture();
    const realRecord = f.audit.record.bind(f.audit);
    jest.spyOn(f.audit, 'record').mockImplementation(async (input, tx) => {
      const result = await realRecord(input, tx);
      if (input.accion === 'FIRMAR_CONTRATO_CORREO') throw new Error('QA_SIGN_AUDIT_FAILED');
      return result;
    });
    await expect(f.electronic.sign(f.token, f.code, f.doc.hashDocumento!, true, SIGNATURE_CONSENT_VERSION, '', '')).rejects.toThrow('QA_SIGN_AUDIT_FAILED');
    const row = await db.solicitudFirmaContrato.findUniqueOrThrow({ where: { idContratoDigital: f.doc.idContratoDigital } });
    expect(row).toMatchObject({ estado: 'PENDIENTE', pdfFirmado: null, firmaFecha: null });
    expect(row.otpHash).not.toBeNull();
    expect((await db.contrato.findUniqueOrThrow({ where: { idContrato: f.contract.idContrato } })).estado).toBe('Pendiente firma contrato');
    expect(f.mail.sendSignedContract).not.toHaveBeenCalled();
  });

  it('un SMTP incierto después de firmar conserva la firma y no reenvía al repetir', async () => {
    const f = await electronicFixture(); f.mail.sendSignedContract.mockRejectedValue(new Error('synthetic smtp uncertain'));
    const args = [f.token, f.code, f.doc.hashDocumento!, true, SIGNATURE_CONSENT_VERSION, '', ''] as const;
    expect(await f.electronic.sign(...args)).toEqual({ estado: 'FIRMADA' });
    expect(await f.electronic.sign(...args)).toEqual({ estado: 'FIRMADA' });
    expect(f.mail.sendSignedContract).toHaveBeenCalledTimes(1);
    expect((await db.solicitudFirmaContrato.findUniqueOrThrow({ where: { idContratoDigital: f.doc.idContratoDigital } })).firmaCorreoEstado).toBe('INDETERMINADO');
  });

  it('un operador de otra empresa no obtiene estado, envío ni PDF firmado', async () => {
    const f = await electronicFixture(); const foreign = { ...user, idEmpresa: otherCompany };
    await expect(f.electronic.status(f.contract.idContrato, foreign)).rejects.toThrow('no encontrado');
    await expect(f.electronic.create(f.contract.idContrato, foreign)).rejects.toThrow('no encontrado');
    await expect(f.electronic.signedPdf(f.contract.idContrato, foreign)).rejects.toThrow('no encontrado');
    expect(f.mail.sendSignatureInvitation).toHaveBeenCalledTimes(1);
  });

  it('el índice parcial impide una segunda solicitud pendiente del mismo contrato', async () => {
    const f = await electronicFixture();
    const row = await db.solicitudFirmaContrato.findUniqueOrThrow({ where: { idContratoDigital: f.doc.idContratoDigital } });
    const doc = await db.contratoDigital.create({ data: { idContrato: f.contract.idContrato, idEmpresa: company,
      version: 99, hashDocumento: 'f'.repeat(64), estadoFirma: 'Generado', urlDocumento: 'generated/contracts/qa.pdf', idUsuarioGenerador: user.idUsuario } });
    await expect(db.solicitudFirmaContrato.create({ data: { ...row, datosSnapshot: row.datosSnapshot as Prisma.InputJsonObject, idSolicitud: randomUUID(), idContratoDigital: doc.idContratoDigital,
      tokenHash: createHash('sha256').update(randomUUID()).digest('hex') } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('respetan espera y máximo de cinco envíos aunque cambie la instancia', async () => {
    const f = await electronicFixture();
    await expect(electronicServices(other).electronic.requestCode(f.token)).rejects.toThrow('60 segundos');
    await db.solicitudFirmaContrato.update({ where: { idContratoDigital: f.doc.idContratoDigital },
      data: { otpEnvios: 4, otpSolicitado: new Date(Date.now() - 61000) } });
    await f.electronic.requestCode(f.token);
    await db.solicitudFirmaContrato.update({ where: { idContratoDigital: f.doc.idContratoDigital },
      data: { otpSolicitado: new Date(Date.now() - 61000) } });
    await expect(f.electronic.requestCode(f.token)).rejects.toThrow('Límite');
    expect((await db.solicitudFirmaContrato.findUniqueOrThrow({ where: { idContratoDigital: f.doc.idContratoDigital } })).otpEnvios).toBe(5);
    expect(f.mail.sendSignatureCode).toHaveBeenCalledTimes(2);
  });

  it('un envío de código no confirmado inutiliza el código reservado', async () => {
    const f = await electronicFixture();
    f.mail.sendSignatureCode.mockRejectedValueOnce(new Error('uncertain QA code delivery'));
    await db.solicitudFirmaContrato.update({ where: { idContratoDigital: f.doc.idContratoDigital },
      data: { otpSolicitado: new Date(Date.now() - 61000) } });
    await expect(f.electronic.requestCode(f.token)).rejects.toThrow('No se confirmó');
    const row = await db.solicitudFirmaContrato.findUniqueOrThrow({ where: { idContratoDigital: f.doc.idContratoDigital } });
    expect(row.otpHash).toBeNull();
    await expect(f.electronic.sign(f.token, f.code, f.doc.hashDocumento!, true, SIGNATURE_CONSENT_VERSION, '', '')).rejects.toThrow('Código no vigente');
  });

  it('el CHECK exige huella firmada no nula además del PDF y la constancia', async () => {
    const f = await electronicFixture();
    await expect(db.solicitudFirmaContrato.update({ where: { idContratoDigital: f.doc.idContratoDigital },
      data: { estado: 'FIRMADA', firmaFecha: new Date(), pdfFirmado: f.original, hashFirmado: null,
        consentimientoVersion: SIGNATURE_CONSENT_VERSION, otpHash: null } })).rejects.toThrow('firma_signed_check');
    expect((await db.solicitudFirmaContrato.findUniqueOrThrow({ where: { idContratoDigital: f.doc.idContratoDigital } })).estado).toBe('PENDIENTE');
  });

  it('un enlace vencido no entrega el PDF firmado y conserva la evidencia inmutable', async () => {
    const f = await electronicFixture();
    await f.electronic.sign(f.token, f.code, f.doc.hashDocumento!, true, SIGNATURE_CONSENT_VERSION, '', '');
    const saved = await db.solicitudFirmaContrato.findUniqueOrThrow({ where: { idContratoDigital: f.doc.idContratoDigital } });
    await db.solicitudFirmaContrato.update({ where: { idContratoDigital: f.doc.idContratoDigital },
      data: { fechaCreacion: new Date(Date.now() - 10000), fechaExpiracion: new Date(Date.now() - 1000) } });
    await expect(f.electronic.pdf(f.token)).rejects.toThrow('expiró');
    const row = await db.solicitudFirmaContrato.findUniqueOrThrow({ where: { idContratoDigital: f.doc.idContratoDigital } });
    expect(row.estado).toBe('FIRMADA'); expect(row.pdfFirmado).toEqual(saved.pdfFirmado);
    expect(await f.electronic.signedPdf(f.contract.idContrato, user)).toEqual(saved.pdfFirmado);
  });

  it('la segunda empresa firma una identidad compartida usando exclusivamente su remitente y permisos', async () => {
    const f = await electronicFixture(otherCompany);
    await f.electronic.sign(f.token, f.code, f.doc.hashDocumento!, true, SIGNATURE_CONSENT_VERSION, '', '');
    expect(f.mail.sendSignatureInvitation).toHaveBeenCalledWith(expect.objectContaining({ idEmpresa: otherCompany }));
    expect(f.mail.sendSignatureCode).toHaveBeenCalledWith(expect.objectContaining({ idEmpresa: otherCompany }));
    expect(f.mail.sendSignedContract).toHaveBeenCalledWith(expect.objectContaining({ idEmpresa: otherCompany }));
    expect((await db.cliente.findUniqueOrThrow({ where: { idCliente: f.customer!.idCliente } })).idEmpresa).toBe(company);
    await expect(f.electronic.signedPdf(f.contract.idContrato, user)).rejects.toThrow('no encontrado');
    expect(await f.electronic.signedPdf(f.contract.idContrato, f.actor)).toBeInstanceOf(Buffer);
  });

});
