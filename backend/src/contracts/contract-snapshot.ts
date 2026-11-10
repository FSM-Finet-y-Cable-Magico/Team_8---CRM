import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isISO8601 } from 'class-validator';
import { validateRut } from '../rut/rut.util';

export const CONTRACT_INCLUDE = {
  cliente: { include: { empresa: true, direcciones: true } },
  prospecto: { include: { empresa: true } }, plan: true, zonaPago: true,
  servicios: { include: { direccion: true, equipos: true,
    tickets: { take: 10, orderBy: { fechaCreacion: 'desc' } },
    ordenes: { take: 10, orderBy: { fechaCreacion: 'desc' } } },
    orderBy: { fechaCreacion: 'desc' } },
} satisfies Prisma.ContratoInclude;
export type ContractSource = Prisma.ContratoGetPayload<{ include: typeof CONTRACT_INCLUDE }>;
export type SnapshotRow = [string, string | number | null];
export type ContractSnapshot = {
  schema: 1; idEmpresa: number | null; idContrato: number;
  cliente: { nombre: string | null; rut: string | null; email: string | null; telefono: string | null };
  comercial: { empresa: string | null; plan: string | null; velocidad: number | null; precio: number | null;
    vencimiento: number | null; estado: string | null; zona: string | null };
  direccion: string | null; servicios: SnapshotRow[][];
};
const text = (value: unknown, max = 300): string | null => typeof value === 'string'
  && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const date = (v: unknown): string | null => {
  if (typeof v !== 'string' || !isISO8601(v, { strict: true, strictSeparator: true })
      || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)) return null;
  return new Date(v).toLocaleString('es-CL', { timeZone: 'America/Santiago' });
};

// Read only. Never locks or writes G1/G2/G3 tables, or calls their APIs.
export async function buildContractSnapshot(tx: Prisma.TransactionClient, idContrato: number,
  strict = false, loaded?: ContractSource): Promise<ContractSnapshot> {
  const contract = loaded ?? await tx.contrato.findUnique({ where: { idContrato }, include: CONTRACT_INCLUDE });
  if (!contract) throw new NotFoundException('Contrato no encontrado');
  const company = contract.idEmpresa ? await tx.empresa.findUnique({
    where: { idEmpresa: contract.idEmpresa }, select: { nombre: true },
  }) : null;
  const zonePrice = contract.idZonaPago && contract.idPlan ? await tx.planZonaPrecio.findFirst({
    where: { idPlan: contract.idPlan, idZonaPago: contract.idZonaPago, activo: true },
    orderBy: { idPlanZonaPrecio: 'desc' },
  }) : null;
  const plan = !zonePrice && contract.idPlan ? await tx.plan.findUnique({ where: { idPlan: contract.idPlan } }) : null;
  const price = zonePrice?.precioMensual ?? plan?.precioMensual ?? null;
  const amount = price == null ? null : Number(price);
  const person = contract.cliente ?? contract.prospecto;
  const snapshot: ContractSnapshot = {
    schema: 1, idEmpresa: contract.idEmpresa, idContrato,
    cliente: { nombre: text(person?.nombreCompleto), rut: text(person?.rut, 12),
      email: text(person?.email, 120), telefono: text(person?.telefono, 30) },
    comercial: { empresa: text(company?.nombre), plan: text(contract.plan?.nombreComercial),
      velocidad: finite(contract.plan?.velocidadMbps) && contract.plan.velocidadMbps > 0 ? contract.plan.velocidadMbps : null,
      precio: finite(amount) && amount >= 0 ? amount : null,
      vencimiento: Number.isInteger(contract.diaVencimiento) && contract.diaVencimiento >= 1 && contract.diaVencimiento <= 31 ? contract.diaVencimiento : null,
      estado: text(contract.estado, 60), zona: text(contract.zonaPago?.nombreZona) },
    direccion: text(contract.direccionInstalacion),
    servicios: contract.servicios.map(service => {
      const rows: SnapshotRow[] = [['Tipo de servicio', text(service.tipoServicio, 60)],
        ['Estado del servicio', text(service.estadoOperativo, 60)],
        ['Dirección de instalación', text(service.direccion?.direccionCompleta)]];
      const technical = service.datosTecnicos && typeof service.datosTecnicos === 'object'
        && !Array.isArray(service.datosTecnicos) ? service.datosTecnicos : {};
      const completed = date(technical.fechaCompletadaG3);
      const mac = text(technical.macAddress, 17);
      const validMac = mac && /^(?:[\da-f]{2}:){5}[\da-f]{2}$/i.test(mac) ? mac : null;
      const olt = text(technical.puertoOlt, 80);
      const validOlt = olt && /^[\w .:/-]+$/.test(olt) ? olt : null;
      if (strict && (technical.fechaCompletadaG3 != null && !completed
        || technical.macAddress != null && !validMac
        || technical.puertoOlt != null && !validOlt
        || technical.potenciaOpticaDbm != null && !finite(technical.potenciaOpticaDbm))) {
        throw new BadRequestException('Datos técnicos del servicio inválidos; solicita su revisión antes de enviar a firma');
      }
      if (completed) rows.push(['Finalización de instalación (Chile)', completed]);
      if (finite(technical.potenciaOpticaDbm)) rows.push(['Potencia óptica registrada', `${technical.potenciaOpticaDbm} dBm`]);
      if (validMac) rows.push(['MAC registrada', validMac]);
      if (validOlt) rows.push(['Puerto OLT registrado', validOlt]);
      if (!completed && !finite(technical.potenciaOpticaDbm) && !validMac && !validOlt) rows.push(['Datos técnicos', 'Sin información técnica validada']);
      return rows;
    }),
  };
  if (strict) {
    const missing = [!snapshot.idEmpresa && 'empresa', !snapshot.cliente.nombre && 'nombre',
      (!snapshot.cliente.rut || !validateRut(snapshot.cliente.rut).valid) && 'RUT', (!snapshot.cliente.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(snapshot.cliente.email)) && 'correo',
      !snapshot.comercial.empresa && 'empresa', !snapshot.comercial.plan && 'plan',
      snapshot.comercial.precio === null && 'precio', !snapshot.comercial.vencimiento && 'vencimiento',
      (!snapshot.servicios.length && !snapshot.direccion) && 'dirección',
      snapshot.servicios.some(rows => rows.some(([label, value]) => label === 'Dirección de instalación' && !value)) && 'dirección del servicio',
    ].filter(Boolean);
    if (missing.length) throw new BadRequestException('Contrato incompleto para firma: ' + missing.join(', '));
  }
  return snapshot;
}

// JSONB does not preserve object-key order. Compare content, never its presentation order.
export function canonicalSnapshot(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalSnapshot).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ':' + canonicalSnapshot((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
