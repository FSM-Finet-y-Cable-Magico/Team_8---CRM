import { FormEvent, useState } from 'react';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, apiErrorMessage, type Company, type Role, type UserRow } from '../../api';
import { Modal, StatusBadge } from '../../shared/components';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';

const blank = { nombreCompleto: '', email: '', idEmpresa: '', roleId: '', activo: true, password: '' };

export function UsersPanel({
  users,
  roles,
  companies,
  currentUserId,
  onUpdated,
}: {
  users: UserRow[];
  roles: Role[];
  companies: Company[];
  currentUserId: number;
  onUpdated: () => void;
}) {
  const { message: status, showMessage: setStatus, clearMessage: clearStatus } = useTransientMessage();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState(blank);
  const [password, setPassword] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [modalNotice, setModalNotice] = useState('');
  const [modalError, setModalError] = useState('');
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<number | null>(null);

  function openEditor(row?: UserRow) {
    clearStatus();
    setModalNotice('');
    setModalError('');
    setPassword('');
    setResetOpen(false);
    setEditing(row?.idUsuario ?? 'new');
    setForm(row ? {
      nombreCompleto: row.nombreCompleto,
      email: row.email ?? '',
      idEmpresa: row.idEmpresa ? String(row.idEmpresa) : '',
      roleId: String(row.roles[0]?.idRol ?? ''),
      activo: row.activo !== false,
      password: '',
    } : blank);
  }

  function closeEditor() {
    if (busy) return;
    setEditing(null);
    setForm(blank);
    setPassword('');
    setResetOpen(false);
    setModalNotice('');
    setModalError('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || editing === null) return;
    setBusy(true);
    setModalNotice('');
    setModalError('');
    const data = {
      ...form,
      nombreCompleto: form.nombreCompleto.trim(),
      email: form.email.trim(),
      idEmpresa: form.idEmpresa ? Number(form.idEmpresa) : undefined,
      roleId: Number(form.roleId),
      password: editing === 'new' ? form.password : undefined,
    };

    try {
      if (editing === 'new') {
        await api.post('/users', data);
      } else {
        await api.patch(`/users/${editing}`, data);
      }
      closeEditor();
      setStatus(editing === 'new' ? 'Usuario creado.' : 'Usuario actualizado.');
      onUpdated();
    } catch (error) {
      setModalError(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (typeof editing !== 'number' || busy || password.length < 12) return;
    setBusy(true);
    setModalNotice('');
    setModalError('');
    try {
      await api.patch(`/users/${editing}/password`, { password });
      setPassword('');
      setResetOpen(false);
      setModalNotice('Contraseña actualizada y sesiones anteriores cerradas.');
      onUpdated();
    } catch (error) {
      setModalError(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleUser(row: UserRow) {
    const roleId = row.roles[0]?.idRol;
    if (!roleId || rowBusy !== null || row.idUsuario === currentUserId) return;
    setRowBusy(row.idUsuario);
    clearStatus();
    try {
      await api.patch(`/users/${row.idUsuario}`, {
        nombreCompleto: row.nombreCompleto,
        email: row.email ?? '',
        idEmpresa: row.idEmpresa ?? undefined,
        roleId,
        activo: row.activo === false,
      });
      setStatus(row.activo === false ? 'Usuario activado.' : 'Usuario desactivado.');
      onUpdated();
    } catch (error) {
      setStatus(apiErrorMessage(error));
    } finally {
      setRowBusy(null);
    }
  }

  async function deleteUser() {
    if (!deleting || busy || deleting.idUsuario === currentUserId) return;
    setBusy(true);
      clearStatus();
    try {
      await api.delete(`/users/${deleting.idUsuario}`);
      setDeleting(null);
      setStatus('Usuario eliminado.');
      onUpdated();
    } catch (error) {
      setStatus(apiErrorMessage(error));
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="users-panel users-catalog stack">
      <div className="page-heading users-catalog-heading">
        <h1>Usuarios</h1>
        <button type="button" onClick={() => openEditor()}><Plus size={17} />Crear usuario</button>
      </div>

      {status && <p role="status" className="inline-status">{status}</p>}

      <section className="users-catalog-list">
        <div className="table-wrap">
          <table className="operational-table users-table">
            <thead>
              <tr><th>Nombre</th><th>Correo</th><th>Perfil</th><th>Empresa</th><th>Estado</th><th className="users-actions-heading">Acciones</th></tr>
            </thead>
            <tbody>
              {users.map((row) => {
                const isCurrentUser = row.idUsuario === currentUserId;
                const isActive = row.activo !== false;
                return (
                  <tr key={row.idUsuario} className={isActive ? undefined : 'user-row-inactive'}>
                    <td>{row.nombreCompleto}</td>
                    <td>{row.email}</td>
                    <td>{row.roles.map((role) => role.nombreRol).join(', ')}</td>
                    <td>{row.empresa ?? 'Todas'}</td>
                    <td><StatusBadge value={isActive ? 'Activo' : 'Inactivo'} /></td>
                    <td>
                      <div className="table-actions user-table-actions">
                        <button
                          type="button"
                          className={isActive ? 'user-toggle active' : 'user-toggle'}
                          role="switch"
                          aria-checked={isActive}
                          aria-label={`${isActive ? 'Desactivar' : 'Activar'} a ${row.nombreCompleto}`}
                          title={isCurrentUser ? 'No puedes desactivar tu propia cuenta' : undefined}
                          disabled={rowBusy !== null || isCurrentUser}
                          onClick={() => void toggleUser(row)}
                        ><span /></button>
                        <button type="button" className="secondary compact user-edit-action" aria-label={`Editar a ${row.nombreCompleto}`} onClick={() => openEditor(row)}>
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="secondary compact user-delete-action"
                          aria-label={`Eliminar a ${row.nombreCompleto}`}
                          title={isCurrentUser ? 'No puedes eliminar tu propia cuenta' : undefined}
                          disabled={isCurrentUser}
                          onClick={() => { clearStatus(); setDeleting(row); }}
                        ><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Modal title={editing === 'new' ? 'Crear usuario' : 'Editar usuario'} open={editing !== null} onClose={closeEditor}>
        <form className="user-modal-form" onSubmit={save}>
          <div className="user-form-grid">
            <label>Nombre completo<input required maxLength={80} value={form.nombreCompleto} onChange={(event) => setForm({ ...form, nombreCompleto: event.target.value })} /></label>
            <label>Correo<input type="email" required maxLength={120} value={form.email} readOnly={editing !== 'new'} aria-readonly={editing !== 'new'} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label>Perfil<select required value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}><option value="">Seleccionar</option>{roles.map((role) => <option key={role.idRol} value={role.idRol}>{role.nombreRol}</option>)}</select></label>
            <label>Empresa<select value={form.idEmpresa} onChange={(event) => setForm({ ...form, idEmpresa: event.target.value })}><option value="">Todas (solo administrador)</option>{companies.map((company) => <option key={company.idEmpresa} value={company.idEmpresa}>{company.nombre}</option>)}</select></label>
            {editing === 'new' && <label className="user-password-field">Contraseña (mínimo 12 caracteres)<input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>}
          </div>

          {typeof editing === 'number' && (
            <section className="user-access-section">
              <button type="button" className="secondary user-reset-trigger" onClick={() => { setResetOpen((open) => !open); setModalError(''); setModalNotice(''); }}>
                <KeyRound size={16} />Restablecer acceso
              </button>
              {resetOpen && (
                <div className="user-reset-fields">
                  <label>Nueva contraseña<input type="password" autoComplete="new-password" minLength={12} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                  <button type="button" disabled={busy || password.length < 12} onClick={() => void resetPassword()}>{busy ? 'Actualizando…' : 'Actualizar contraseña'}</button>
                </div>
              )}
            </section>
          )}

          {modalNotice && <p role="status" className="inline-status">{modalNotice}</p>}
          {modalError && <p role="alert" className="alert">{modalError}</p>}
          <div className="user-modal-actions">
            <button type="button" className="secondary" onClick={closeEditor}>Cancelar</button>
            <button type="submit" disabled={busy || !form.nombreCompleto.trim() || !form.roleId}>{busy ? 'Guardando…' : editing === 'new' ? 'Crear usuario' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <Modal title="Eliminar usuario" open={Boolean(deleting)} onClose={() => { if (!busy) setDeleting(null); }}>
        <section className="user-delete-dialog stack">
          <p>Se eliminará permanentemente el perfil de <strong>{deleting?.nombreCompleto}</strong>. El historial operativo se conservará sin alterar sus registros.</p>
          <div className="user-modal-actions">
            <button type="button" className="secondary" onClick={() => setDeleting(null)}>Cancelar</button>
            <button type="button" className="user-delete-confirm" disabled={busy} onClick={() => void deleteUser()}>{busy ? 'Eliminando…' : 'Eliminar usuario'}</button>
          </div>
        </section>
      </Modal>
    </section>
  );
}
