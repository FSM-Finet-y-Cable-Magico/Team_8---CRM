import { ConfigService } from '@nestjs/config';
import { ESignatureService } from './e-signature.service';
import { SIGNATURE_CONSENT_VERSION } from './e-signature.config';
import { MailService } from '../mail/mail.service';

describe('Aceptación desde enlace personal', () => {
  function setup(overrides = {}) {
    const row = { idSolicitud: 'qa', estado: 'PENDIENTE', hashOriginal: 'a'.repeat(64), pdfVisto: new Date(),
      correoEstado: 'ENVIADO', idContrato: 3, idContratoDigital: 4, idEmpresa: 1, idUsuarioCreador: 2, ...overrides };
    const tx = { contratoDigital: { update: jest.fn() }, $queryRaw: jest.fn().mockResolvedValue([{ ...row, pdfOriginal: Buffer.from('%PDF-QA') }]) };
    const contracts = { markContractSigned: jest.fn() };
    const mail = { sendSignatureCode: jest.fn() };
    const audit = { record: jest.fn() };
    const service = new ESignatureService({} as never, new ConfigService(), mail as never, audit as never, contracts as never);
    const internals = service as unknown as { withToken: (token: string, action: (tx: unknown, row: unknown) => unknown) => Promise<unknown>;
      seal: () => Promise<Buffer>; deliverSigned: () => Promise<void> };
    jest.spyOn(internals, 'withToken').mockImplementation(async (_token, action) => {
      const result = await action(tx, row) as { failure?: string };
      if (result.failure) throw new Error(result.failure);
      return result;
    });
    jest.spyOn(internals, 'seal').mockResolvedValue(Buffer.from('%PDF-QA'));
    jest.spyOn(internals, 'deliverSigned').mockResolvedValue();
    return { service, contracts, mail, audit };
  }
  it('registra firma sin código conservando constancia y auditoría', async () => {
    const h = setup();
    await expect(h.service.sign('enlace', '', 'a'.repeat(64), true, SIGNATURE_CONSENT_VERSION, '127.0.0.1', 'QA')).resolves.toEqual({ estado: 'FIRMADA' });
    expect(h.contracts.markContractSigned).toHaveBeenCalledTimes(1);
    expect(h.mail.sendSignatureCode).not.toHaveBeenCalled();
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'FIRMAR_CONTRATO_CORREO' }), expect.anything());
  });
  it.each([
    [{ pdfVisto: null }, 'Revisa el contrato'],
    [{ correoEstado: 'FALLIDO' }, 'entrega del enlace'],
    [{ hashOriginal: 'b'.repeat(64) }, 'PDF revisado no coincide'],
  ])('rechaza evidencia incompleta %j', async (overrides, message) => {
    const h = setup(overrides);
    await expect(h.service.sign('enlace', '', 'a'.repeat(64), true, SIGNATURE_CONSENT_VERSION, '', '')).rejects.toThrow(message);
    expect(h.contracts.markContractSigned).not.toHaveBeenCalled();
  });
  it('rechaza una aceptación sin consentimiento', async () => {
    const h = setup();
    await expect(h.service.sign('enlace', '', 'a'.repeat(64), false, SIGNATURE_CONSENT_VERSION, '', '')).rejects.toThrow('acepta sus condiciones');
    expect(h.contracts.markContractSigned).not.toHaveBeenCalled();
  });
});

describe('Correos del contrato', () => {
  it('ofrece botón en invitación y confirmación formal con adjunto sin pedir códigos', async () => {
    const service = new MailService(new ConfigService());
    const send = jest.spyOn(service as unknown as { sendMessage: (message: unknown) => Promise<unknown> }, 'sendMessage').mockResolvedValue({ status: 'sent' });
    await service.sendSignatureInvitation({ idEmpresa: 1, to: 'qa@example.invalid', link: 'https://example.invalid/firmar#personal' });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ html: expect.stringContaining('Revisar y firmar contrato'), text: expect.not.stringContaining('código') }));
    const pdf = Buffer.from('%PDF-QA');
    await service.sendSignedContract({ idEmpresa: 1, to: 'qa@example.invalid', pdf, filename: 'contrato.pdf' });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ pdf, html: expect.stringContaining('Contrato firmado correctamente') }));
  });
});
