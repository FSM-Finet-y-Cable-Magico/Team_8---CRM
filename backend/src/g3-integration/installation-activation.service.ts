import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { IntegracionInstalacionG3, Prisma } from '@prisma/client';
import { serviceTypeFromPlan } from '../common/service-type';
import { canActivateService } from '../services/service-activation.policy';
import { validateRut } from '../rut/rut.util';
import { installationSnapshot } from './g3-integration.utils';

@Injectable()
export class InstallationActivationService {
  async activate(
    tx: Prisma.TransactionClient,
    tracking: IntegracionInstalacionG3,
    technicalResult: unknown,
  ) {
    const payload = installationSnapshot(tracking);
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
    if (contract.idPlan !== tracking.idPlan || contract.plan.idPlan !== tracking.idPlan) {
      throw new BadRequestException('El plan del contrato no corresponde al tracking');
    }
    if (!['Firmado', 'Activo'].includes(contract.estado)) {
      throw new BadRequestException('El estado del contrato no permite activar la instalacion');
    }
    if (!contract.prospecto || contract.idProspecto !== tracking.idProspecto
      || contract.prospecto.idProspecto !== tracking.idProspecto
      || contract.prospecto.idEmpresa !== tracking.idEmpresa) {
      throw new BadRequestException('El contrato no corresponde al prospecto del tracking');
    }

    const now = new Date();
    const references = [tracking.idCliente, contract.prospecto.idCliente];
    if (references.some((id) => id != null && id !== contract.idCliente)) {
      throw new BadRequestException('Las referencias de cliente no corresponden al contrato objetivo');
    }
    let customer = contract.idCliente != null
      ? await tx.cliente.findUnique({ where: { idCliente: contract.idCliente } })
      : null;
    if (contract.idCliente != null && (!customer || customer.idCliente !== contract.idCliente)) {
      throw new BadRequestException('El cliente vinculado al contrato no existe');
    }
    const identity = validateRut(payload.persona.rut);
    if (!identity.valid || identity.normalized !== payload.persona.rut
      || (contract.prospecto.rut && validateRut(contract.prospecto.rut).normalized !== identity.normalized)
      || (customer && validateRut(customer.rut ?? '').normalized !== identity.normalized)) {
      throw new BadRequestException('La identidad del cliente no corresponde a la solicitud');
    }
    if (!customer && await tx.cliente.findUnique({ where: { rut: payload.persona.rut } })) {
      throw new ConflictException('La identidad existente requiere vinculacion contractual explicita');
    }

    // Do not select an arbitrary service or hide a historic Baja to create a replacement.
    const candidates = tracking.idServicio != null
      ? [await tx.servicioContratado.findUnique({ where: { idServicio: tracking.idServicio } })]
      : await tx.servicioContratado.findMany({
        where: { idContrato: contract.idContrato }, orderBy: { idServicio: 'asc' }, take: 2,
      });
    if (candidates.length > 1 || (tracking.idServicio != null && !candidates[0])) {
      throw new BadRequestException('No se puede identificar un servicio objetivo unico');
    }
    let service = candidates[0] ?? null;
    if (service && (service.idCliente !== customer?.idCliente || service.idEmpresa !== tracking.idEmpresa
      || service.idContrato !== contract.idContrato)) {
      throw new BadRequestException('El servicio pendiente no corresponde al contrato, cliente y empresa de la instalacion');
    }
    if (service && !['Pendiente', 'Pendiente Instalacion', 'Instalacion Programada'].includes(service.estadoOperativo)) {
      throw new BadRequestException('El estado del servicio no permite activar la instalacion');
    }
    if (!customer) {
      customer = await tx.cliente.create({
        data: {
          idEmpresa: tracking.idEmpresa,
          rut: payload.persona.rut,
          nombreCompleto: payload.persona.nombre_completo,
          telefono: payload.persona.telefono,
          email: contract.prospecto?.email,
          estado: 'Activo',
          origenContacto: contract.prospecto?.origenContacto,
        },
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

    const technicalData = this.mergeTechnicalData(service?.datosTecnicos, technicalResult, tracking);
    if (service) {
      service = await tx.servicioContratado.update({
        where: {
          idServicio: service.idServicio, idContrato: contract.idContrato,
          idEmpresa: tracking.idEmpresa, idCliente: customer.idCliente,
          estadoOperativo: service.estadoOperativo,
        },
        data: {
          idDireccion: address.idDireccion,
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
      where: {
        idContrato: contract.idContrato, idEmpresa: tracking.idEmpresa, idPlan: tracking.idPlan,
        idProspecto: tracking.idProspecto, idCliente: contract.idCliente, estado: contract.estado,
      },
      data: { idCliente: customer.idCliente, estado: 'Activo' },
    });

    if (contract.prospecto) {
      const conversionDays = contract.prospecto.fechaCreacion
        ? Math.max(0, Math.ceil((now.getTime() - contract.prospecto.fechaCreacion.getTime()) / 86_400_000))
        : null;
      await tx.prospecto.update({
        where: {
          idProspecto: contract.prospecto.idProspecto, idEmpresa: tracking.idEmpresa,
          idCliente: contract.prospecto.idCliente,
        },
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
    const result = technicalResult && typeof technicalResult === 'object' && !Array.isArray(technicalResult)
      ? technicalResult as Record<string, unknown>
      : {};
    return {
      ...base,
      fuenteInstalacion: 'G3',
      idOtG3: tracking.idOtG3,
      codigoOtG3: tracking.codigoOtG3,
      ...(typeof result.fecha_completada === 'string' ? { fechaCompletadaG3: result.fecha_completada } : {}),
      ...(typeof result.id_tecnico === 'number' ? { idTecnicoG3: result.id_tecnico } : {}),
      ...(typeof result.potencia_optica_dbm === 'number' ? { potenciaOpticaDbm: result.potencia_optica_dbm } : {}),
      ...(typeof result.resultado_llamada === 'string' ? { resultadoLlamadaG3: result.resultado_llamada } : {}),
      ...(typeof result.resuelto_remotamente === 'boolean' ? { resueltoRemotamenteG3: result.resuelto_remotamente } : {}),
      ...(Array.isArray(result.materiales) ? { materialesG3: result.materiales as Prisma.InputJsonArray } : {}),
      resultadoInstalacion: technicalResult === undefined ? null : technicalResult as Prisma.InputJsonValue,
    } as Prisma.InputJsonValue;
  }
}
