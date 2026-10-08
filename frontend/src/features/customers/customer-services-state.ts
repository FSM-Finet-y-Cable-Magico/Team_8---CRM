import type { CustomerService } from '../../api';

export type CustomerServicesLoadStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export type CustomerServicesLoadState = {
  customerId: number | null;
  status: CustomerServicesLoadStatus;
  error: string;
};

export type ServicesRequestToken = {
  customerId: number;
  revision: number;
  signal: AbortSignal;
};

export class CustomerServicesRequestGate {
  private revision = 0;
  private controller: AbortController | null = null;

  begin(customerId: number): ServicesRequestToken {
    this.controller?.abort();
    this.controller = new AbortController();
    return { customerId, revision: ++this.revision, signal: this.controller.signal };
  }

  isCurrent(token: ServicesRequestToken) {
    return token.revision === this.revision && !token.signal.aborted;
  }

  cancel() {
    this.controller?.abort();
    this.controller = null;
    this.revision += 1;
  }
}

function isManagedService(service?: CustomerService | null) {
  return ['activo', 'suspendido', 'baja'].includes(
    (service?.estadoOperativo ?? '').trim().toLocaleLowerCase('es-CL').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  );
}

export function serviceForContract(contractId: number, services: CustomerService[]) {
  const related = services.filter((item) => item.idContrato === contractId);
  return related.find((item) => isManagedService(item)) ?? related[0] ?? null;
}

export function contractManagementTarget(
  contractId: number,
  services: CustomerService[],
  status: CustomerServicesLoadStatus,
) {
  if (status === 'idle' || status === 'loading') return { kind: 'loading' as const };
  if (status === 'error') return { kind: 'error' as const };
  const service = serviceForContract(contractId, services);
  return isManagedService(service)
    ? { kind: 'service' as const, serviceId: service!.idServicio }
    : { kind: 'contract' as const, serviceId: service?.idServicio ?? null };
}
