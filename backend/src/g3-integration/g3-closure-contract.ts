import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { G3ClosureDto } from './g3-integration.dto';
import { G3ClosurePayload } from './g3-integration.types';

const fields = ['id_ot', 'id_empresa', 'request_id', 'trace_id', 'id_prospecto', 'id_contrato', 'id_plan',
  'equipos_instalados', 'equipos_retirados', 'tipo_ot', 'clave_idempotencia', 'fecha_completada', 'id_tecnico',
  'usuario_tecnico', 'potencia_optica_dbm', 'resultado_llamada', 'resuelto_remotamente', 'materiales',
  'cliente', 'direccion', 'categoria_falla', 'categoria_falla_otro'] as const;
const references = ['request_id', 'trace_id', 'id_prospecto', 'id_contrato', 'id_plan'] as const;

function validatedClosure(input: object): G3ClosureDto {
  const dto = plainToInstance(G3ClosureDto, input);
  if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length) {
    throw new BadRequestException('El cierre G3 contiene campos invalidos o fuera de contrato');
  }
  if (dto.clave_idempotencia !== undefined && dto.clave_idempotencia !== `${dto.id_ot}:${dto.fecha_completada}`) {
    throw new BadRequestException('La clave_idempotencia no corresponde a la OT y fecha del cierre');
  }
  return dto;
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
  return { ...dto } as G3ClosurePayload;
}

export function installationClosureFromReconciliation(data: Record<string, unknown>): G3ClosurePayload {
  // The caller checks terminal status first. Do not include presentation aliases
  // or legacy estado in the closure. Preserve every contract field and null so
  // rich webhook/reconcile hashes match without changing historical fingerprints.
  const selected = Object.fromEntries(fields.filter(field => data[field] !== undefined).map(field => [field, data[field]]));
  return installationClosure(selected);
}
