import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { G3ClosureDto } from './g3-integration.dto';
import { G3ClosurePayload } from './g3-integration.types';

const fields = ['id_ot', 'id_empresa', 'request_id', 'trace_id', 'id_prospecto', 'id_contrato', 'id_plan',
  'equipos_instalados', 'equipos_retirados', 'tipo_ot', 'clave_idempotencia', 'fecha_completada', 'id_tecnico',
  'usuario_tecnico', 'potencia_optica_dbm', 'resultado_llamada', 'resuelto_remotamente', 'materiales',
  'cliente', 'direccion', 'categoria_falla', 'categoria_falla_otro',
  'equipos_faltantes', 'falla_reportada', 'solucion_aplicada', 'resultado',
  'id_cliente_externo', 'id_servicio', 'id_solicitud_retiro', 'id_ticket_externo'] as const;
const references = ['request_id', 'trace_id', 'id_prospecto', 'id_contrato', 'id_plan'] as const;
// Correlation of a BAJA (withdrawal) OT: never valid on an installation or repair closure.
const withdrawalReferences = ['id_cliente_externo', 'id_servicio', 'id_solicitud_retiro', 'id_ticket_externo'] as const;
// Repair data G3 sends for G1: only a REPARACION may carry it.
const repairData = ['falla_reportada', 'solucion_aplicada', 'resultado'] as const;
const present = (value: unknown) => value !== undefined && value !== null;

/**
 * G3 always sends the shared fields, in null/[] when the OT type does not use them. Dropping
 * those empty values keeps the closure fingerprint identical to the one stored for closures
 * received before 08-11-2026, so a re-delivered historical closure is not a false 409.
 */
function withoutEmptySharedFields(dto: G3ClosureDto): G3ClosureDto {
  const copy = { ...dto } as Record<string, unknown>;
  for (const field of [...repairData, ...withdrawalReferences]) if (copy[field] === null) delete copy[field];
  if (Array.isArray(copy.equipos_faltantes) && copy.equipos_faltantes.length === 0) delete copy.equipos_faltantes;
  return copy as unknown as G3ClosureDto;
}

function validatedClosure(input: object): G3ClosureDto {
  const dto = plainToInstance(G3ClosureDto, input);
  if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length) {
    throw new BadRequestException('El cierre G3 contiene campos invalidos o fuera de contrato');
  }
  if (dto.clave_idempotencia !== undefined && dto.clave_idempotencia !== `${dto.id_ot}:${dto.fecha_completada}`) {
    throw new BadRequestException('La clave_idempotencia no corresponde a la OT y fecha del cierre');
  }
  if (withdrawalReferences.some(field => present(dto[field]))) {
    throw new BadRequestException('Un cierre de instalacion o reparacion no puede declarar referencias de baja');
  }
  return withoutEmptySharedFields(dto);
}

export function independentRepairAcknowledgement(input: G3ClosureDto) {
  if (input.tipo_ot !== 'REPARACION') return null;
  const dto = validatedClosure(input);
  if (references.some(field => dto[field] !== undefined && dto[field] !== null)) {
    throw new BadRequestException('Una reparacion independiente no puede declarar referencias de instalacion G8');
  }
  // Stateless acknowledgement, never a tracking/event/audit/G1 or business write.
  return { received: true, processed: false, activated: false,
    code: 'G3_REPAIR_OUT_OF_INSTALLATION_SCOPE', tipo_ot: 'REPARACION' as const, id_ot: dto.id_ot, id_empresa: dto.id_empresa };
}

export function installationClosure(input: object): G3ClosurePayload {
  const dto = validatedClosure(input);
  if (dto.tipo_ot === 'REPARACION') throw new BadRequestException('Una reparacion no es un cierre de instalacion G8');
  if (repairData.some(field => present(dto[field]))) {
    throw new BadRequestException('Un cierre de instalacion no puede declarar datos de reparacion');
  }
  return { ...dto } as G3ClosurePayload;
}

export function installationClosureFromReconciliation(data: Record<string, unknown>): G3ClosurePayload {
  // The caller checks terminal status first. Do not include presentation aliases
  // or legacy estado in the closure. Preserve every contract field and null so
  // rich webhook/reconcile hashes match without changing historical fingerprints.
  const selected = Object.fromEntries(fields.filter(field => data[field] !== undefined).map(field => [field, data[field]]));
  return installationClosure(selected);
}
