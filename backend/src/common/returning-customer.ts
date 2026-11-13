import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { APPROVED_EXTENSIONS, invoiceBalance } from '../billing/invoice-balance';
import { rutLookupVariants, validateRut } from '../rut/rut.util';

/**
 * Excliente en Prospectos (criterio FINET 13-11-2026): al terminar la última relación operativa de una persona
 * en una empresa, se muestra en Prospectos de ESA empresa como excliente, conservando identidad, historial, deuda,
 * contratos y relaciones con otras empresas.
 *
 * No introduce estados ni columnas: la condición se DERIVA de hechos ya registrados y se evalúa al consultar.
 * - Visible: prospecto vinculado al cliente (idCliente) cuyo cliente, en la empresa del prospecto, no tiene
 *   servicio no-Baja ni contrato fuera de Baja/Anulado, y sí tiene al menos un servicio o contrato en Baja.
 * - Si vuelve a contratar en esa empresa deja de mostrarse solo, sin escribir nada.
 * - La situación de deuda se calcula al listar desde facturas, pagos y prórrogas; nunca se guarda.
 * - Nunca crea ni modifica al cliente ni duplica su RUT. Solo si no existe ningún prospecto vinculado en esa empresa
 *   se crea UNO con el estado de pipeline existente 'Fuera pipeline' (mismo valor de los interesados no
 *   contratantes); un prospecto con el mismo RUT sin vínculo queda para revisión manual, sin modificarlo.
 */
export const FORMER_CUSTOMER_PIPELINE_STATUS = 'Fuera pipeline';
export const FORMER_CUSTOMER_ORIGIN = 'Excliente';
export const FORMER_CUSTOMER_VIEW = 'Excliente';
const NON_OPERATIONAL_CONTRACT_STATES = ['Baja', 'Anulado'];

/** Cliente sin relación operativa en la empresa y con al menos una relación terminada (Baja) en ella. */
export function formerCustomerInCompanyWhere(idEmpresa: number): Prisma.ClienteWhereInput {
  return {
    AND: [
      { servicios: { none: { idEmpresa, estadoOperativo: { not: 'Baja' } } } },
      { contratos: { none: { idEmpresa, estado: { notIn: NON_OPERATIONAL_CONTRACT_STATES } } } },
      { OR: [{ servicios: { some: { idEmpresa, estadoOperativo: 'Baja' } } }, { contratos: { some: { idEmpresa, estado: 'Baja' } } }] },
    ],
  };
}

/** Prospectos de excliente de las empresas indicadas (siempre acotado por empresa: nunca los de otra). */
export function formerCustomerProspectWhere(companyIds: number[]): Prisma.ProspectoWhereInput {
  if (!companyIds.length) return { idProspecto: { in: [] } };
  return {
    AND: [
      { idCliente: { not: null } },
      { OR: companyIds.map(idEmpresa => ({ idEmpresa, cliente: { is: formerCustomerInCompanyWhere(idEmpresa) } })) },
    ],
  };
}

export type FormerCustomerDebt = 'SIN_DEUDA' | 'CON_DEUDA' | 'SALDO_POR_REVISAR';
const LABELS: Record<FormerCustomerDebt, string> = {
  SIN_DEUDA: 'Excliente sin deuda',
  CON_DEUDA: 'Excliente con deuda pendiente',
  SALDO_POR_REVISAR: 'Excliente con saldo por revisar',
};
export const formerCustomerLabel = (debt: FormerCustomerDebt) => LABELS[debt];

/** Deuda exigible del cliente en esa empresa (todas sus facturas allí), con el mismo cálculo de saldo del Libro. */
export async function formerCustomerDebt(db: Pick<Prisma.TransactionClient, 'factura'>, idCliente: number, idEmpresa: number): Promise<FormerCustomerDebt> {
  const invoices = await db.factura.findMany({
    where: { contrato: { idCliente, idEmpresa } },
    include: { pagos: true, prorrogasPago: APPROVED_EXTENSIONS },
  });
  let unknown = false;
  for (const invoice of invoices) {
    const balance = invoiceBalance(invoice);
    if (balance.saldoExigible === null) { unknown = true; continue; }
    if (balance.saldoExigible > 0) return 'CON_DEUDA';
  }
  return unknown ? 'SALDO_POR_REVISAR' : 'SIN_DEUDA';
}

export type EnsureFormerCustomerResult =
  | { action: 'CREADO' | 'REUTILIZADO'; idProspecto: number }
  | { action: 'MANTIENE_RELACION_OPERATIVA' | 'CLIENTE_INEXISTENTE' }
  | { action: 'PROSPECTO_SIN_VINCULO_EXISTENTE'; idProspecto: number };

/**
 * Garantiza que el excliente sea visible en Prospectos de la empresa. Debe ejecutarse DENTRO de la transacción que
 * terminó su última relación operativa allí. Idempotente: reutilizar no escribe y repetir no crea otro prospecto.
 */
export async function ensureFormerCustomerProspect(
  tx: Prisma.TransactionClient,
  audit: AuditService,
  input: { idCliente: number; idEmpresa: number; idUsuario: number | null },
): Promise<EnsureFormerCustomerResult> {
  await tx.$queryRaw`SELECT id_cliente FROM cliente WHERE id_cliente = ${input.idCliente} FOR UPDATE`;
  const customer = await tx.cliente.findUnique({ where: { idCliente: input.idCliente } });
  if (!customer) return { action: 'CLIENTE_INEXISTENTE' };
  const [operationalServices, operationalContracts] = await Promise.all([
    tx.servicioContratado.count({ where: { idCliente: input.idCliente, idEmpresa: input.idEmpresa, estadoOperativo: { not: 'Baja' } } }),
    tx.contrato.count({ where: { idCliente: input.idCliente, idEmpresa: input.idEmpresa, estado: { notIn: NON_OPERATIONAL_CONTRACT_STATES } } }),
  ]);
  if (operationalServices > 0 || operationalContracts > 0) return { action: 'MANTIENE_RELACION_OPERATIVA' };

  const linked = await tx.prospecto.findFirst({ where: { idCliente: input.idCliente, idEmpresa: input.idEmpresa }, orderBy: { idProspecto: 'asc' } });
  let result: EnsureFormerCustomerResult;
  if (linked) {
    // Its history (pipeline, quotes, contracts) stays as it is: the excliente view is derived, not written.
    result = { action: 'REUTILIZADO', idProspecto: linked.idProspecto };
  } else {
    const variants = customer.rut ? rutLookupVariants(customer.rut) : [];
    const unlinked = variants.length ? await tx.prospecto.findFirst({
      where: { idEmpresa: input.idEmpresa, idCliente: null, rut: { in: variants, mode: 'insensitive' } }, orderBy: { idProspecto: 'asc' },
    }) : null;
    if (unlinked) {
      result = { action: 'PROSPECTO_SIN_VINCULO_EXISTENTE', idProspecto: unlinked.idProspecto };
    } else {
      const rut = customer.rut ? (validateRut(customer.rut).normalized ?? customer.rut.trim()) : null;
      const created = await tx.prospecto.create({
        data: {
          idEmpresa: input.idEmpresa, idCliente: input.idCliente, rut, nombreCompleto: customer.nombreCompleto, email: customer.email,
          telefono: customer.telefono, estadoPipeline: FORMER_CUSTOMER_PIPELINE_STATUS, origenContacto: FORMER_CUSTOMER_ORIGIN, fechaCreacion: new Date(),
        },
      });
      result = { action: 'CREADO', idProspecto: created.idProspecto };
    }
  }
  await audit.record({
    idUsuario: input.idUsuario,
    accion: result.action === 'PROSPECTO_SIN_VINCULO_EXISTENTE' ? 'EXCLIENTE_REQUIERE_REVISION_PROSPECTO' : 'EXCLIENTE_VISIBLE_EN_PROSPECTOS',
    entidadAfectada: 'prospecto', idEntidadAfectada: result.idProspecto,
    valorNuevo: { idCliente: input.idCliente, idEmpresa: input.idEmpresa, resultado: result.action },
  }, tx);
  return result;
}
