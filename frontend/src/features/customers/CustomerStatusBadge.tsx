import { StatusBadge } from '../../shared/components';

type CustomerStatusSource = {
  estado?: string | null;
  estadoGlobalDisponible?: boolean;
  estadosServicioEmpresa?: string[];
};

export type CustomerStatusDimension = 'global' | 'empresa';

export const CUSTOMER_STATUS_DIMENSION_LABELS: Record<CustomerStatusDimension, string> = {
  global: 'Estado del cliente',
  empresa: 'Estado del servicio en esta empresa',
};

const SCREEN_READER_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' } as const;

// A company view never receives the global customer status (estado is null). It shows the
// real operational states of that company's services instead; no status is inferred or invented.
export function customerStatusDimension(customer: CustomerStatusSource): CustomerStatusDimension {
  return customer.estadoGlobalDisponible === false ? 'empresa' : 'global';
}

export function customerStatusValues(customer: CustomerStatusSource): string[] {
  if (customerStatusDimension(customer) === 'empresa') {
    return (customer.estadosServicioEmpresa ?? []).filter(value => Boolean(value?.trim()));
  }
  return customer.estado?.trim() ? [customer.estado] : [];
}

export function customerStatusPresentation(value?: string | null) {
  return { label: value?.trim() ? value : 'Sin dato' };
}

export function CustomerStatusBadge({ value }: { value?: string | null }) {
  return <StatusBadge value={value}/>;
}

/** Status of the dimension the API actually returned, with its label; absence stays absence. */
export function CustomerStatusSummary({ customer, compact = false, format = value => value }: {
  customer: CustomerStatusSource; compact?: boolean; format?: (value: string) => string;
}) {
  const dimension = customerStatusDimension(customer);
  const values = customerStatusValues(customer);
  if (dimension === 'global') return <StatusBadge value={values[0] ? format(values[0]) : null}/>;
  const label = CUSTOMER_STATUS_DIMENSION_LABELS.empresa;
  return <span className="customer-status-context" title={label}>
    <small style={compact ? SCREEN_READER_ONLY : { display: 'block' }}>{label}{compact ? ': ' : ''}</small>
    {values.length ? values.map(value => <StatusBadge key={value} value={format(value)}/>) : <small>Sin servicio en esta empresa</small>}
  </span>;
}
