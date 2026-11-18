import { useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage, type Customer, type CustomerService, type Plan, type Prospect } from '../../api';
import { CustomerPlanForm } from '../customers/CustomerPlanForm';

/** Reuse the customer's identity and the existing quote/signature flow after the last service ended. */
export function ReturningCustomerActions({ prospect, plans, onChanged }: {
  prospect: Prospect; plans: Plan[]; onChanged: () => void;
}) {
  const [loaded, setLoaded] = useState<{ customer: Customer; services: CustomerService[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const companyId = prospect.empresa?.idEmpresa;
  const debt = prospect.excliente?.situacionFinanciera;
  const allowed = debt === 'SIN_DEUDA' && Boolean(prospect.idCliente && companyId);

  async function open() {
    if (!allowed || loading || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setError('');
    try {
      const [{ data: customer }, { data: services }] = await Promise.all([
        api.get<Customer>(`/customers/${prospect.idCliente}`, { params: { scope: String(companyId) }, signal: controller.signal }),
        api.get<CustomerService[]>(`/services/customer/${prospect.idCliente}`, { params: { scope: String(companyId) }, signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      if (customer.idCliente !== prospect.idCliente) throw new Error('La consulta no corresponde al excliente seleccionado.');
      setLoaded({ customer, services });
    } catch (err) {
      if (!controller.signal.aborted) setError(apiErrorMessage(err));
    } finally {
      if (!controller.signal.aborted) { setLoading(false); pending.current = null; }
    }
  }

  if (loaded && allowed) return <CustomerPlanForm customer={loaded.customer} services={loaded.services}
    plans={plans.filter(plan => plan.idEmpresa === companyId)} initialCompanyId={companyId ?? undefined}
    onCancel={() => setLoaded(null)} onCreated={async () => { setLoaded(null); onChanged(); }} />;

  return <section className="stack" aria-label="Nueva contratación del excliente">
    <h3>Volver a contratar</h3>
    <p>{debt === 'SIN_DEUDA' ? 'Puedes cotizar y contratar nuevamente conservando los datos e historial de esta persona.'
      : debt === 'CON_DEUDA' ? 'Debe regularizar la deuda histórica pendiente con esta empresa antes de contratar nuevamente.'
        : 'Se requiere revisar el saldo histórico antes de contratar nuevamente.'}</p>
    <button type="button" disabled={!allowed || loading} onClick={() => void open()}>{loading ? 'Cargando…' : 'Cotizar nuevo servicio'}</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
