import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { ContractsService } from './contracts.service';
import { ESignatureService } from './e-signature.service';
import { SIGNATURE_CONSENT_VERSION } from './e-signature.config';
import { Prisma } from '@prisma/client';

jest.mock('./signature.repository', () => ({
  signatureStorageAvailable: jest.fn(async () => true),
  signatureRepository: (tx: { signature: unknown }) => tx.signature,
}));

describe('Cancelar una contratación pendiente de firma', () => {
  function setup({ state = 'Pendiente firma contrato', signedDocument = false, signedRequest = false, serviceCount = 0, installationCount = 0, invoiceCount = 0, prospectOnly = false } = {}) {
    const token = 'k'.repeat(43);
    const prospect = { idProspecto: 40, idCliente: null, estadoPipeline: 'Pendiente firma' };
    const contract = { idContrato: 10, idCliente: prospectOnly ? null : 20, idEmpresa: 1, idProspecto: prospectOnly ? 40 : null, estado: state, fechaFirmaManual: null,
      cliente: prospectOnly ? null : { idCliente: 20, rut: '11111111-1' }, prospecto: prospectOnly ? prospect : null };
    const document = { idContratoDigital: 30, idContrato: 10, idEmpresa: 1, version: 1,
      estadoFirma: signedDocument ? 'Firmado electronicamente' : 'Generado', fechaFirma: signedDocument ? new Date() : null };
    const row = { idSolicitud: 'qa-request', idContrato: 10, idContratoDigital: 30, idEmpresa: 1, version: 1,
      estado: signedRequest ? 'FIRMADA' : 'PENDIENTE', motivoAnulacion: null, tokenHash: createHash('sha256').update(token).digest('hex'),
      otpHash: 'otp-hash', otpExpiracion: new Date(), pdfOriginal: Buffer.from('%PDF-QA'), fechaExpiracion: new Date('2099-01-01') };
    const signature = {
      findFirst: jest.fn(async () => row.estado === 'FIRMADA' ? { ...row } : null),
      findUnique: jest.fn(async () => ({ ...row })),
      updateMany: jest.fn(async ({ where, data }) => { if (row.estado !== where.estado) return { count: 0 }; Object.assign(row, data); return { count: 1 }; }),
    };
    const tx = {
      $queryRaw: jest.fn(async () => []), signature,
      contrato: { findUnique: jest.fn(async () => ({ ...contract })), update: jest.fn(async ({ data }) => { Object.assign(contract, data); return { ...contract }; }) },
      contratoDigital: { findMany: jest.fn(async () => [{ ...document }]), findUnique: jest.fn(async () => ({ ...document })),
        updateMany: jest.fn(async ({ data }) => { Object.assign(document, data); return { count: 1 }; }) },
      servicioContratado: { count: jest.fn(async () => serviceCount) },
      integracionInstalacionG3: { count: jest.fn(async () => installationCount) },
      factura: { count: jest.fn(async () => invoiceCount) },
      prospecto: { findUnique: jest.fn(async () => ({ ...prospect })), update: jest.fn(async ({ data }) => { Object.assign(prospect, data); return { ...prospect }; }) },
    };
    const db = { ...tx, $transaction: jest.fn(async work => work(tx)) };
    const audit = { record: jest.fn() };
    const config = new ConfigService({ NODE_ENV: 'test', CONTRACT_SIGNATURE_ENABLED: 'true', CONTRACT_SIGNATURE_COMPANIES: '[1]',
      CONTRACT_SIGNATURE_PUBLIC_URL: 'http://localhost/', CONTRACT_SIGNATURE_OTP_SECRET: 'a'.repeat(64) });
    const service = new ContractsService(db as never, audit as never, {} as never, config);
    const mail = { sendSignatureInvitation: jest.fn(), sendSignedContract: jest.fn() };
    const electronic = new ESignatureService(db as never, config, mail as never, audit as never, service);
    const actor = { idUsuario: 2, idEmpresa: 1, roles: ['Comercial'] } as never;
    return { service, electronic, actor, tx, db, row, document, contract, audit, token };
  }

  it('anula el contrato, documentos y solicitudes; el enlace deja de servir para ver, descargar o firmar', async () => {
    const h = setup();
    expect(await h.service.cancelPendingContract(10, h.actor)).toMatchObject({ estado: 'Anulado' });
    expect(h.document.estadoFirma).toBe('Anulado');
    expect(h.row).toMatchObject({ estado: 'ANULADA', motivoAnulacion: 'CONTRATO_CANCELADO', otpHash: null, otpExpiracion: null });
    await expect(h.electronic.view(h.token)).rejects.toThrow('contrato fue cancelado');
    await expect(h.electronic.pdf(h.token)).rejects.toThrow('contrato fue cancelado');
    await expect(h.electronic.sign(h.token, '', 'a'.repeat(64), true, SIGNATURE_CONSENT_VERSION, '', '')).rejects.toThrow('contrato fue cancelado');
    await h.service.cancelPendingContract(10, h.actor);
    expect(h.tx.contrato.update).toHaveBeenCalledTimes(1);
    expect(h.audit.record).toHaveBeenCalledTimes(1);
  });

  it.each([{ state: 'Firmado' }, { signedDocument: true }, { signedRequest: true },
    { serviceCount: 1 }, { installationCount: 1 }, { invoiceCount: 1 }])('protege una contratación con firma o actividad existente: %j', async options => {
    const h = setup(options);
    await expect(h.service.cancelPendingContract(10, h.actor)).rejects.toThrow();
    expect(h.tx.contrato.update).not.toHaveBeenCalled();
    expect(h.tx.contratoDigital.updateMany).not.toHaveBeenCalled();
    expect(h.tx.signature.updateMany).not.toHaveBeenCalled();
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('vuelve a validar después del bloqueo y no cancela si la firma ganó la carrera', async () => {
    const h = setup();
    h.tx.$queryRaw.mockImplementationOnce(async () => { h.contract.estado = 'Firmado'; return []; });
    await expect(h.service.cancelPendingContract(10, h.actor)).rejects.toThrow('no está pendiente');
    expect(h.tx.contrato.update).not.toHaveBeenCalled();
  });

  it('rechaza al operador de otra empresa antes de escribir', async () => {
    const h = setup();
    await expect(h.service.cancelPendingContract(10, { idUsuario: 3, idEmpresa: 2, roles: ['Comercial'] } as never)).rejects.toThrow();
    expect(h.tx.contrato.update).not.toHaveBeenCalled();
  });

  it('la primera contratación vuelve a habilitar el ciclo comercial del prospecto', async () => {
    const h = setup({ prospectOnly: true });
    await h.service.cancelPendingContract(10, h.actor);
    expect(h.tx.prospecto.update).toHaveBeenCalledWith({ where: { idProspecto: 40 }, data: { estadoPipeline: 'Factible' } });
  });

  it('reintenta un conflicto de serialización y registra una sola cancelación', async () => {
    const h = setup();
    h.db.$transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Serialization conflict', { code: 'P2034', clientVersion: '5.22.0' }));
    await expect(h.service.cancelPendingContract(10, h.actor)).resolves.toMatchObject({ estado: 'Anulado' });
    expect(h.db.$transaction).toHaveBeenCalledTimes(2);
    expect(h.audit.record).toHaveBeenCalledTimes(1);
  });
});
