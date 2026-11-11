import { useRef, useState, type FormEvent } from 'react';
import { api, apiErrorMessage, type Customer } from '../../api';

export type CustomerProfileFields = Pick<Customer, 'idCliente' | 'nombreCompleto' | 'email' | 'telefono'>;

export function CustomerProfileForm({ customer, onCancel, onSaved, onBusy }: {
  customer: Customer; onCancel: () => void; onSaved: (profile: CustomerProfileFields) => void; onBusy: (busy: boolean) => void;
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
    try {
      const fields = { nombreCompleto: name.trim(), email: email.trim() || null, telefono: phone.trim() || null };
      const { data } = await api.patch<CustomerProfileFields>(`/customers/${customer.idCliente}/profile`, {
        ...(fields.nombreCompleto !== customer.nombreCompleto && { nombreCompleto: fields.nombreCompleto }),
        ...(fields.email !== customer.email && { email: fields.email }),
        ...(fields.telefono !== customer.telefono && { telefono: fields.telefono }),
      });
      onSaved(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      pending.current = false;
      setSaving(false);
      onBusy(false);
    }
  }

  return <form className="workflow-grid customer-profile-edit" onSubmit={event => void submit(event)}>
    <label>Nombre completo<input autoFocus required minLength={2} maxLength={120} value={name} disabled={saving} onChange={event => setName(event.target.value)}/></label>
    <label>Correo<input type="email" maxLength={120} value={email} disabled={saving} onChange={event => setEmail(event.target.value)}/></label>
    <label>Teléfono<input type="tel" maxLength={20} value={phone} disabled={saving} onChange={event => setPhone(event.target.value)}/></label>
    {error && <p className="inline-status" role="alert">{error}</p>}
    <div className="button-row">
      <button type="button" className="secondary compact" disabled={saving} onClick={onCancel}>Cancelar</button>
      <button type="submit" className="compact" disabled={saving || name.trim().length < 2}>{saving ? 'Guardando…' : 'Guardar datos'}</button>
    </div>
  </form>;
}
