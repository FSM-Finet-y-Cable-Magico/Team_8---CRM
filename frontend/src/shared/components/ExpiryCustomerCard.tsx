import { Users } from 'lucide-react';
import type { Customer } from '../../api';
import { formatDateOnly } from '../../lib';
import { ExpiryBadge } from './ExpiryBadge';
import { StatusBadge } from './StatusBadge';

export type ExpiryCustomerAlert = {
  idContrato: number;
  cliente: string;
  rut: string | null;
  plan: string | null;
  estado: string;
  fechaVencimiento: string;
  diasRestantes: number;
};

export function ExpiryCustomerCard({ alert, customer }: { alert: ExpiryCustomerAlert; customer: Customer | null }) {
  const company = customer?.empresa?.nombre ?? customer?.empresas?.join(', ') ?? 'Sin empresa registrada';

  return (
    <article className="expiry-customer-card">
      <header>
        <span className="expiry-customer-avatar" aria-hidden="true">
          <Users size={21} strokeWidth={1.8} />
        </span>
        <div>
          <h3>{customer?.nombreCompleto ?? alert.cliente}</h3>
        </div>
        <StatusBadge value={customer?.estado ?? alert.estado} />
      </header>

      <dl className="expiry-customer-data">
        <div>
          <dt>RUT</dt>
          <dd>{customer?.rut ?? alert.rut ?? 'No registrado'}</dd>
        </div>
        <div>
          <dt>Teléfono</dt>
          <dd>{customer?.telefono ?? 'No registrado'}</dd>
        </div>
        <div>
          <dt>Correo</dt>
          <dd>{customer?.email ?? 'No registrado'}</dd>
        </div>
        <div>
          <dt>Empresa</dt>
          <dd>{company}</dd>
        </div>
        <div>
          <dt>Origen</dt>
          <dd>{customer?.origenContacto ?? 'No registrado'}</dd>
        </div>
      </dl>

      <div className="expiry-contract-card">
        <span>Contrato #{alert.idContrato}</span>
        <strong>{alert.plan ?? 'Plan sin detalle'}</strong>
        <small>Vencimiento: {formatDateOnly(alert.fechaVencimiento)}</small>
        <ExpiryBadge days={alert.diasRestantes} />
      </div>
    </article>
  );
}
