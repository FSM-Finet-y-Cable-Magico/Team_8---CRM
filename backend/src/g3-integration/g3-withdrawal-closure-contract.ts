import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { G3ClosureDto } from './g3-integration.dto';
import { sha256Payload } from './g3-integration.utils';
import { parseWithdrawalRequestId } from './g3-withdrawal-contract';

/**
 * Contract of the BAJA closure notification of G3 (construirPayloadCierre, G3 main @ 8a8e5dd0).
 * G3 notifies a BAJA only at APROBACION, once per OT, with key baja:{id_ot} and request_id at the root.
 * It carries NO estado_ot nor cierre_aprobado: approval is corroborated separately by an authenticated GET
 * of the same OT and company. This validator is separate from INSTALACION/REPARACION and never relaxes them.
 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const empty = (value: unknown) => value === undefined || value === null;

export type G3WithdrawalClosure = {
  idOt: number; idEmpresa: number; requestId: string; traceId: string; idSolicitudRetiro: number; idServicio: number;
  idContrato: number; idCliente: number; idTicket: number | null; fechaCompletada: string;
  equiposRetirados: Array<{ numeroSerie: string; conDano: boolean | null; diagnostico: string | null }>;
  equiposFaltantes: Array<{ numeroSerie: string; motivo: string }>;
  /** Fingerprint of the validated payload: same key + different content is a conflict. */
  hash: string;
};

export function isWithdrawalClosure(input: { tipo_ot?: unknown } | null | undefined) {
  return input?.tipo_ot === 'BAJA';
}

export function withdrawalClosure(input: object): G3WithdrawalClosure {
  const dto = plainToInstance(G3ClosureDto, input);
  const invalid = (message: string) => new BadRequestException({ code: 'G3_CIERRE_BAJA_INVALIDO', message });
  if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length) throw invalid('El cierre de BAJA contiene campos inválidos o fuera de contrato');
  if (dto.tipo_ot !== 'BAJA') throw invalid('El cierre no es de una OT de BAJA');
  if (dto.clave_idempotencia !== `baja:${dto.id_ot}`) throw invalid('La clave_idempotencia de una BAJA debe ser baja:{id_ot}');
  const request = parseWithdrawalRequestId(dto.request_id);
  if (!request || request.idEmpresa !== dto.id_empresa) throw invalid('El request_id no corresponde a una solicitud de retiro de la empresa');
  if (dto.id_solicitud_retiro !== request.idSolicitudRetiro) throw invalid('id_solicitud_retiro no coincide con el request_id');
  if (typeof dto.trace_id !== 'string' || !UUID_V4.test(dto.trace_id)) throw invalid('trace_id inválido');
  if (!positiveId(dto.id_servicio) || !positiveId(dto.id_contrato) || !positiveId(dto.id_cliente_externo)) {
    throw invalid('El cierre de BAJA debe identificar servicio, contrato y cliente');
  }
  if (!empty(dto.id_ticket_externo) && !positiveId(dto.id_ticket_externo)) throw invalid('id_ticket_externo inválido');
  if (!empty(dto.id_prospecto) || !empty(dto.id_plan)) throw invalid('Un cierre de BAJA no declara prospecto ni plan');
  if (!empty(dto.falla_reportada) || !empty(dto.solucion_aplicada) || !empty(dto.resultado)) throw invalid('Un cierre de BAJA no declara datos de reparación');
  if (dto.equipos_instalados.length) throw invalid('Un cierre de BAJA no instala equipos');
  if (!dto.fecha_completada) throw invalid('El cierre de BAJA debe informar fecha_completada');
  const equiposRetirados = dto.equipos_retirados.map(item => ({
    numeroSerie: item.numero_serie.trim().toUpperCase(), conDano: typeof item.con_dano === 'boolean' ? item.con_dano : null, diagnostico: item.diagnostico ?? null,
  }));
  const equiposFaltantes = (dto.equipos_faltantes ?? []).map(item => ({ numeroSerie: item.numero_serie.trim().toUpperCase(), motivo: item.motivo.trim() }));
  const closure = {
    idOt: dto.id_ot, idEmpresa: dto.id_empresa, requestId: dto.request_id!, traceId: dto.trace_id.toLowerCase(),
    idSolicitudRetiro: request.idSolicitudRetiro, idServicio: dto.id_servicio, idContrato: dto.id_contrato, idCliente: dto.id_cliente_externo,
    idTicket: positiveId(dto.id_ticket_externo) ? dto.id_ticket_externo : null, fechaCompletada: dto.fecha_completada,
    equiposRetirados, equiposFaltantes,
  };
  return { ...closure, hash: sha256Payload(closure) };
}
