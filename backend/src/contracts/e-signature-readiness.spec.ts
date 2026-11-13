import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { ESignatureService } from './e-signature.service';
import { DEMO_SIGNATURE_CONSENT_VERSION, SIGNATURE_CONSENT_VERSION } from './e-signature.config';
import * as repository from './signature.repository';
import * as snapshots from './contract-snapshot';

const actor = { idUsuario: 8, idEmpresa: 1, roles: ['Comercial'] };
const settings = () => ({ NODE_ENV: 'test', CONTRACT_SIGNATURE_ENABLED: 'true',
  CONTRACT_SIGNATURE_PUBLIC_URL: 'http://localhost/', CONTRACT_SIGNATURE_COMPANIES: '[1]',
  CONTRACT_SIGNATURE_AUTOMATIC_COMPANIES: '[]',
  CONTRACT_SIGNATURE_OTP_SECRET: randomBytes(32).toString('hex') });

function harness(config: Record<string, string> = {}) {
  const pdf = Buffer.from('%PDF-SYNTHETIC');
  const row = { idSolicitud: 'qa-signature', idEmpresa: 1, idContrato: 20, idContratoDigital: 30, version: 1,
    estado: 'BORRADOR', fechaExpiracion: new Date(Date.now() + 3600000), datosSnapshot: {},
    pdfOriginal: pdf, hashOriginal: createHash('sha256').update(pdf).digest('hex'), destinatario: 'qa@example.invalid',
    correoEstado: 'SIN_ENVIAR', firmaFecha: null, firmaCorreoEstado: 'NO_APLICA' };
  const contract = { idContrato: 20, idEmpresa: 1, idCliente: 10, idProspecto: null,
    estado: 'Pendiente firma contrato', cliente: { rut: null, email: 'qa@example.invalid' }, prospecto: null };
  const db = { $transaction: jest.fn(), $queryRaw: jest.fn().mockResolvedValue([]),
    contrato: { findUnique: jest.fn().mockResolvedValue(contract), findUniqueOrThrow: jest.fn().mockResolvedValue(contract) },
    contratoDigital: { findFirst: jest.fn().mockResolvedValue({ idContratoDigital: 30, idEmpresa: 1,
      version: 1, hashDocumento: row.hashOriginal, estadoFirma: 'Generado', fechaFirma: null }),
    findUnique: jest.fn().mockResolvedValue({ idContrato: 20, idEmpresa: 1, version: 1 }), update: jest.fn() },
    factura: { findMany: jest.fn().mockResolvedValue([]) },
    logAuditoria: { findFirst: jest.fn().mockResolvedValue({ idLog: 1 }) } };
  db.$transaction.mockImplementation(async fn => fn(db));
  const store = { findFirst: jest.fn().mockImplementation(async ({ where }) => where.estado === 'FIRMADA' ? null : row),
    findUnique: jest.fn().mockResolvedValue(row), update: jest.fn().mockImplementation(async ({ data }) => Object.assign(row, data)),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
  jest.spyOn(repository, 'signatureStorageAvailable').mockResolvedValue(true);
  jest.spyOn(repository, 'signatureRepository').mockReturnValue(store as never);
  jest.spyOn(snapshots, 'buildContractSnapshot').mockResolvedValue({} as never);
  const mail = { isConfigured: jest.fn().mockReturnValue(true), sendSignatureInvitation: jest.fn().mockResolvedValue({ status: 'sent' }),
    sendSignatureCode: jest.fn(), sendSignedContract: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const contracts = { markContractSigned: jest.fn() };
  const service = new ESignatureService(db as never, new ConfigService({ ...settings(), ...config }),
    mail as never, audit as never, contracts as never);
  const debt = () => db.factura.findMany.mockResolvedValue([{ monto: new Prisma.Decimal(7000), estado: 'Vencida',
    pagos: [], prorrogasPago: [], fechaLimitePago: new Date('2026-01-01T00:00:00Z') }]);
  return { service, db, contract, row, store, mail, audit, debt, contracts };
}

describe('Readiness específico de firma sin habilitar proveedores', () => {
  afterEach(() => jest.restoreAllMocks());

  it('en demo envía una invitación, exige revisar el PDF y registra una sola aceptación sin otros correos', async () => {
    const h = harness({ CONTRACT_SIGNATURE_DEMO_WITHOUT_CODE: 'true', MAIL_PROVIDER: 'mock',
      DATABASE_URL: 'postgresql://qa@localhost/finet_firma_qa' });
    const pdf = await PDFDocument.create();
    pdf.addPage();
    h.row.pdfOriginal = Buffer.from(await pdf.save());
    h.row.hashOriginal = createHash('sha256').update(h.row.pdfOriginal).digest('hex');
    h.db.contratoDigital.findFirst.mockResolvedValue({ idContratoDigital: 30, idEmpresa: 1,
      version: 1, hashDocumento: h.row.hashOriginal, estadoFirma: 'Generado', fechaFirma: null });
    const snapshot = { idEmpresa: 1, cliente: { email: 'qa@example.invalid' } };
    h.row.datosSnapshot = snapshot;
    jest.mocked(snapshots.buildContractSnapshot).mockResolvedValue(snapshot as never);

    await h.service.create(20, actor as never);
    const token = h.mail.sendSignatureInvitation.mock.calls[0][0].link.split('#')[1] as string;
    expect(h.mail.sendSignatureInvitation).toHaveBeenCalledTimes(1);
    expect(h.mail.sendSignatureInvitation).toHaveBeenCalledWith(expect.objectContaining({ demo: true }));
    expect(await h.service.view(token)).toMatchObject({ demo: true, estado: 'PENDIENTE' });
    expect(h.contracts.markContractSigned).not.toHaveBeenCalled();
    await expect(h.service.requestCode(token)).rejects.toThrow('Función no disponible');
    const accept = () => h.service.sign(token, undefined, h.row.hashOriginal, true, DEMO_SIGNATURE_CONSENT_VERSION, '', '');
    await expect(accept()).rejects.toThrow('Revisa el PDF');
    await h.service.pdf(token);
    await expect(accept()).resolves.toEqual({ estado: 'FIRMADA' });
    await expect(accept()).resolves.toEqual({ estado: 'FIRMADA' });
    expect(h.contracts.markContractSigned).toHaveBeenCalledTimes(1);
    expect(h.store.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ consentimientoVersion: DEMO_SIGNATURE_CONSENT_VERSION, firmaCorreoEstado: 'SIMULADO' }),
    }));
    expect(h.mail.sendSignatureCode).not.toHaveBeenCalled();
    expect(h.mail.sendSignedContract).not.toHaveBeenCalled();
    expect((await PDFDocument.load(await h.service.pdf(token))).getPageCount()).toBe(2);
  });

  it('el flujo normal rechaza firmas sin código, incluso con el consentimiento demo', async () => {
    const h = harness();
    const token = randomBytes(32).toString('base64url');
    for (const consentVersion of [SIGNATURE_CONSENT_VERSION, DEMO_SIGNATURE_CONSENT_VERSION]) {
      await expect(h.service.sign(token, undefined, h.row.hashOriginal, true, consentVersion, '', ''))
        .rejects.toThrow('introduce el código');
    }
    expect(h.store.findUnique).not.toHaveBeenCalled();
    expect(h.contracts.markContractSigned).not.toHaveBeenCalled();
  });

  it('modalidad desconocida explica asignación pendiente sin inventar una habilitación', async () => {
    const h = harness(); h.db.logAuditoria.findFirst.mockResolvedValue(null);
    const result = await h.service.status(20, actor as never);
    expect(result).toMatchObject({ enabled: false, sendAllowed: false, policy: { mode: 'unknown', manualAllowed: false } });
    expect(result.policy.reason).toContain('modalidad de firma autorizada');
    expect(h.db.factura.findMany).not.toHaveBeenCalled();
    expect(h.mail.sendSignatureInvitation).not.toHaveBeenCalled();
  });

  it.each([
    ['deshabilitada', { CONTRACT_SIGNATURE_ENABLED: 'false' }, 'deshabilitada'],
    ['empresa no habilitada', { CONTRACT_SIGNATURE_COMPANIES: '[2]' }, 'empresa no está habilitada'],
    ['URL no segura', { CONTRACT_SIGNATURE_PUBLIC_URL: 'http://public.example.invalid/?private=x' }, 'dirección pública'],
  ])('diagnostica %s sin revelar configuración privada', async (_name, config, expected) => {
    const h = harness(config);
    const result = await h.service.status(20, actor as never);
    expect(result.enabled).toBe(false); expect(result.sendAllowed).toBe(false);
    expect(result.policy.reason).toContain(expected);
    expect(JSON.stringify(result)).not.toContain('private=x');
    expect(h.mail.sendSignatureInvitation).not.toHaveBeenCalled();
  });

  it('almacenamiento ausente informa habilitación segura sin publicar el esquema', async () => {
    const h = harness(); jest.mocked(repository.signatureStorageAvailable).mockResolvedValue(false);
    const result = await h.service.status(20, actor as never);
    expect(result.policy.reason).toContain('habilitación segura'); expect(result.sendAllowed).toBe(false);
    expect(JSON.stringify(result)).not.toContain('g8_contratos'); expect(h.store.findFirst).not.toHaveBeenCalled();
  });

  it('correo de empresa ausente se distingue de una modalidad sin asignar', async () => {
    const h = harness(); h.mail.isConfigured.mockReturnValue(false);
    const result = await h.service.status(20, actor as never);
    expect(result.policy.reason).toContain('correo de esta empresa'); expect(result.enabled).toBe(false);
  });

  it('PDF ausente explica la acción previa sin enviarlo automáticamente', async () => {
    const h = harness(); h.db.contratoDigital.findFirst.mockResolvedValue(null);
    const result = await h.service.status(20, actor as never);
    expect(result.policy.reason).toContain('Genera un PDF vigente'); expect(result.sendAllowed).toBe(false);
  });

  it('PDF sin preparación de firma solicita una nueva versión y no inventa solicitud', async () => {
    const h = harness(); h.store.findFirst.mockResolvedValue(null);
    const result = await h.service.status(20, actor as never);
    expect(result.policy.reason).toContain('nueva versión'); expect(result.solicitud).toBeNull();
  });

  it('enlace expirado y documento anulado siguen bloqueados con motivos específicos', async () => {
    const h = harness(); h.row.estado = 'PENDIENTE'; h.row.fechaExpiracion = new Date(0);
    expect((await h.service.status(20, actor as never)).policy.reason).toContain('expiró');
    h.db.contratoDigital.findFirst.mockResolvedValue({ idContratoDigital: 30, idEmpresa: 1, estadoFirma: 'Anulado' });
    expect((await h.service.status(20, actor as never)).policy.reason).toContain('no está vigente');
    expect(h.store.update).not.toHaveBeenCalled();
  });

  it('correo del titular inválido conserva el documento y bloquea envío', async () => {
    const h = harness(); h.contract.cliente.email = '';
    const result = await h.service.status(20, actor as never);
    expect(result.sendAllowed).toBe(false); expect(result.policy.reason).toContain('correo válido del titular');
    expect(h.store.update).not.toHaveBeenCalled();
  });

  it('configuración, PDF y finanzas correctas habilitan solamente el envío explícito', async () => {
    const h = harness();
    expect(await h.service.status(20, actor as never)).toMatchObject({ enabled: true, sendAllowed: true,
      policy: { mode: 'automatic', reason: null, manualAllowed: false } });
    expect(h.mail.sendSignatureInvitation).not.toHaveBeenCalled(); expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('deuda bloquea readiness automático y firma manual sin auditar una simple consulta', async () => {
    const h = harness({ CONTRACT_SIGNATURE_MANUAL_COMPANIES: '[1]', CONTRACT_SIGNATURE_MANUAL_CONTRACTS: '[20]' });
    h.debt();
    expect(await h.service.status(20, actor as never)).toMatchObject({ sendAllowed: false,
      policy: { reason: expect.stringContaining('deuda pendiente') } });
    h.db.logAuditoria.findFirst.mockResolvedValue(null);
    expect(await h.service.status(20, actor as never)).toMatchObject({ policy: { mode: 'manual', manualAllowed: false,
      reason: expect.stringContaining('deuda pendiente') } });
    expect(h.audit.record).not.toHaveBeenCalled(); expect(h.store.update).not.toHaveBeenCalled();
  });

  it('documento firmado en papel sigue elegible para confirmación manual autorizada y su veto financiero', async () => {
    const h = harness({ CONTRACT_SIGNATURE_MANUAL_COMPANIES: '[1]', CONTRACT_SIGNATURE_MANUAL_CONTRACTS: '[20]' });
    h.db.logAuditoria.findFirst.mockResolvedValue(null);
    h.db.contratoDigital.findFirst.mockResolvedValue({ idContratoDigital: 30, idEmpresa: 1,
      estadoFirma: 'Firmado manualmente', fechaFirma: new Date('2026-11-01T00:00:00Z') });
    expect(await h.service.status(20, actor as never)).toMatchObject({ sendAllowed: false,
      policy: { mode: 'manual', manualAllowed: true, reason: null } });
    h.debt();
    expect(await h.service.status(20, actor as never)).toMatchObject({
      policy: { mode: 'manual', manualAllowed: false, reason: expect.stringContaining('deuda pendiente') } });
    expect(h.store.update).not.toHaveBeenCalled();
  });

  it('falla financiera de infraestructura no se convierte en saldo regularizado', async () => {
    const h = harness(); h.db.factura.findMany.mockRejectedValue(new Error('DB_READ_FAILED'));
    await expect(h.service.status(20, actor as never)).rejects.toThrow('DB_READ_FAILED');
  });

  it('otra empresa no consulta finanzas, almacenamiento ni documentos del contrato', async () => {
    const h = harness();
    await expect(h.service.status(20, { ...actor, idEmpresa: 2 } as never)).rejects.toThrow('Contrato no encontrado');
    expect(h.db.factura.findMany).not.toHaveBeenCalled(); expect(h.db.contratoDigital.findFirst).not.toHaveBeenCalled();
    expect(repository.signatureStorageAvailable).not.toHaveBeenCalled();
  });

  it('envío con deuda se veta dentro de transacción y registra negativa después del rollback', async () => {
    const h = harness(); h.debt();
    await expect(h.service.create(20, actor as never)).rejects.toThrow('Existe deuda pendiente');
    expect(h.store.update).not.toHaveBeenCalled(); expect(h.mail.sendSignatureInvitation).not.toHaveBeenCalled();
    expect(h.db.$transaction).toHaveBeenCalledTimes(2);
    expect(h.db.$transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: 'Serializable' });
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'BLOQUEAR_CONTRATACION_POR_DEUDA' }), h.db);
    expect(h.row.estado).toBe('BORRADOR');
  });

  it('si falla auditoría del veto no confirma una operación exitosa ni modifica solicitud', async () => {
    const h = harness(); h.debt(); h.audit.record.mockRejectedValue(new Error('AUDIT_FAILED'));
    await expect(h.service.create(20, actor as never)).rejects.toThrow('AUDIT_FAILED');
    expect(h.store.update).not.toHaveBeenCalled(); expect(h.mail.sendSignatureInvitation).not.toHaveBeenCalled();
  });

  it('replay de solicitud pendiente no duplica invitación ni sustituye token original', async () => {
    const h = harness(); h.row.estado = 'PENDIENTE';
    expect((await h.service.create(20, actor as never)).solicitud?.estado).toBe('PENDIENTE');
    expect((await h.service.create(20, actor as never)).solicitud?.estado).toBe('PENDIENTE');
    expect(h.store.update).not.toHaveBeenCalled(); expect(h.mail.sendSignatureInvitation).not.toHaveBeenCalled();
  });

  it('envío explícito con finanzas regulares prepara una invitación y su replay no la duplica', async () => {
    const h = harness();
    const snapshot = { cliente: { email: 'qa@example.invalid' } };
    h.row.datosSnapshot = snapshot;
    jest.mocked(snapshots.buildContractSnapshot).mockResolvedValue(snapshot as never);
    expect((await h.service.create(20, actor as never)).solicitud?.estado).toBe('PENDIENTE');
    expect(h.mail.sendSignatureInvitation).toHaveBeenCalledTimes(1);
    expect((await h.service.create(20, actor as never)).solicitud?.estado).toBe('PENDIENTE');
    expect(h.mail.sendSignatureInvitation).toHaveBeenCalledTimes(1);
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'SOLICITAR_FIRMA_CONTRATO' }), h.db);
  });

  it('firma confirmada conserva su descarga y no se revalida como una nueva contratación', async () => {
    const h = harness({ CONTRACT_SIGNATURE_ENABLED: 'false' }); h.contract.estado = 'Firmado'; h.row.estado = 'FIRMADA';
    h.store.findFirst.mockResolvedValue(h.row);
    const result = await h.service.status(20, actor as never);
    expect(result.signedDownloadAvailable).toBe(true); expect(result.sendAllowed).toBe(false);
    expect(h.db.factura.findMany).not.toHaveBeenCalled(); expect(h.store.update).not.toHaveBeenCalled();
  });
});
