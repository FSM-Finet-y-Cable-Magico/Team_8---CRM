import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { rutLookupVariants, validateRut } from '../rut/rut.util';
import { customerDebtPosition, DebtPosition } from './customer-debt';

/**
 * Retorno comercial del excliente (Opción B controlada: reutiliza o crea UNA relación Prospecto↔Cliente).
 *
 * - Nunca se borra ni se recrea al Cliente (su RUT es único global) ni se duplica una identidad:
 *   el prospecto de retorno lleva `idCliente`, de modo que facturas, contratos, pagos, tickets y
 *   auditorías anteriores siguen asociados a la misma persona.
 * - La marca `EXCLIENTE` solo registra el hecho verificable (baja efectiva sin relación operativa en esa
 *   empresa). La situación financiera NUNCA se guarda: se calcula al listar desde facturas y pagos.
 * - La visibilidad es dinámica: si la persona vuelve a tener un servicio o contrato operativo en esa empresa,
 *   deja de listarse como prospecto sin escribir nada.
 */
export const RETURNING_CLASSIFICATION = 'EXCLIENTE';
/** Mismo valor que usan los interesados no contratantes: fuera del pipeline comercial normal. */
export const RETURNING_PIPELINE_STATUS = 'Fuera pipeline';
export const RETURNING_ORIGIN = 'Excliente';
const NON_OPERATIONAL_CONTRACT_STATES = ['Baja', 'Anulado'];

/** Sin servicio ni contrato operativo en la empresa (misma noción que resolveCustomerLifecycleStatus). */
export function noOperationalRelationshipWhere(idEmpresa: number): Prisma.ClienteWhereInput {
  return {
    AND: [
      { servicios: { none: { idEmpresa, estadoOperativo: { not: 'Baja' } } } },
      { contratos: { none: { idEmpresa, estado: { notIn: NON_OPERATIONAL_CONTRACT_STATES } } } },
    ],
  };
}

/** Prospectos de retorno visibles: marcados EXCLIENTE, vinculados al cliente y sin relación operativa vigente en su empresa. */
export function returningProspectWhere(companyIds: number[]): Prisma.ProspectoWhereInput {
  return {
    AND: [
      { clasificacionComercial: RETURNING_CLASSIFICATION },
      { idCliente: { not: null } },
      { OR: companyIds.map(idEmpresa => ({ idEmpresa, cliente: { is: noOperationalRelationshipWhere(idEmpresa) } })) },
    ],
  };
}

export type ReturningSituation = { situacionFinanciera: DebtPosition; etiqueta: string };

const LABELS: Record<DebtPosition, string> = {
  SIN_DEUDA: 'Excliente sin deuda',
  CON_DEUDA: 'Excliente con deuda pendiente',
  INDETERMINADA: 'Excliente con saldo por revisar',
};

export function returningLabel(position: DebtPosition) { return LABELS[position]; }

type ProspectLike = { idCliente: number | null; idEmpresa: number | null; rut: string | null; clasificacionComercial: string | null };

export function isReturningProspect(prospect: Pick<ProspectLike, 'idCliente' | 'clasificacionComercial'>) {
  return prospect.clasificacionComercial === RETURNING_CLASSIFICATION && prospect.idCliente != null;
}

/** Calcula la situación financiera efectiva de un excliente (lectura; nunca persiste). */
export async function returningSituation(db: Pick<Prisma.TransactionClient, 'factura'>, prospect: ProspectLike): Promise<ReturningSituation> {
  const situacionFinanciera = await customerDebtPosition(db, { idEmpresa: prospect.idEmpresa, idCliente: prospect.idCliente, rut: prospect.rut });
  return { situacionFinanciera, etiqueta: returningLabel(situacionFinanciera) };
}

export type EnsureReturningResult =
  | { action: 'CREADO' | 'REUTILIZADO' | 'YA_MARCADO'; idProspecto: number }
  | { action: 'MANTIENE_RELACION_OPERATIVA' | 'CLIENTE_INEXISTENTE' }
  | { action: 'PROSPECTO_SIN_VINCULO_EXISTENTE'; idProspecto: number };

/**
 * Hace visible al excliente en Prospectos cuando termina su última relación operativa en una empresa.
 * Debe ejecutarse dentro de la transacción de la baja. Idempotente: repetirlo no crea otro prospecto.
 * Si existe un prospecto con el mismo RUT pero sin vínculo al cliente, NO se modifica ni se duplica la identidad:
 * queda registrado para revisión manual.
 */
export async function ensureReturningProspect(
  tx: Prisma.TransactionClient,
  audit: AuditService,
  input: { idCliente: number; idEmpresa: number; idUsuario: number | null },
): Promise<EnsureReturningResult> {
  await tx.$queryRaw`SELECT id_cliente FROM cliente WHERE id_cliente = ${input.idCliente} FOR UPDATE`;
  const customer = await tx.cliente.findUnique({ where: { idCliente: input.idCliente } });
  if (!customer) return { action: 'CLIENTE_INEXISTENTE' };
  const [operationalServices, operationalContracts] = await Promise.all([
    tx.servicioContratado.count({ where: { idCliente: input.idCliente, idEmpresa: input.idEmpresa, estadoOperativo: { not: 'Baja' } } }),
    tx.contrato.count({ where: { idCliente: input.idCliente, idEmpresa: input.idEmpresa, estado: { notIn: NON_OPERATIONAL_CONTRACT_STATES } } }),
  ]);
  if (operationalServices > 0 || operationalContracts > 0) return { action: 'MANTIENE_RELACION_OPERATIVA' };

  const linked = await tx.prospecto.findFirst({
    where: { idCliente: input.idCliente, idEmpresa: input.idEmpresa }, orderBy: { idProspecto: 'asc' },
  });
  const variants = customer.rut ? rutLookupVariants(customer.rut) : [];
  const unlinked = linked || !variants.length ? null : await tx.prospecto.findFirst({
    where: { idEmpresa: input.idEmpresa, idCliente: null, rut: { in: variants, mode: 'insensitive' } }, orderBy: { idProspecto: 'asc' },
  });
  if (unlinked) {
    await audit.record({
      idUsuario: input.idUsuario, accion: 'EXCLIENTE_REQUIERE_REVISION_PROSPECTO', entidadAfectada: 'prospecto', idEntidadAfectada: unlinked.idProspecto,
      valorNuevo: { idCliente: input.idCliente, idEmpresa: input.idEmpresa, motivo: 'PROSPECTO_SIN_VINCULO_EXISTENTE' },
    }, tx);
    return { action: 'PROSPECTO_SIN_VINCULO_EXISTENTE', idProspecto: unlinked.idProspecto };
  }

  let idProspecto: number; let action: 'CREADO' | 'REUTILIZADO' | 'YA_MARCADO';
  if (linked) {
    idProspecto = linked.idProspecto;
    if (linked.clasificacionComercial === RETURNING_CLASSIFICATION && linked.disponibleRemarketing === true) return { action: 'YA_MARCADO', idProspecto };
    await tx.prospecto.update({ where: { idProspecto }, data: { clasificacionComercial: RETURNING_CLASSIFICATION, disponibleRemarketing: true } });
    action = 'REUTILIZADO';
  } else {
    const rut = customer.rut ? (validateRut(customer.rut).normalized ?? customer.rut.trim()) : null;
    const created = await tx.prospecto.create({
      data: {
        idEmpresa: input.idEmpresa, idCliente: input.idCliente, rut, nombreCompleto: customer.nombreCompleto, email: customer.email, telefono: customer.telefono,
        estadoPipeline: RETURNING_PIPELINE_STATUS, clasificacionComercial: RETURNING_CLASSIFICATION, disponibleRemarketing: true,
        origenContacto: RETURNING_ORIGIN, fechaCreacion: new Date(),
      },
    });
    idProspecto = created.idProspecto; action = 'CREADO';
  }
  await audit.record({
    idUsuario: input.idUsuario, accion: 'MARCAR_EXCLIENTE_PROSPECTO', entidadAfectada: 'prospecto', idEntidadAfectada: idProspecto,
    valorNuevo: { idCliente: input.idCliente, idEmpresa: input.idEmpresa, resultado: action, clasificacionComercial: RETURNING_CLASSIFICATION },
  }, tx);
  return { action, idProspecto };
}
