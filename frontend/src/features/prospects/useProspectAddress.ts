import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { addressValidationMessage, locateProspectAddress, prospectAddressError, type ProspectAddress } from './prospect-address';
import type { CommercialCoverage, ProspectLocation } from './prospect-coverage';

type AddressResult = { key: string; location: ProspectLocation; coverage: CommercialCoverage };

export function useProspectAddress(address: ProspectAddress, companyId: number) {
  const key = JSON.stringify([companyId, address.direccion.trim(), address.comuna?.trim(), address.region?.trim()]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const request = useRef<{ key: string; controller: AbortController; promise: Promise<AddressResult | null> } | null>(null);
  const confirmed = useRef<AddressResult | null>(null);
  const [result, setResult] = useState<AddressResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setResult(null);
    setError('');
    setChecking(false);
    confirmed.current = null;
    return () => request.current?.controller.abort();
  }, [key]);

  async function validate(force = false): Promise<AddressResult | null> {
    const validation = addressValidationMessage(address);
    if (validation) { if (force) setError(validation); return null; }
    if (confirmed.current?.key === key) return confirmed.current;
    if (request.current?.key === key && !request.current.controller.signal.aborted) return request.current.promise;
    request.current?.controller.abort();
    const controller = new AbortController();
    setChecking(true);
    setError('');
    const promise = (async () => {
      try {
        const location = await locateProspectAddress(address, controller.signal);
        const { data } = await api.get<CommercialCoverage>('/coverage/plans-for-location', { params: { idEmpresa: companyId, ...location }, signal: controller.signal });
        if (controller.signal.aborted || currentKey.current !== key) return null;
        const next = { key, location, coverage: data };
        confirmed.current = next;
        setResult(next);
        return next;
      } catch (cause) {
        if (!controller.signal.aborted && currentKey.current === key) setError(prospectAddressError(cause));
        return null;
      } finally {
        if (!controller.signal.aborted && currentKey.current === key) { setChecking(false); request.current = null; }
      }
    })();
    request.current = { key, controller, promise };
    return promise;
  }

  return { result: result?.key === key ? result : null, checking, error, validate };
}
