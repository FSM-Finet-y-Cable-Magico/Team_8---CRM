import { useEffect, useState } from 'react';
import { api, type InstallationHistory, type WorkOrder } from '../../api';
import { TablePagination } from '../../shared/components';
import { WorkOrderTechnicalEvidence } from './WorkOrderTechnicalEvidence';

export function InstallationHistoryPanel({ scope, revision, localOrders = [], onLoaded }: {
  scope: string; revision: unknown; localOrders?: WorkOrder[]; onLoaded?: (scope: string, keys: string[]) => void;
}) {
  const [result, setResult] = useState<{ scope: string; data?: InstallationHistory; error?: boolean } | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(null); setPage(1);
    void api.get<InstallationHistory>('/integrations/g3/installation-history', { params: { scope } })
      .then(({ data }) => { if (active) { setResult({ scope, data }); onLoaded?.(scope, data.items.map(row => row.key)); } })
      .catch(() => { if (active) setResult({ scope, error: true }); });
    return () => { active = false; };
  }, [scope, revision, refresh, onLoaded]);
  // Scope-tagged state also protects the render before the effect cleanup executes.
  const current = result?.scope === scope ? result : null;
  const items = (current?.data?.items ?? []).filter(row => !filter || row.clasificacionFecha === filter);
  const pageSize = 20;
  return <section className="installation-history">
    <h2>Instalaciones completadas: historial</h2>
    <p>Antecedentes registrados en el CRM. Esta consulta no actualiza las instalaciones. Cada empresa y orden se presenta una sola vez; una solicitud técnica puede no tener una orden local.</p>
    <button type="button" className="secondary compact" onClick={() => setRefresh(value => value + 1)}>Actualizar historial</button>
    {!current && <p role="status">Cargando historial confirmado…</p>}
    {current?.error && <p role="alert">No se pudo consultar el historial. Los cierres confirmados no han sido modificados.</p>}
    {current?.data && <>
      <label>Fecha técnica <select value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}>
        <option value="">Todas</option><option value="FECHA_TECNICA_CONFIRMADA">Con fecha técnica</option>
        <option value="PENDIENTE_FECHA_TECNICA">Pendiente de fecha técnica</option><option value="REQUIERE_REVISION">Requiere revisión</option>
      </select></label>
      <p>{items.length} instalaciones completadas. Sin fecha técnica no significa pendiente de ejecución.</p>
      <div className="table-wrap"><table><thead><tr><th>Empresa / OT</th><th>Fuente y referencias</th><th>Contrato / Servicio</th><th>Fecha técnica original</th><th>Solicitud y cierre técnico</th></tr></thead>
        <tbody>{items.slice((page - 1) * pageSize, page * pageSize).map(row => <tr key={row.key}>
          <td>Empresa {row.idEmpresa} / OT {row.idOt ?? 'Sin referencia'}<br />Completada</td>
          <td>{row.fuente === 'LEGACY_LOCAL' ? 'Histórica / local, sin solicitud de instalación confirmada' : 'Cierre de solicitud de instalación confirmado'}{row.ordenesLocales.length ? <details><summary>OT local: {row.ordenesLocales.join(', ')}</summary>
            {localOrders.filter(order => order.idEmpresa === row.idEmpresa && row.ordenesLocales.includes(order.idOt)).map(order => <div key={order.idOt}>
              <p>{order.codigoSeguimiento ?? `OT ${order.idOt}`} · {order.prioridad} · {order.estado}</p>
              <p>{order.prospecto?.nombreCompleto ?? order.cliente?.nombreCompleto ?? `Cliente ${order.idCliente ?? '-'}`}</p>
              <p>Visita programada: {order.fechaProgramada ?? 'Sin fecha'} {order.horaVisita ?? ''}</p>
              <p>Técnico local: {order.tecnico?.nombreCompleto ?? 'Sin asignar'}</p>
            </div>)}
          </details> : <p>Sin OT local</p>}
            {row.antecedentesTecnicos?.map(evidence => <WorkOrderTechnicalEvidence key={`${evidence.idEmpresa}:${evidence.idOt}`} evidence={evidence} />)}</td>
          <td>{row.idContrato ?? 'Sin contrato correlacionado'} / {row.idServicio ?? 'Sin servicio correlacionado'}</td>
          <td>{row.clasificacionFecha === 'REQUIERE_REVISION' ? 'Requiere revisión de fecha o relaciones'
            : row.clasificacionFecha === 'PENDIENTE_FECHA_TECNICA' ? 'Pendiente de fecha técnica'
              : row.fechasTecnicasOriginales.map(date => <div key={date}>{date}</div>)}</td>
          <td>{row.solicitudesG3.length ? <details><summary>{row.solicitudesG3.length} solicitud(es) técnica(s)</summary>
            {row.solicitudesG3.map(request => <div key={request.idIntegracion}>
              <p>Tracking #{request.idIntegracion}</p><p>request_id: {request.requestId}</p><p>trace_id: {request.traceId}</p>
              <p>Procesado en CRM: {request.fechaCierreProcesado} (no es fecha técnica)</p>
            </div>)}
          </details> : 'Sin solicitud técnica'}</td>
        </tr>)}</tbody></table></div>
      <TablePagination currentPage={page} totalItems={items.length} pageSize={pageSize} onPageChange={setPage} />
    </>}
  </section>;
}
