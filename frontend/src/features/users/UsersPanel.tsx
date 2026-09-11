import { FormEvent, useState } from 'react';
import { api, apiErrorMessage, type Company, type Role, type UserRow } from '../../api';
import { Modal, StatusBadge } from '../../shared/components';

const blank = { nombreCompleto: '', email: '', idEmpresa: '', roleId: '', activo: true, password: '' };
export function UsersPanel({ users, roles, companies, onUpdated }: { users: UserRow[]; roles: Role[]; companies: Company[]; onUpdated: () => void }) {
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState(blank);
  const [reset, setReset] = useState<UserRow | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  function edit(row?: UserRow) {
    setStatus(''); setEditing(row?.idUsuario ?? 'new');
    setForm(row ? { nombreCompleto: row.nombreCompleto, email: row.email ?? '', idEmpresa: row.idEmpresa ? String(row.idEmpresa) : '', roleId: String(row.roles[0]?.idRol ?? ''), activo: row.activo !== false, password: '' } : blank);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || editing === null) return; setBusy(true); setStatus('');
    const data = { ...form, nombreCompleto: form.nombreCompleto.trim(), email: form.email.trim(), idEmpresa: form.idEmpresa ? Number(form.idEmpresa) : undefined, roleId: Number(form.roleId), password: editing === 'new' ? form.password : undefined };
    try {
      if (editing === 'new') await api.post('/users', data); else await api.patch('/users/' + editing, data);
      setEditing(null); setForm(blank); setStatus('Usuario guardado. Los cambios de acceso cierran sus sesiones anteriores.'); onUpdated();
    } catch (e) { setStatus(apiErrorMessage(e)); } finally { setBusy(false); }
  }
  async function resetPassword(event: FormEvent) {
    event.preventDefault(); if (!reset || busy) return; setBusy(true); setStatus('');
    try { await api.patch('/users/' + reset.idUsuario + '/password', { password }); setReset(null); setPassword(''); setStatus('Contraseña actualizada y sesiones anteriores cerradas.'); onUpdated(); }
    catch (e) { setStatus(apiErrorMessage(e)); } finally { setBusy(false); }
  }
  return <section className="users-panel">
    <header className="section-heading"><h2>Usuarios</h2><button onClick={() => edit()}>Crear usuario</button></header>
    <p>Desactiva las cuentas que ya no deban ingresar. Su historial se conserva.</p>
    {status && <p role="status" className="inline-status">{status}</p>}
    <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Empresa</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>{users.map(row => <tr key={row.idUsuario}><td>{row.nombreCompleto}</td><td>{row.email}</td><td>{row.roles.map(r => r.nombreRol).join(', ')}</td><td>{row.empresa ?? 'Todas'}</td><td><StatusBadge value={row.activo === false ? 'Inactivo' : 'Activo'} /></td>
        <td><div className="button-row"><button className="secondary compact" onClick={() => edit(row)}>Editar</button><button className="secondary compact" onClick={() => { setReset(row); setPassword(''); setStatus(''); }}>Restablecer acceso</button></div></td></tr>)}</tbody></table></div>
    <Modal title={editing === 'new' ? 'Crear usuario' : 'Editar usuario'} open={editing !== null} onClose={() => { if (!busy) { setEditing(null); setForm(blank); } }}>
      <form className="workflow-grid" onSubmit={save}>
        <label>Nombre completo<input required maxLength={80} value={form.nombreCompleto} onChange={e => setForm({ ...form, nombreCompleto: e.target.value })} /></label>
        <label>Correo<input type="email" required maxLength={120} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <label>Perfil<select required value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })}><option value="">Seleccionar</option>{roles.map(r => <option key={r.idRol} value={r.idRol}>{r.nombreRol}</option>)}</select></label>
        <label>Empresa<select value={form.idEmpresa} onChange={e => setForm({ ...form, idEmpresa: e.target.value })}><option value="">Todas (solo administrador)</option>{companies.map(c => <option key={c.idEmpresa} value={c.idEmpresa}>{c.nombre}</option>)}</select></label>
        <label>Estado<select value={form.activo ? 'true' : 'false'} onChange={e => setForm({ ...form, activo: e.target.value === 'true' })}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>
        {editing === 'new' && <label>Contraseña (mínimo 12 caracteres)<input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>}
        {status && <p role="alert" className="alert">{status}</p>}
        <button disabled={busy || !form.nombreCompleto.trim()}>{busy ? 'Guardando…' : 'Guardar usuario'}</button>
      </form>
    </Modal>
    <Modal title="Restablecer acceso" open={Boolean(reset)} onClose={() => { if (!busy) { setReset(null); setPassword(''); } }}>
      <form className="stack" onSubmit={resetPassword}><p>Se cambiará la contraseña de {reset?.nombreCompleto} y se cerrarán sus sesiones anteriores.</p>
        <label>Nueva contraseña<input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={password} onChange={e => setPassword(e.target.value)} /></label>
        {status && <p role="alert" className="alert">{status}</p>}<button disabled={busy}>{busy ? 'Guardando…' : 'Confirmar cambio'}</button>
      </form>
    </Modal>
  </section>;
}
