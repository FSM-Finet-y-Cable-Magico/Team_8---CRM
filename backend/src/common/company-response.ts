import { Prisma } from '@prisma/client';
import { AuthUser } from './auth.types';
import { isAdministrator } from './roles';

const DISCARDED = Symbol('company-response-discarded');

/** Response-only projection: never use this to persist or reconcile records.
 * A shared customer authorizes identity, not global financial/technical data.
 * Company-less addresses are visible only through the service that uses them.
 */
export function companyResponse<T>(value: T, user: AuthUser): T {
  const restricted = !isAdministrator(user.roles);
  const attributedRelations = new Set([
    'contrato', 'contratos', 'servicio', 'servicios', 'plan', 'zonaPago',
    'empresa', 'equipos', 'tickets', 'ordenes', 'solicitudes', 'usuarioRegistro',
  ]);
  const project = (item: unknown, key = '', parent?: Record<string, unknown>): unknown => {
    if (Array.isArray(item)) return item.map(child => project(child, key, parent)).filter(child => child !== DISCARDED);
    if (!item || typeof item !== 'object' || item instanceof Date || item instanceof Prisma.Decimal) return item;
    const record = item as Record<string, unknown>;
    if (key === 'cliente') {
      if (restricted) {
        return Object.fromEntries(['idCliente', 'rut', 'nombreCompleto', 'email', 'telefono']
          .filter(field => field in record).map(field => [field, record[field]]));
      }
    } else if (restricted) {
      if (('idEmpresa' in record || attributedRelations.has(key)) &&
        (!user.idEmpresa || record.idEmpresa !== user.idEmpresa)) return DISCARDED;
      if (key === 'direccion' && (!parent?.idServicio || record.idDireccion !== parent.idDireccion ||
        record.idCliente !== parent.idCliente)) return DISCARDED;
    }
    return Object.fromEntries(Object.entries(record)
      .filter(([field]) => field !== 'passwordPortalHash')
      .map(([field, child]) => {
        const projected = project(child, field, record);
        // Preserve the HTTP representation of unauthorized singular relations.
        return [field, projected === DISCARDED ? null : projected];
      }));
  };
  const projected = project(value);
  return (projected === DISCARDED ? null : projected) as T;
}
