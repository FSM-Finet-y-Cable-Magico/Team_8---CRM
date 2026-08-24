import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CommercialControlService } from './commercial-control.service';

const commercialUser: AuthUser = {
  idUsuario: 7,
  idEmpresa: 1,
  email: 'comercial@finet.local',
  nombreCompleto: 'Comercial FiNet',
  roles: ['Comercial'],
};

const config = { get: jest.fn().mockReturnValue(undefined) };

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function invoiceFactory(overrides: Record<string, unknown> = {}) {
  return {
    idFactura: 100,
    idContrato: 10,
    periodoMes: 8,
    periodoAnio: 2026,
    monto: new Prisma.Decimal(10000),
    fechaEmision: daysFromNow(-20),
    fechaLimitePago: daysFromNow(5),
    estado: 'Emitida',
    pagos: [],
    contrato: {
      idContrato: 10,
      idCliente: 1,
      idPlan: 3,
      idEmpresa: 1,
      idZonaPago: 2,
      fechaInicio: daysFromNow(-90),
      diaVencimiento: 5,
      estado: 'Activo',
      fechaSuspension: null,
      cliente: {
        idCliente: 1,
        idEmpresa: 1,
        rut: '12345678-5',
        nombreCompleto: 'Cliente Demo',
        email: 'cliente@demo.local',
        telefono: '+56911111111',
        estado: 'Activo',
        empresa: { idEmpresa: 1, nombre: 'FiNet Limitada', rutEmpresa: null, esquemaDb: null },
        direcciones: [{ idDireccion: 1, direccionCompleta: 'Av. Principal 123', comuna: 'Litoral', ciudad: null, esPrincipal: true, idCliente: 1 }],
      },
      plan: {
        idPlan: 3,
        idEmpresa: 1,
        nombreComercial: 'Fibra 600',
        tipoPlan: 'Internet',
        tipoCliente: 'Hogar',
        velocidadMbps: 600,
        precioMensual: new Prisma.Decimal(10000),
        descripcion: null,
        activo: true,
      },
      zonaPago: {
        idZonaPago: 2,
        idEmpresa: 1,
        nombreZona: 'Centro',
        comuna: 'Litoral',
        descripcion: null,
        diaVencimientoSugerido: 5,
        activo: true,
      },
      servicios: [
        {
          idServicio: 55,
          idCliente: 1,
          idEmpresa: 1,
          idContrato: 10,
          idDireccion: 1,
          idZonaPago: 2,
          tipoServicio: 'Internet',
          estadoOperativo: 'Activo',
          observaciones: null,
          datosTecnicos: null,
          fechaCreacion: daysFromNow(-90),
          direccion: { idDireccion: 1, direccionCompleta: 'Av. Principal 123', comuna: 'Litoral', ciudad: null, esPrincipal: true, idCliente: 1 },
          zonaPago: {
            idZonaPago: 2,
            idEmpresa: 1,
            nombreZona: 'Centro',
            comuna: 'Litoral',
            descripcion: null,
            diaVencimientoSugerido: 5,
            activo: true,
          },
        },
      ],
    },
    ...overrides,
  };
}

function serviceFactory(prismaOverrides: Record<string, unknown>) {
  const prisma = {
    factura: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
      ...((prismaOverrides.factura as Record<string, unknown>) ?? {}),
    },
    eventoGestionComercial: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      ...((prismaOverrides.eventoGestionComercial as Record<string, unknown>) ?? {}),
    },
    usuario: {
      findMany: jest.fn().mockResolvedValue([]),
      ...((prismaOverrides.usuario as Record<string, unknown>) ?? {}),
    },
    cliente: {
      findUnique: jest.fn(),
      ...((prismaOverrides.cliente as Record<string, unknown>) ?? {}),
    },
    contrato: {
      findUnique: jest.fn(),
      update: jest.fn(),
      ...((prismaOverrides.contrato as Record<string, unknown>) ?? {}),
    },
    servicioContratado: {
      findUnique: jest.fn(),
      ...((prismaOverrides.servicioContratado as Record<string, unknown>) ?? {}),
    },
    pago: {
      findUnique: jest.fn(),
      update: jest.fn(),
      ...((prismaOverrides.pago as Record<string, unknown>) ?? {}),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  return {
    prisma,
    audit,
    service: new CommercialControlService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      config as never,
    ),
  };
}

describe('CommercialControlService', () => {
  it('calcula saldo pendiente desde factura y pagos existentes', async () => {
    const invoice = invoiceFactory({
      pagos: [{ monto: new Prisma.Decimal(4000) }],
    });
    const { service } = serviceFactory({
      factura: { findMany: jest.fn().mockResolvedValue([invoice]) },
    });

    const rows = await service.list({}, commercialUser);

    expect(rows[0]).toEqual(expect.objectContaining({
      montoFacturado: 10000,
      montoPagado: 4000,
      saldoPendiente: 6000,
    }));
  });

  it('marca facturas pagadas como REGULARIZADO sin duplicar deuda', async () => {
    const invoice = invoiceFactory({
      estado: 'Pagada',
      pagos: [{ monto: new Prisma.Decimal(10000) }],
    });
    const { service } = serviceFactory({
      factura: { findMany: jest.fn().mockResolvedValue([invoice]) },
    });

    const rows = await service.list({}, commercialUser);

    expect(rows[0].estadoComercial).toBe('REGULARIZADO');
    expect(rows[0].saldoPendiente).toBe(0);
  });

  it('calcula VENCIDO y MOROSO segun dias de atraso', async () => {
    const vencido = invoiceFactory({ idFactura: 101, fechaLimitePago: daysFromNow(-2) });
    const moroso = invoiceFactory({ idFactura: 102, fechaLimitePago: daysFromNow(-8) });
    const { service } = serviceFactory({
      factura: { findMany: jest.fn().mockResolvedValue([vencido, moroso]) },
    });

    const rows = await service.list({}, commercialUser);

    expect(rows.find((row) => row.idFactura === 101)?.estadoComercial).toBe('VENCIDO');
    expect(rows.find((row) => row.idFactura === 102)?.estadoComercial).toBe('MOROSO');
  });

  it('prioriza AVISO_CORTE sobre estado vencido calculado', async () => {
    const invoice = invoiceFactory({ fechaLimitePago: daysFromNow(-10) });
    const { service } = serviceFactory({
      factura: { findMany: jest.fn().mockResolvedValue([invoice]) },
      eventoGestionComercial: {
        findMany: jest.fn().mockResolvedValue([
          {
            idEvento: BigInt(1),
            idCliente: 1,
            idContrato: 10,
            idFactura: 100,
            idPago: null,
            idServicio: 55,
            idUsuario: 7,
            idEmpresa: 1,
            tipoEvento: 'AVISO_CORTE',
            canal: 'MANUAL',
            estado: 'REGISTRADO',
            mensajeGenerado: null,
            respuestaCliente: null,
            observacion: null,
            montoRelacionado: null,
            fechaCompromiso: null,
            fechaEvento: new Date(),
            metadataJson: null,
            createdAt: new Date(),
          },
        ]),
      },
      usuario: {
        findMany: jest.fn().mockResolvedValue([{ idUsuario: 7, nombreCompleto: 'Comercial FiNet' }]),
      },
    });

    const rows = await service.list({}, commercialUser);

    expect(rows[0].estadoComercial).toBe('AVISO_CORTE_ENVIADO');
    expect(rows[0].ultimoEventoResponsable).toBe('Comercial FiNet');
  });

  it('registra evento comercial con auditoria sin modificar factura, pago ni contrato', async () => {
    const created = {
      idEvento: BigInt(9),
      idCliente: 1,
      idContrato: 10,
      idFactura: 100,
      idPago: null,
      idServicio: 55,
      idUsuario: 7,
      idEmpresa: 1,
      tipoEvento: 'AVISO_PAGO',
      canal: 'MANUAL',
      estado: 'REGISTRADO',
      mensajeGenerado: null,
      respuestaCliente: null,
      observacion: 'Aviso registrado',
      montoRelacionado: null,
      fechaCompromiso: null,
      fechaEvento: new Date(),
      metadataJson: null,
      createdAt: new Date(),
    };
    const { service, prisma, audit } = serviceFactory({
      cliente: {
        findUnique: jest.fn().mockResolvedValue({
          idCliente: 1,
          idEmpresa: 1,
          contratos: [{ idContrato: 10, idEmpresa: 1 }],
        }),
      },
      contrato: {
        findUnique: jest.fn().mockResolvedValue({ idContrato: 10, idCliente: 1, idEmpresa: 1 }),
      },
      factura: {
        findUnique: jest.fn().mockResolvedValue({
          idFactura: 100,
          contrato: { idContrato: 10, idCliente: 1, idEmpresa: 1 },
        }),
        update: jest.fn(),
      },
      servicioContratado: {
        findUnique: jest.fn().mockResolvedValue({
          idServicio: 55,
          idCliente: 1,
          idContrato: 10,
          idEmpresa: 1,
        }),
      },
      eventoGestionComercial: {
        create: jest.fn().mockResolvedValue(created),
      },
    });

    const result = await service.createEvent({
      idCliente: 1,
      idContrato: 10,
      idFactura: 100,
      idServicio: 55,
      tipoEvento: 'AVISO_PAGO',
      canal: 'MANUAL',
      estado: 'REGISTRADO',
      observacion: 'Aviso registrado',
    }, commercialUser);

    expect(result.idEvento).toBe('9');
    expect(prisma.eventoGestionComercial.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'REGISTRAR_EVENTO_GESTION_COMERCIAL',
      entidadAfectada: 'evento_gestion_comercial',
    }));
    expect(prisma.factura.update).not.toHaveBeenCalled();
    expect(prisma.pago.update).not.toHaveBeenCalled();
    expect(prisma.contrato.update).not.toHaveBeenCalled();
  });

  it('rechaza registro de evento para cliente inexistente', async () => {
    const { service } = serviceFactory({
      cliente: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(service.createEvent({
      idCliente: 999,
      tipoEvento: 'AVISO_PAGO',
      canal: 'MANUAL',
      estado: 'REGISTRADO',
    }, commercialUser)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza contrato que no pertenece al cliente informado', async () => {
    const { service } = serviceFactory({
      cliente: {
        findUnique: jest.fn().mockResolvedValue({
          idCliente: 1,
          idEmpresa: 1,
          contratos: [{ idContrato: 10, idEmpresa: 1 }],
        }),
      },
      contrato: {
        findUnique: jest.fn().mockResolvedValue({ idContrato: 99, idCliente: 2, idEmpresa: 1 }),
      },
    });

    await expect(service.createEvent({
      idCliente: 1,
      idContrato: 99,
      tipoEvento: 'AVISO_PAGO',
      canal: 'MANUAL',
      estado: 'REGISTRADO',
    }, commercialUser)).rejects.toBeInstanceOf(BadRequestException);
  });
});
