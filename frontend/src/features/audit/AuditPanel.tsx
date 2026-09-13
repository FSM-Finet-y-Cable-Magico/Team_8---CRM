import type { AuditLog } from '../../api';

export function AuditPanel({ audit }: { audit: AuditLog[] }) {
  return (
    <section className="audit-panel">
      <h2>Auditoría</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Accion</th>
              <th>Entidad</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((row) => (
              <tr key={row.idLog}>
                <td>{row.fechaHora ? new Date(row.fechaHora).toLocaleString() : '-'}</td>
                <td>{row.accion}</td>
                <td>{row.entidadAfectada ?? '-'}</td>
                <td>{row.usuario?.email ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
