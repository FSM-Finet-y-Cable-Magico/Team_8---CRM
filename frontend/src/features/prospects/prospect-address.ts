import { isAxiosError } from 'axios';
import { api, apiErrorMessage } from '../../api';
import { uniqueAddressLocation } from './prospect-coverage';

export type ProspectAddress = { direccion: string; comuna?: string | null; region?: string | null };

export function prospectAddressError(error: unknown) {
  return error instanceof Error && !isAxiosError(error) ? error.message : apiErrorMessage(error);
}

export function addressValidationMessage(address: ProspectAddress) {
  if (!address.comuna?.trim()) return 'Completa la comuna para ubicar la dirección.';
  if (!/[a-záéíóúñ]{3}/i.test(address.direccion) || !/\b\d+[a-z]?\b/i.test(address.direccion)) return 'Ingresa una dirección válida con calle y número.';
  return '';
}

export async function locateProspectAddress(address: ProspectAddress, signal?: AbortSignal) {
  const validation = addressValidationMessage(address);
  if (validation) throw new Error(validation);
  const { data } = await api.post('/coverage/geocode', {
    direccion: address.direccion.trim(), comuna: address.comuna?.trim(), region: address.region?.trim() || undefined, validarDireccion: true,
  }, { signal });
  const location = uniqueAddressLocation(data.candidatos);
  if (!location) throw new Error(data.mensaje || 'El servicio de mapas no pudo confirmar la ubicación exacta. La dirección puede existir aunque no esté registrada allí.');
  return location;
}
