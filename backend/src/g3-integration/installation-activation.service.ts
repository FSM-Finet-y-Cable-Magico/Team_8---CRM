import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { IntegracionInstalacionG3, Prisma } from '@prisma/client';
import { serviceTypeFromPlan } from '../common/service-type';
import { canActivateService } from '../services/service-activation.policy';
import { G3InstallationPayload } from './g3-integration.types';

@Injectable()
export class InstallationActivationService {
  async activate(
    tx: Prisma.TransactionClient,
    tracking: IntegracionInstalacionG3,
    technicalResult: unknown,
  ) {
    if (!canActivateService({
      intent: 'INSTALLATION_COMPLETION',
      targetStatus: 'Activo',
      installationCompleted: true,
    })) {
      throw new BadRequestException('La instalacion no cumple la politica de activacion');
    }

    const contract = await tx.contrato.findUnique({
      where: { idContrato: tracking.idContrato },
      include: { plan: true, prospecto: true },
    });
    if (!contract || !contract.plan) throw new BadRequestException('El contrato o plan de la instalacion ya no existe');
    if (contract.idEmpresa !== tracking.idEmpresa || contract.plan.idEmpresa !== tracking.idEmpresa) {
      throw new BadRequestException('El contrato o plan no corresponde a la empresa del tracking');
    }
    if (tracking.idProspecto && contract.idProspecto !== tracking.idProspecto) {
      throw new BadRequestException('El contrato no corresponde al prospecto del tracking');
    }

    const payload = tracking.payloadSnapshot as G3InstallationPayload;
    const now = new Date();
    let customer = tracking.idCliente
      ? await tx.cliente.findUnique({ where: { idCliente: tracking.idCliente } })
      : contract.idCliente
        ? await tx.cliente.findUnique({ where: { idCliente: contract.idCliente } })
        : contract.prospecto?.idCliente
          ? await tx.cliente.findUnique({ where: { idCliente: contract.prospecto.idCliente } })
          : null;

    if (!customer) customer = await tx.cliente.findUnique({ where: { rut: payload.rut } });
    if (customer && customer.idEmpresa !== tracking.idEmpresa) {
      throw new ConflictException('El RUT ya pertenece a un cliente de otra empresa');
    }
    if (!customer) {
      customer = await tx.cliente.create({
        data: {
          idEmpresa: tracking.idEmpresa,
          rut: payload.rut,
          nombreCompleto: payload.persona.nombre_completo,
          telefono: payload.persona.telefono,
          email: contract.prospecto?.email,
          estado: 'Activo',
          origenContacto: contract.prospecto?.origenContacto,
        },
      });
    } else if (customer.estado !== 'Activo') {
      customer = await tx.cliente.update({
        where: { idCliente: customer.idCliente },
        data: { estado: 'Activo' },
      });
    }

    let address = await tx.direccionServicio.findFirst({
      where: {
        idCliente: customer.idCliente,
        direccionCompleta: payload.direccion.direccion_completa,
        comuna: payload.direccion.comuna,
      },
      orderBy: { idDireccion: 'asc' },
    });
    if (!address) {
      address = await tx.direccionServicio.create({
        data: {
          idCliente: customer.idCliente,
          direccionCompleta: payload.direccion.direccion_completa,
          comuna: payload.direccion.comuna,
          ciudad: contract.ciudadInstalacion?.trim() || null,
          esPrincipal: true,
        },
      });
    }

    let service = tracking.idServicio
      ? await tx.servicioContratado.findUnique({ where: { idServicio: tracking.idServicio } })
      : await tx.servicioContratado.findFirst({
        where: { idContrato: contract.idContrato, idEmpresa: tracking.idEmpresa, estadoOperativo: { not: 'Baja' } },
        orderBy: { idServicio: 'asc' },
      });
    if (service && (service.idCliente !== customer.idCliente || service.idEmpresa !== tracking.idEmpresa)) {
      throw new BadRequestException('El servicio pendiente no corresponde al cliente y empresa de la instalacion');
    }

    const technicalData = this.mergeTechnicalData(service?.datosTecnicos, technicalResult, tracking);
    if (service) {
      service = await tx.servicioContratado.update({
        where: { idServicio: service.idServicio },
        data: {
          idDireccion: address.idDireccion,
          idContrato: contract.idContrato,
          estadoOperativo: 'Activo',
          fechaActivacion: service.fechaActivacion ?? now,
          datosTecnicos: technicalData,
        },
      });
    } else {
      const serviceType = serviceTypeFromPlan(contract.plan.tipoPlan);
      if (!serviceType) throw new BadRequestException('El plan no permite determinar el tipo de servicio');
      service = await tx.servicioContratado.create({
        data: {
          idCliente: customer.idCliente,
          idEmpresa: tracking.idEmpresa,
          idContrato: contract.idContrato,
          idDireccion: address.idDireccion,
          idZonaPago: contract.idZonaPago,
          tipoServicio: serviceType,
          estadoOperativo: 'Activo',
          fechaActivacion: now,
          datosTecnicos: technicalData,
        },
      });
    }

    await tx.contrato.update({
      where: { idContrato: contract.idContrato },
      data: { idCliente: customer.idCliente, estado: 'Activo' },
    });

    if (contract.prospecto) {
      if (contract.prospecto.idEmpresa !== tracking.idEmpresa) {
        throw new BadRequestException('El prospecto no corresponde a la empresa del tracking');
      }
      const conversionDays = contract.prospecto.fechaCreacion
        ? Math.max(0, Math.ceil((now.getTime() - contract.prospecto.fechaCreacion.getTime()) / 86_400_000))
        : null;
      await tx.prospecto.update({
        where: { idProspecto: contract.prospecto.idProspecto },
        data: {
          idCliente: customer.idCliente,
          estadoPipeline: 'Servicio Activo',
          motivoPerdida: null,
          fechaConversion: now,
          tiempoConversionDias: conversionDays,
        },
      });
    }

    return {
      idCliente: customer.idCliente,
      idDireccion: address.idDireccion,
      idServicio: service.idServicio,
      fechaActivacion: service.fechaActivacion ?? now,
    };
  }

  private mergeTechnicalData(
    existing: Prisma.JsonValue | null | undefined,
    technicalResult: unknown,
    tracking: IntegracionInstalacionG3,
  ): Prisma.InputJsonValue {
    const base = existing && typeof existing === 'object' && !Array.isArray(existing)
      ? existing as Record<string, Prisma.JsonValue>
      : {};
    return {
      ...base,
      fuenteInstalacion: 'G3',
      idOtG3: tracking.idOtG3,
      codigoOtG3: tracking.codigoOtG3,
      resultadoInstalacion: technicalResult === undefined ? null : technicalResult as Prisma.InputJsonValue,
    } as Prisma.InputJsonValue;
  }
}
