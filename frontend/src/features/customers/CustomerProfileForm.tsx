import { useRef, useState, type FormEvent } from 'react';
import { api, apiErrorMessage, type Customer } from '../../api';
import { Users } from 'lucide-react';
import { CustomerStatusSummary } from './CustomerStatusBadge';
import { chileRegions, findChileRegion, normalizeTerritory } from '../../shared/data/chile-territories';

export type CustomerProfileFields = Pick<Customer, 'idCliente' | 'nombreCompleto' | 'email' | 'telefono' | 'direccionActual' | 'direccionesOmitidas'>;

export function CustomerProfileForm({ customer, onCancel, onSaved, onBusy, companyLabel, addressLabel, contractsLabel }: {
  customer: Customer; onCancel: () => void; onSaved: (profile: CustomerProfileFields) => void; onBusy: (busy: boolean) => void;
  companyLabel?: string; addressLabel?: string; contractsLabel?: string;
}) {
  const [name, setName] = useState(customer.nombreCompleto);
  const [email, setEmail] = useState(customer.email ?? '');
  const [phone, setPhone] = useState(customer.telefono ?? '');
  const registeredAddress = customer.direcciones?.find(item => item.esPrincipal) ?? customer.direcciones?.[0];
  const initialAddress = customer.direccionActual ?? {
    direccion: typeof customer.datosTecnicos?.direccion === 'string' ? customer.datosTecnicos.direccion
      : registeredAddress?.direccionCompleta ?? (addressLabel && addressLabel !== 'No registrada' && addressLabel !== '—' ? addressLabel : ''),
    comuna: registeredAddress?.comuna ?? '',
  };
  const [address, setAddress] = useState(initialAddress.direccion);
  const initialRegion = chileRegions.find(item => item.comunas.some(value => normalizeTerritory(value) === normalizeTerritory(initialAddress.comuna)));
  const [regionName, setRegionName] = useState(initialRegion?.nombre ?? '');
  const [commune, setCommune] = useState(initialRegion?.comunas.find(value => normalizeTerritory(value) === normalizeTerritory(initialAddress.comuna)) ?? initialAddress.comuna);
  const region = findChileRegion(regionName);
  const addressChanged = address.trim() !== initialAddress.direccion.trim() || commune.trim() !== initialAddress.comuna.trim();
  const addressValid = !addressChanged || address.trim().length >= 3 && Boolean(region?.comunas.includes(commune));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || name.trim().length < 2 || !addressValid) return;
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
        ...(addressChanged && { direccionActual: { direccion: address.trim(), comuna: commune.trim() } }),
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
      <CustomerStatusSummary customer={customer}/>
    </header>
    <div className="customer-profile-data">
      <div><span>Empresa</span><strong>{companyLabel ?? customer.empresa?.nombre ?? '—'}</strong></div>
      <div><span>Origen</span><strong>{customer.origenContacto ?? '—'}</strong></div>
      <label>Teléfono<input type="tel" maxLength={20} value={phone} disabled={saving} onChange={event => setPhone(event.target.value)}/></label>
      <label>Correo<input type="email" maxLength={120} value={email} disabled={saving} onChange={event => setEmail(event.target.value)}/></label>
      <label>Dirección<input maxLength={200} minLength={3} required={addressChanged} value={address} disabled={saving} onChange={event => setAddress(event.target.value)} /></label>
      <div><span>Contratos / servicios</span><strong>{contractsLabel ?? '—'}</strong></div>
      <label>Región<select required={addressChanged} value={regionName} disabled={saving} onChange={event => { setRegionName(event.target.value); setCommune(''); }}>
        <option value="">Seleccionar región</option>{chileRegions.map(item => <option key={item.codigo} value={item.nombre}>{item.nombre}</option>)}
      </select></label>
      <label>Comuna<select required={addressChanged} value={commune} disabled={saving || !region} onChange={event => setCommune(event.target.value)}>
        <option value="">{region ? 'Seleccionar comuna' : 'Selecciona primero una región'}</option>
        {!region && commune && <option value={commune}>{commune}</option>}
        {region?.comunas.map(item => <option key={item} value={item}>{item}</option>)}
      </select></label>
    </div>
    {error && <p className="inline-status" role="alert">{error}</p>}
    <div className="button-row customer-profile-edit-actions">
      <button type="button" className="secondary compact" disabled={saving} onClick={onCancel}>Cancelar</button>
      <button type="submit" className="compact" disabled={saving || name.trim().length < 2 || !addressValid}>{saving ? 'Guardando…' : 'Guardar datos'}</button>
    </div>
  </form>;
}
