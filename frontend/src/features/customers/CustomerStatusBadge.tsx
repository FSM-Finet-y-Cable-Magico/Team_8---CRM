import { useId } from 'react';
import { StatusBadge } from '../../shared/components';

const SCOPED_CUSTOMER_STATUS = 'restringido por empresa';
const SCOPED_CUSTOMER_EXPLANATION = 'Se muestran los contratos y servicios de la empresa autorizada. El estado global del cliente no se comparte en esta vista; consulta el estado de cada contrato o servicio.';

// Presentation only: the API marker and the financial/operational states remain
// unchanged. A scoped projection is not a denial of access to its contracts.
export function customerStatusPresentation(value?: string | null) {
  return value?.trim().toLocaleLowerCase('es-CL') === SCOPED_CUSTOMER_STATUS
    ? { label: 'Estado global no compartido', explanation: SCOPED_CUSTOMER_EXPLANATION }
    : { label: value ?? 'Sin dato', explanation: null };
}

export function CustomerStatusBadge({ value, compact = false }: { value?: string | null; compact?: boolean }) {
  const explanationId = useId();
  const presentation = customerStatusPresentation(value);
  if (!presentation.explanation) return <StatusBadge value={value}/>;

  return <span className="customer-status-context">
    <span title={presentation.explanation} aria-describedby={explanationId} tabIndex={compact ? 0 : undefined}>
      <StatusBadge value={presentation.label}/>
    </span>
    <small id={explanationId} style={compact
      ? { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }
      : { display: 'block', maxWidth: '32rem' }}>
      {presentation.explanation}
    </small>
  </span>;
}
