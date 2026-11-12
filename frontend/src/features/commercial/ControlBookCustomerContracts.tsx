import { formatWorkOrderValue } from '../../lib';
import { StatusBadge } from '../../shared/components';
import type { Customer, CustomerService } from '../../api';
import { dateLabel, type ControlRow } from './control-book-model';

type Contract = NonNullable<Customer['contratos']>[number];

export function ControlBookCustomerContracts({ row, contracts, services, loading, error, onRetry, selectedContractId, onSelect }: {
  row: ControlRow; contracts: Contract[]; services: CustomerService[]; loading: boolean; error: boolean;
  onRetry: () => void;
  selectedContractId?: number | null; onSelect?: (id: number | null) => void;
}) {
  const byId = new Map(contracts.map(contract => [contract.idContrato, contract]));
  for (const service of services) {
    if (service.contrato && !byId.has(service.contrato.idContrato)) {
      byId.set(service.contrato.idContrato, { ...service.contrato, idEmpresa: service.idEmpresa });
    }
  }
  if (row.idContrato !== null && !byId.has(row.idContrato)) {
    byId.set(row.idContrato, { idContrato: row.idContrato, idEmpresa: row.idEmpresa, numeroContratoExterno: row.numeroContrato });
  }
  const unlinked = services.filter(service => service.idContrato === null || !byId.has(service.idContrato));
  const pendingService = (loading || error) && row.idContrato === null && row.idServicio !== null;

  return <section className="control-customer-contracts" aria-labelledby="control-contracts-heading" aria-busy={loading}>
    <header>
      <h3 id="control-contracts-heading">Contratos y servicios</h3>
    </header>
    {loading && <p className="control-muted" role="status">Cargando servicios…</p>}
    {error && <p className="control-muted" role="status">No se pudo cargar la lista de servicios. <button type="button" className="control-text-button" onClick={onRetry}>Reintentar</button></p>}
    {byId.size > 0 || unlinked.length > 0 || pendingService ? <div className="control-contract-table" role="region" aria-label="Contratos y servicios del cliente" tabIndex={0}>
      <table>
        <thead><tr>{onSelect && <th scope="col"><span className="control-sr-only">Seleccionar plan</span></th>}<th scope="col">Plan</th><th scope="col">Contrato</th><th scope="col">Servicio</th><th scope="col">Dirección de instalación</th><th scope="col">Estado</th></tr></thead>
        <tbody>
          {[...byId.values()].map(contract => {
            const linked = services.filter(service => service.idContrato === contract.idContrato);
            const selected = contract.idContrato === row.idContrato;
            const toggle = () => onSelect?.(selectedContractId === contract.idContrato ? null : contract.idContrato);
            return <tr key={contract.idContrato} className={selectedContractId === contract.idContrato ? 'control-current-contract' : undefined}
              onClick={onSelect ? toggle : undefined}>
              {onSelect && <td><input type="checkbox" name="control-plan" aria-label={`Seleccionar ${contract.plan?.nombreComercial ?? 'plan'} · ${contract.numeroContratoExterno ?? '#' + contract.idContrato}`} checked={selectedContractId === contract.idContrato} onClick={event => event.stopPropagation()} onChange={toggle}/></td>}
              <th scope="row">{contract.plan?.nombreComercial ?? (selected ? row.plan : null) ?? 'Sin plan asociado'}</th>
              <td><span>{contract.numeroContratoExterno ?? (selected ? row.numeroContrato : null) ?? `#${contract.idContrato}`}</span>
                {(contract.fechaFirmaEfectiva || contract.fechaFirmaManual) && <small>Firma {dateLabel(contract.fechaFirmaEfectiva ?? contract.fechaFirmaManual)}</small>}
              </td>
              <td>{linked.length ? linked.map(service => <div key={service.idServicio}>{service.tipoServicio} · {formatWorkOrderValue(service.estadoOperativo)}</div>)
                : selected && row.estadoServicio ? formatWorkOrderValue(row.estadoServicio) : loading || error ? '—' : 'Sin servicio registrado'}</td>
              <td>{[...new Set(linked.flatMap(service => service.direccion?.direccionCompleta ? [service.direccion.direccionCompleta] : []))].join(' · ')
                || contract.direccionInstalacion || (selected ? row.direccion : null) || '—'}</td>
              <td>{contract.estado ? <StatusBadge value={contract.estado}/> : '—'}</td>
            </tr>;
          })}
          {unlinked.map(service => <tr key={'service-' + service.idServicio}>
            {onSelect && <td/>}
            <th scope="row">{service.contrato?.plan?.nombreComercial ?? 'Sin plan asociado'}</th>
            <td>{service.idContrato === null ? '—' : `#${service.idContrato}`}</td>
            <td>{service.tipoServicio} · {formatWorkOrderValue(service.estadoOperativo)}</td>
            <td>{service.direccion?.direccionCompleta ?? '—'}</td>
            <td>—</td>
          </tr>)}
          {pendingService && <tr><th scope="row">{row.plan ?? 'Sin plan asociado'}</th><td>—</td><td>{row.estadoServicio ? formatWorkOrderValue(row.estadoServicio) : '—'}</td><td>{row.direccion ?? '—'}</td></tr>}
        </tbody>
      </table>
    </div> : !loading && !error && <p className="control-muted">Este cliente aún no tiene contratos ni servicios registrados.</p>}
  </section>;
}
