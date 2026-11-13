import { useEffect, useState } from 'react';
import { ArrowLeft, Search, UserRound } from 'lucide-react';
import type { Prospect } from '../../api';
import { formatDateOnly, formatRutForDisplay, formatWorkOrderValue, normalizeWorkOrderValue } from '../../lib';
import { Modal, StatusBadge, TablePagination } from '../../shared/components';
import { InstallOrderForm } from '../installations/InstallOrderForm';
import './customer-pending-installations.css';

function contractFor(prospect: Prospect) { return prospect.contratos?.[0] ?? null; }
function addressFor(prospect: Prospect) {
  const contract = contractFor(prospect);
  return [contract?.direccionInstalacion, contract?.comunaInstalacion, contract?.ciudadInstalacion]
    .filter(value => Boolean(value?.trim())).join(', ') || prospect.direccion || 'No registrada';
}

export function CustomerPendingInstallations({ prospects, loading, error, requestedView, onViewConsumed, canManage, onChanged }: {
  prospects: Prospect[]; loading: boolean; error: string;
  requestedView?: 'activation' | null; onViewConsumed?: () => void;
  canManage: boolean; onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  useEffect(() => {
    if (!requestedView) return;
    setOpen(true); setSelectedProspect(null); setQuery(''); setPage(1);
    onViewConsumed?.();
  }, [requestedView, onViewConsumed]);
  const search = normalizeWorkOrderValue(query);
  const activations = prospects.filter(prospect => !search || normalizeWorkOrderValue([
    prospect.nombreCompleto, prospect.rut, formatRutForDisplay(prospect.rut), prospect.empresa?.nombre, contractFor(prospect)?.idContrato,
    contractFor(prospect)?.plan?.nombreComercial, addressFor(prospect),
  ].filter(value => value != null).join(' ')).includes(search));
  const pageSize = 20;
  const contract = selectedProspect ? contractFor(selectedProspect) : null;
  function close() { setOpen(false); setSelectedProspect(null); }

  return <section className="customer-pending-installations">
    <button type="button" className="customer-pending-trigger" aria-haspopup="dialog"
      aria-label={`Ver pendientes de activación: ${loading ? 'cargando' : error ? 'cantidad no disponible' : prospects.length}`}
      onClick={() => { setSelectedProspect(null); setOpen(true); }}>
      Ver pendientes de activación <span className="customer-pending-count" aria-hidden="true">{loading ? '…' : error ? '—' : prospects.length}</span>
    </button>
    <Modal key={selectedProspect ? `prospect-${selectedProspect.idProspecto}` : 'pending-list'}
      title={selectedProspect ? 'Pendiente de activación' : 'Pendientes de activación'} open={open} onClose={close}>
      <div className={`customer-pending-modal${selectedProspect ? ' customer-pending-modal-detail' : ''}`}>
        {selectedProspect ? <>
          <button autoFocus type="button" className="customer-pending-back" onClick={() => setSelectedProspect(null)}><ArrowLeft size={16} aria-hidden="true" />Volver a pendientes</button>
          <header className="customer-pending-person"><span className="customer-pending-avatar"><UserRound size={22} aria-hidden="true" /></span><div><h3>{selectedProspect.nombreCompleto ?? 'Sin nombre registrado'}</h3><p>{formatRutForDisplay(selectedProspect.rut) ?? 'RUT no registrado'}</p></div><StatusBadge value="Pendiente de activación" /></header>
          <dl className="customer-pending-data">
            <div><dt>Empresa</dt><dd>{selectedProspect.empresa?.nombre ?? 'Empresa no registrada'}</dd></div>
            <div><dt>Contacto</dt><dd>{selectedProspect.telefono ?? selectedProspect.email ?? 'No registrado'}</dd></div>
            <div><dt>Plan contratado</dt><dd>{contract?.plan?.nombreComercial ?? 'No registrado'}</dd></div>
            <div><dt>Contrato</dt><dd>#{contract?.idContrato ?? '-'}</dd></div>
            <div><dt>Estado contrato</dt><dd>{formatWorkOrderValue(contract?.estado ?? 'Firmado')}</dd></div>
            <div><dt>Fecha de firma</dt><dd>{formatDateOnly(contract?.fechaFirmaEfectiva ?? contract?.fechaFirmaManual)}</dd></div>
            <div><dt>Dirección de instalación</dt><dd>{addressFor(selectedProspect)}</dd></div>
            <div><dt>Comuna</dt><dd>{selectedProspect.ubicacionInstalacion?.comuna ?? contract?.comunaInstalacion ?? 'No registrada'}{selectedProspect.ubicacionInstalacion?.fuenteComuna === 'PROSPECTO' && ' (registrada en prospecto; contrato sin modificación)'}</dd></div>
            <div><dt>Ciudad</dt><dd>{selectedProspect.ubicacionInstalacion?.ciudad ?? contract?.ciudadInstalacion ?? 'No registrada'}</dd></div>
            <div><dt>Estado de activación</dt><dd>Pendiente de activación</dd></div>
          </dl>
          <p className="customer-pending-activation-note">La activación del cliente se realizará cuando se complete la instalación.</p>
          {/* The installation order is generated from this same modal, for the exact contract shown. */}
          {contract && <div className="installation-workflow-modal customer-pending-installation">
            <InstallOrderForm key={contract.idContrato} prospect={selectedProspect} contractId={contract.idContrato} canRequest={canManage} singleRefresh onChanged={() => onChanged?.()} />
          </div>}
        </> : <>
          <div className="customer-pending-toolbar">
            <label className="customer-pending-search"><Search size={16} aria-hidden="true" /><input autoFocus type="search" aria-label="Buscar pendientes de activación" placeholder="Buscar cliente, RUT o contrato" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
            <span>{activations.length} {activations.length === 1 ? 'registro' : 'registros'}</span>
          </div>
          {loading ? <p className="customer-pending-note" role="status">Cargando pendientes de activación…</p> : error ? <p className="customer-pending-note" role="alert">No fue posible cargar pendientes de activación: {error}</p> : <>
            <div className="table-wrap customer-pending-table-wrap"><table className="customer-pending-table">
              <thead><tr><th>Cliente / empresa</th><th>Plan / contrato</th><th>Fecha de firma</th><th>Dirección prevista</th><th><span className="sr-only">Acción</span></th></tr></thead>
              <tbody>{activations.slice((page - 1) * pageSize, page * pageSize).map(prospect => { const signed = contractFor(prospect); return <tr key={prospect.idProspecto}>
                <td><strong>{prospect.nombreCompleto ?? '-'}</strong><span>{formatRutForDisplay(prospect.rut) ?? 'RUT no registrado'} · {prospect.empresa?.nombre ?? '-'}</span></td>
                <td><strong>{signed?.plan?.nombreComercial ?? '-'}</strong><span>Contrato #{signed?.idContrato ?? '-'}</span></td>
                <td>{formatDateOnly(signed?.fechaFirmaEfectiva ?? signed?.fechaFirmaManual)}</td>
                <td>{addressFor(prospect)}</td>
                <td><button type="button" className="secondary compact crm-table-action" onClick={() => setSelectedProspect(prospect)}>Gestionar</button></td>
              </tr>; })}</tbody>
            </table></div>
            {!activations.length && <p className="customer-pending-note">No hay pendientes que coincidan con la búsqueda.</p>}
            <TablePagination currentPage={page} totalItems={activations.length} pageSize={pageSize} onPageChange={setPage} />
          </>}
        </>}
      </div>
    </Modal>
  </section>;
}
