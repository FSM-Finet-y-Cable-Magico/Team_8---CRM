import { useState } from 'react';
import { api, apiErrorMessage, type Role, type UserRow } from '../../api';

export function UsersPanel({ users, roles, onUpdated }: { users: UserRow[]; roles: Role[]; onUpdated: () => void }) {
  const [status, setStatus] = useState('');

  async function assignRole(userId: number, roleId: number) {
    try {
      await api.patch(`/users/${userId}/role`, { roleId });
      setStatus('Perfil actualizado');
      onUpdated();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  return (
    <section className="users-panel">
      <h2>Usuarios</h2>
      {status && <p className="inline-status">{status}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Empresa</th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.idUsuario}>
                <td>{row.nombreCompleto}</td>
                <td>{row.email}</td>
                <td>
                  <select
                    value={row.roles[0]?.idRol ?? ''}
                    onChange={(event) => void assignRole(row.idUsuario, Number(event.target.value))}
                  >
                    {roles.map((role) => (
                      <option key={role.idRol} value={role.idRol}>
                        {role.nombreRol}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{row.empresa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
