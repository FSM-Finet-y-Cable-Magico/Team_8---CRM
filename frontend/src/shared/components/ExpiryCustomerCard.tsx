import { Users } from 'lucide-react';
import type { Customer } from '../../api';
import { formatDateOnly } from '../../lib';
import { StatusBadge } from './StatusBadge';

export type ExpiryCustomerAlert = {
  idEmpresa?: number; idCliente?: number | null; idFactura?: number; numeroContrato?: string | null; empresa?: string;
  idContrato: number;
  cliente: string;
  rut: string | null;
  plan: string | null;
  estado: string;
  fechaVencimiento: string;
  diasRestantes: number;
};

export function ExpiryCustomerCard({ alert, customer, onOpenCustomer }: { alert: ExpiryCustomerAlert; customer: Customer | null; onOpenCustomer?: () => void }) {
  const company = alert.empresa ?? customer?.empresa?.nombre ?? customer?.empresas?.join(', ') ?? 'No registrado';

  return (
    <article className="expiry-customer-card">
      <header>
        <span className="expiry-customer-avatar" aria-hidden="true">
          <Users size={21} strokeWidth={1.8} />
        </span>
        <div>
          <h3>{onOpenCustomer ? <button type="button" className="expiry-customer-name" onClick={onOpenCustomer}>{customer?.nombreCompleto ?? alert.cliente}</button> : customer?.nombreCompleto ?? alert.cliente}</h3>
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
        <div><dt>Contrato</dt><dd>{alert.numeroContrato ?? `#${alert.idContrato}`}</dd></div>
        <div><dt>Plan</dt><dd>{alert.plan ?? 'No registrado'}</dd></div>
        <div><dt>Fecha de vencimiento</dt><dd>{formatDateOnly(alert.fechaVencimiento)}</dd></div>
      </dl>
    </article>
  );
}
