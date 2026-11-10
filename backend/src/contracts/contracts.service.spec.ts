import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ContractsService } from './contracts.service';

const comercial: AuthUser = {
  idUsuario: 2,
  idEmpresa: 1,
  email: 'comercial@finet.local',
  nombreCompleto: 'Comercial FiNet',
  roles: ['Comercial'],
};

describe('ContractsService', () => {
  it('crea una contratación pendiente de firma sin crear servicio ni OT', async () => {
    const createdContract = {
      idContrato: 40,
      idCliente: 10,
      idPlan: 7,
      idEmpresa: 1,
      estado: 'Pendiente firma contrato',
      cliente: { idCliente: 10 },
      plan: { idPlan: 7, nombreComercial: 'Fibra 600' },
      zonaPago: null,
      servicios: [],
    };
    const prisma = {
      cliente: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ idCliente: 10, idEmpresa: 1, estado: 'Activo', contratos: [{ idEmpresa: 1 }] })
          .mockResolvedValueOnce({ idCliente: 10, estado: 'Activo', contratos: [{ estado: 'Activo' }, { estado: 'Pendiente firma contrato' }], servicios: [{ estadoOperativo: 'Activo' }] }),
        update: jest.fn(),
      },
      plan: { findUnique: jest.fn().mockResolvedValue({ idPlan: 7, idEmpresa: 1, activo: true }) },
      contrato: { create: jest.fn().mockResolvedValue(createdContract) },
      servicioContratado: { create: jest.fn() },
      ordenTrabajo: { create: jest.fn() },
    };
    const audit = { record: jest.fn() };
    const servicesService = { ensureInstallationServiceForContract: jest.fn() };
    Object.assign(prisma, { $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)) });
    const service = new ContractsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      servicesService as never,
    );

    const result = await service.createCustomerContract({ idCliente: 10, idPlan: 7 }, comercial);

    expect(result).toBe(createdContract);
    expect(prisma.contrato.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idCliente: 10, idPlan: 7, estado: 'Pendiente firma contrato' }),
    }));
    expect(prisma.cliente.update).not.toHaveBeenCalled();
    expect(prisma.servicioContratado.create).not.toHaveBeenCalled();
    expect(prisma.ordenTrabajo.create).not.toHaveBeenCalled();
  });

});

function signatureSetup() {
  const state = {
    contract: {
      idContrato: 30, idCliente: 10 as number | null, idProspecto: null as number | null,
      idEmpresa: 1, estado: 'Pendiente firma contrato',
      direccionInstalacion: 'Direccion QA',
      fechaFirmaManual: null as Date | null, idUsuarioFirmaManual: null as number | null,
      observacionFirmaManual: null as string | null,
    },
    customer: { idCliente: 10, estado: 'Pendiente firma contrato' },
    prospect: { idProspecto: 20, estadoPipeline: 'Pendiente firma contrato', direccion: 'Direccion QA' },
    addresses: [] as Array<{ direccionCompleta: string }>,
    otherContracts: [] as string[],
    document: {
      idContratoDigital: 11, idContrato: 30, idEmpresa: 1, version: 1,
      estadoFirma: 'Generado', fechaFirma: null as Date | null,
      hashDocumento: 'f'.repeat(64), urlDocumento: 'generated/contracts/qa-existing.pdf',
    } as { idContratoDigital: number; idContrato: number; idEmpresa: number; version: number; estadoFirma: string;
      fechaFirma: Date | null; hashDocumento: string; urlDocumento: string } | null,
    audits: [] as Array<Record<string, unknown>>,
  };
  const present = () => ({
    ...state.contract,
    cliente: state.contract.idCliente ? { ...state.customer, direcciones: state.addresses } : null,
    prospecto: state.contract.idProspecto ? { ...state.prospect } : null,
    plan: null, zonaPago: null, servicios: [],
  });
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    contrato: {
      findUnique: jest.fn().mockImplementation(async () => present()),
      update: jest.fn().mockImplementation(async ({ data }) => { Object.assign(state.contract, data); return present(); }),
    },
    cliente: {
      findUnique: jest.fn().mockImplementation(async () => ({
        ...state.customer,
        contratos: [{ estado: state.contract.estado }, ...state.otherContracts.map(estado => ({ estado }))],
        servicios: [],
      })),
      update: jest.fn().mockImplementation(async ({ data }) => { Object.assign(state.customer, data); return { ...state.customer }; }),
    },
    prospecto: {
      update: jest.fn().mockImplementation(async ({ data }) => { Object.assign(state.prospect, data); return { ...state.prospect }; }),
    },
    contratoDigital: {
      findFirst: jest.fn().mockImplementation(async () => state.document && { ...state.document }),
      update: jest.fn().mockImplementation(async ({ data }) => {
        Object.assign(state.document!, data); return { ...state.document! };
      }),
    },
    logAuditoria: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => { state.audits.push(data); return data; }),
    },
  };
  const outside = jest.fn().mockRejectedValue(new Error('OUTSIDE_TRANSACTION'));
  const prisma = {
    contrato: { findUnique: jest.fn().mockImplementation(async () => present()), update: outside },
    cliente: { findUnique: outside, update: outside },
    prospecto: { update: outside },
    contratoDigital: { findFirst: outside, update: outside },
    logAuditoria: { create: outside },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async work => {
    const before = structuredClone(state);
    try { return await work(tx); }
    catch (error) { Object.assign(state, before); throw error; }
  });
  const audit = new AuditService(prisma as unknown as PrismaService);
  const record = jest.spyOn(audit, 'record');
  const services = { ensureInstallationServiceForContract: jest.fn() };
  const config = new ConfigService({ CONTRACT_SIGNATURE_AUTOMATIC_COMPANIES: '[]', CONTRACT_SIGNATURE_MANUAL_COMPANIES: '[1]', CONTRACT_SIGNATURE_MANUAL_CONTRACTS: '[30]' });
  const service = new ContractsService(prisma as unknown as PrismaService, audit, services as never, config);
  return { state, tx, prisma, record, service, services, outside, present, config };
}

describe('Firma manual atomica', () => {
  it('confirma, reconcilia y audita dentro de la misma transaccion sin crear instalacion', async () => {
    const ctx = signatureSetup();
    const result = await ctx.service.confirmManualSignature(30, { observacion: '  Corroborada en oficina  ' }, comercial);
    expect(result.estado).toBe('Firmado');
    expect(result.cliente?.estado).toBe('Pendiente Instalacion');
    expect(ctx.state.contract.idUsuarioFirmaManual).toBe(comercial.idUsuario);
    expect(ctx.state.contract.observacionFirmaManual).toBe('Corroborada en oficina');
    expect(ctx.state.audits).toHaveLength(1);
    expect(ctx.record).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'CONFIRMAR_FIRMA_CONTRATO_MANUAL',
      valorNuevo: expect.objectContaining({ origenFirma: 'manual' }),
    }), ctx.tx);
    expect(ctx.outside).not.toHaveBeenCalled();
    expect(ctx.services.ensureInstallationServiceForContract).not.toHaveBeenCalled();
  });

  it('actualiza el prospecto sin inventar un cliente ni una instalacion', async () => {
    const ctx = signatureSetup();
    ctx.state.contract.idCliente = null;
    ctx.state.contract.idProspecto = 20;
    const result = await ctx.service.confirmManualSignature(30, {}, comercial);
    expect(result.prospecto?.estadoPipeline).toBe('Pendiente activacion');
    expect(result.idCliente).toBeNull();
    expect(ctx.tx.cliente.update).not.toHaveBeenCalled();
    expect(ctx.state.audits).toHaveLength(1);
    expect(ctx.outside).not.toHaveBeenCalled();
  });

  it.each(['cliente', 'prospecto', 'auditoria'])('revierte toda la firma si falla %s', async target => {
    const ctx = signatureSetup();
    if (target === 'prospecto') {
      ctx.state.contract.idCliente = null; ctx.state.contract.idProspecto = 20;
      ctx.tx.prospecto.update.mockRejectedValueOnce(new Error('FALLO_QA'));
    } else if (target === 'cliente') ctx.tx.cliente.update.mockRejectedValueOnce(new Error('FALLO_QA'));
    else ctx.tx.logAuditoria.create.mockRejectedValueOnce(new Error('FALLO_QA'));
    const before = structuredClone(ctx.state);
    await expect(ctx.service.confirmManualSignature(30, {}, comercial)).rejects.toThrow('FALLO_QA');
    expect(ctx.state).toEqual(before);
    expect(ctx.outside).not.toHaveBeenCalled();
  });

  it('la repeticion conserva fecha, observacion y una sola auditoria', async () => {
    const ctx = signatureSetup();
    const first = await ctx.service.confirmManualSignature(30, { observacion: 'Original' }, comercial);
    const before = structuredClone(ctx.state);
    const second = await ctx.service.confirmManualSignature(30, { observacion: 'No reemplazar' }, comercial);
    expect(second.fechaFirmaManual).toEqual(first.fechaFirmaManual);
    expect(ctx.state).toEqual(before);
    expect(ctx.tx.contrato.update).toHaveBeenCalledTimes(1);
    expect(ctx.state.audits).toHaveLength(1);
  });

  it.each(['Firmado', 'Activo', 'Suspendido', 'Moroso'])('conserva un contrato ya %s', async estado => {
    const ctx = signatureSetup();
    ctx.state.contract.estado = estado;
    const before = structuredClone(ctx.state);
    expect((await ctx.service.confirmManualSignature(30, {}, comercial)).estado).toBe(estado);
    expect(ctx.state).toEqual(before);
    expect(ctx.tx.contrato.update).not.toHaveBeenCalled();
    expect(ctx.record).not.toHaveBeenCalled();
  });

  it.each(['Moroso', 'Suspendido'])('no pisa el estado financiero %s del cliente', async estado => {
    const ctx = signatureSetup(); ctx.state.customer.estado = estado;
    await ctx.service.confirmManualSignature(30, {}, comercial);
    expect(ctx.state.customer.estado).toBe(estado);
    expect(ctx.tx.cliente.update).not.toHaveBeenCalled();
  });

  it.each(['Anulado', 'Baja'])('rechaza %s sin efectos', async estado => {
    const ctx = signatureSetup(); ctx.state.contract.estado = estado;
    const before = structuredClone(ctx.state);
    await expect(ctx.service.confirmManualSignature(30, {}, comercial)).rejects.toThrow('pendiente de firma');
    expect(ctx.state).toEqual(before);
    expect(ctx.record).not.toHaveBeenCalled();
  });

  it('valida la direccion actual dentro de la transaccion', async () => {
    const ctx = signatureSetup(); ctx.state.contract.direccionInstalacion = ' ';
    await expect(ctx.service.confirmManualSignature(30, {}, comercial)).rejects.toThrow('direccion');
    expect(ctx.tx.contrato.update).not.toHaveBeenCalled();
    expect(ctx.record).not.toHaveBeenCalled();
  });

  it('conserva la direccion alternativa del cliente', async () => {
    const ctx = signatureSetup(); ctx.state.contract.direccionInstalacion = '';
    ctx.state.addresses = [{ direccionCompleta: 'Direccion alternativa QA' }];
    expect((await ctx.service.confirmManualSignature(30, {}, comercial)).estado).toBe('Firmado');
  });

  it('rechaza empresa ajena antes de abrir una transaccion', async () => {
    const ctx = signatureSetup();
    await expect(ctx.service.confirmManualSignature(30, {}, { ...comercial, idEmpresa: 2 })).rejects.toThrow('empresa');
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
    expect(ctx.record).not.toHaveBeenCalled();
  });

  it('revalida la empresa tras esperar el bloqueo', async () => {
    const ctx = signatureSetup();
    ctx.tx.contrato.findUnique.mockResolvedValueOnce({ ...ctx.present(), idEmpresa: 2 });
    await expect(ctx.service.confirmManualSignature(30, {}, comercial)).rejects.toThrow('empresa');
    expect(ctx.tx.contrato.update).not.toHaveBeenCalled();
    expect(ctx.record).not.toHaveBeenCalled();
  });
});

describe('Conservacion del documento digital firmado', () => {
  it.each(['Firmado manualmente', 'Firmado', 'Firmado electrónicamente', 'Firmado electronicamente', 'Firmada electrónicamente', 'FIRMADO POR OTP'])(
    'impide degradar el estado persistido %s', async estadoFirma => {
      const ctx = signatureSetup(); ctx.state.document!.estadoFirma = estadoFirma;
      const before = structuredClone(ctx.state);
      await expect(ctx.service.updateDigitalContractStatus(30, { estadoFirma: 'Anulado' }, comercial)).rejects.toThrow('firmado');
      expect(ctx.state).toEqual(before);
      expect(ctx.tx.contratoDigital.update).not.toHaveBeenCalled();
      expect(ctx.record).not.toHaveBeenCalled();
    },
  );

  it('protege una fecha de firma persistida incluso si el estado es inconsistente', async () => {
    const ctx = signatureSetup();
    ctx.state.document!.estadoFirma = 'Enviado'; ctx.state.document!.fechaFirma = new Date('2026-01-01');
    await expect(ctx.service.updateDigitalContractStatus(30, { estadoFirma: 'Generado' }, comercial)).rejects.toThrow('firmado');
    expect(ctx.tx.contratoDigital.update).not.toHaveBeenCalled();
  });

  it('repetir la misma firma no altera fecha, hash, archivo ni auditoria', async () => {
    const ctx = signatureSetup();
    await ctx.service.updateDigitalContractStatus(30, { estadoFirma: 'Firmado manualmente' }, comercial);
    const before = structuredClone(ctx.state);
    await ctx.service.updateDigitalContractStatus(30, { estadoFirma: 'Firmado manualmente' }, comercial);
    expect(ctx.state).toEqual(before);
    expect(ctx.tx.contratoDigital.update).toHaveBeenCalledTimes(1);
    expect(ctx.record).toHaveBeenCalledTimes(1);
    expect(ctx.record).toHaveBeenCalledWith(expect.anything(), ctx.tx);
  });

  it('no permite relabelar una firma electronica persistida como manual', async () => {
    const ctx = signatureSetup(); ctx.state.document!.estadoFirma = 'Firmado electrónicamente';
    await expect(ctx.service.updateDigitalContractStatus(30, { estadoFirma: 'Firmado manualmente' }, comercial)).rejects.toThrow('firmado');
  });

  it('usa la version vigente leida dentro de la transaccion y conserva los bytes referenciados', async () => {
    const ctx = signatureSetup();
    ctx.tx.$queryRaw.mockImplementationOnce(async () => {
      ctx.state.document = { ...ctx.state.document!, idContratoDigital: 22, version: 2 };
      return [];
    });
    await ctx.service.updateDigitalContractStatus(30, { estadoFirma: 'Enviado' }, comercial);
    expect(ctx.tx.contratoDigital.update).toHaveBeenCalledWith({
      where: { idContratoDigital: 22 }, data: { estadoFirma: 'Enviado', fechaFirma: null },
    });
    expect(ctx.state.document!.hashDocumento).toBe('f'.repeat(64));
    expect(ctx.state.document!.urlDocumento).toBe('generated/contracts/qa-existing.pdf');
    expect(ctx.outside).not.toHaveBeenCalled();
  });

  it('revierte el estado documental si falla su auditoria', async () => {
    const ctx = signatureSetup(); const before = structuredClone(ctx.state);
    ctx.tx.logAuditoria.create.mockRejectedValueOnce(new Error('AUDIT_FAILED_QA'));
    await expect(ctx.service.updateDigitalContractStatus(30, { estadoFirma: 'Firmado manualmente' }, comercial)).rejects.toThrow('AUDIT_FAILED_QA');
    expect(ctx.state).toEqual(before);
  });

  it('rechaza un contrato sin documento antes de cualquier escritura', async () => {
    const ctx = signatureSetup(); ctx.state.document = null;
    await expect(ctx.service.updateDigitalContractStatus(30, { estadoFirma: 'Enviado' }, comercial)).rejects.toThrow('generado');
    expect(ctx.tx.contratoDigital.update).not.toHaveBeenCalled(); expect(ctx.record).not.toHaveBeenCalled();
  });

  it('rechaza otra empresa y revalida el alcance bajo bloqueo', async () => {
    const ctx = signatureSetup();
    await expect(ctx.service.updateDigitalContractStatus(30, { estadoFirma: 'Enviado' }, { ...comercial, idEmpresa: 2 })).rejects.toThrow('empresa');
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
    ctx.tx.contrato.findUnique.mockResolvedValueOnce({ ...ctx.present(), idEmpresa: 2 });
    await expect(ctx.service.updateDigitalContractStatus(30, { estadoFirma: 'Enviado' }, comercial)).rejects.toThrow('empresa');
    expect(ctx.tx.contratoDigital.update).not.toHaveBeenCalled();
  });
});


describe('Política de firma sin retorno manual implícito', () => {
  it.each(['false','true'])('automático bloquea ambas APIs manuales con servicio enabled=%s', async enabled => {
    const ctx = signatureSetup(); ctx.config.set('CONTRACT_SIGNATURE_AUTOMATIC_COMPANIES','[1]');
    ctx.config.set('CONTRACT_SIGNATURE_ENABLED',enabled);
    const before=structuredClone(ctx.state);
    await expect(ctx.service.confirmManualSignature(30,{},comercial)).rejects.toMatchObject({status:409});
    await expect(ctx.service.updateDigitalContractStatus(30,{estadoFirma:'Firmado manualmente'},comercial)).rejects.toMatchObject({status:409});
    expect(ctx.state).toEqual(before); expect(ctx.record).not.toHaveBeenCalled();
  });
  it.each(['EXPIRADA','ANULADA','FALLIDO','EN_PROCESO'])('la asignación persistida bloquea manual con solicitud %s y sin configuración automática', async () => {
    const ctx=signatureSetup(); ctx.tx.logAuditoria.findFirst.mockResolvedValue({idLog:1});
    ctx.config.set('CONTRACT_SIGNATURE_AUTOMATIC_COMPANIES','[]');ctx.config.set('CONTRACT_SIGNATURE_ENABLED','false');
    const before=structuredClone(ctx.state);
    await expect(ctx.service.confirmManualSignature(30,{},comercial)).rejects.toThrow('automática');
    await expect(ctx.service.updateDigitalContractStatus(30,{estadoFirma:'Firmado manualmente'},comercial)).rejects.toThrow('automática');
    expect(ctx.state).toEqual(before);
  });
  it('modo desconocido no es permiso manual', async()=>{
    const ctx=signatureSetup();ctx.config.set('CONTRACT_SIGNATURE_MANUAL_CONTRACTS','[]');
    await expect(ctx.service.confirmManualSignature(30,{},comercial)).rejects.toMatchObject({status:409});
    expect(ctx.tx.contrato.update).not.toHaveBeenCalled();
  });
  it('un documento anulado no puede reactivarse por etiqueta',async()=>{
    const ctx=signatureSetup();ctx.state.document!.estadoFirma='Anulado';
    await expect(ctx.service.updateDigitalContractStatus(30,{estadoFirma:'Generado'},comercial)).rejects.toThrow('no se reactiva');
    expect(ctx.tx.contratoDigital.update).not.toHaveBeenCalled();
  });
});
