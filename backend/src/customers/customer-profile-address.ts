import { Prisma } from '@prisma/client';

type Address = { direccion: string; comuna: string };
export const customerAddressKey = (address: Address) => [address.direccion, address.comuna]
  .map(value => value.trim().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL')).join('|');

export function customerProfileAddress(data: Prisma.JsonValue | null | undefined) {
  const root = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const stored = root.crmPerfil;
  const profile = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const address = profile.direccionActual;
  return {
    ...(address && typeof address === 'object' && !Array.isArray(address)
      && typeof address.direccion === 'string' && typeof address.comuna === 'string'
      ? { direccionActual: { direccion: address.direccion, comuna: address.comuna } } : {}),
    ...(Array.isArray(profile.direccionesOmitidas)
      ? { direccionesOmitidas: profile.direccionesOmitidas.filter((key): key is string => typeof key === 'string') } : {}),
  };
}
