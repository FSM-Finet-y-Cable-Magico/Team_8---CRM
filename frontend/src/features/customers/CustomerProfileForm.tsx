import { useRef, useState, type FormEvent } from 'react';
import { api, apiErrorMessage, type Customer } from '../../api';
import { Users } from 'lucide-react';
import { CustomerStatusBadge } from './CustomerStatusBadge';

export type CustomerProfileFields = Pick<Customer, 'idCliente' | 'nombreCompleto' | 'email' | 'telefono'>;

export function CustomerProfileForm({ customer, onCancel, onSaved, onBusy, companyLabel, addressLabel, contractsLabel }: {
  customer: Customer; onCancel: () => void; onSaved: (profile: CustomerProfileFields) => void; onBusy: (busy: boolean) => void;
  companyLabel?: string; addressLabel?: string; contractsLabel?: string;
}) {
  const [name, setName] = useState(customer.nombreCompleto);
  const [email, setEmail] = useState(customer.email ?? '');
  const [phone, setPhone] = useState(customer.telefono ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || name.trim().length < 2) return;
    pending.current = true;
    setSaving(true);
    setError('');
    onBusy(true);
    let saved: CustomerProfileFields | null = null;
    try {
      const fields = { nombreCompleto: name.trim(), email: email.trim() || null, telefono: phone.trim() || null };
      const { data } = await api.patch<CustomerProfileFields>(`/customers/${customer.idCliente}/profile`, {
        ...(fields.nombreCompleto !== customer.nombreCompleto && { nombreCompleto: fields.nombreCompleto }),
        ...(fields.email !== customer.email && { email: fields.email }),
        ...(fields.telefono !== customer.telefono && { telefono: fields.telefono }),
      }, { timeout: 15000 });
      saved = data;
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      pending.current = false;
      setSaving(false);
      onBusy(false);
    }
    if (saved) onSaved(saved);
  }

  return <form className="customer-profile-overview customer-profile-edit" aria-label="Editar ficha del cliente" onSubmit={event => void submit(event)}>
    <header className="customer-profile-header">
      <span className="customer-profile-avatar" aria-hidden="true"><Users size={22}/></span>
      <div><label>Nombre completo<input autoFocus required minLength={2} maxLength={120} value={name} disabled={saving} onChange={event => setName(event.target.value)}/></label><p>{customer.rut ?? 'RUT no registrado'}</p></div>
      <CustomerStatusBadge value={customer.estado}/>
    </header>
    <div className="customer-profile-data">
      <div><span>Empresa</span><strong>{companyLabel ?? customer.empresa?.nombre ?? '—'}</strong></div>
      <div><span>Origen</span><strong>{customer.origenContacto ?? '—'}</strong></div>
      <label>Teléfono<input type="tel" maxLength={20} value={phone} disabled={saving} onChange={event => setPhone(event.target.value)}/></label>
      <label>Correo<input type="email" maxLength={120} value={email} disabled={saving} onChange={event => setEmail(event.target.value)}/></label>
      <div><span>Dirección</span><strong>{addressLabel ?? '—'}</strong></div>
      <div><span>Contratos / servicios</span><strong>{contractsLabel ?? '—'}</strong></div>
    </div>
    {error && <p className="inline-status" role="alert">{error}</p>}
    <div className="button-row customer-profile-edit-actions">
      <button type="button" className="secondary compact" disabled={saving} onClick={onCancel}>Cancelar</button>
      <button type="submit" className="compact" disabled={saving || name.trim().length < 2}>{saving ? 'Guardando…' : 'Guardar datos'}</button>
    </div>
  </form>;
}
