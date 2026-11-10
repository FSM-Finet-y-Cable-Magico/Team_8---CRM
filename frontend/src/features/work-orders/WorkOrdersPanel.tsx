import { useState } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, Search } from 'lucide-react';
import { type WorkOrder } from '../../api';
import {
  formatDateOnly,
  formatWorkOrderValue,
  normalizeWorkOrderValue,
} from '../../lib';
import { Modal, StatusBadge } from '../../shared/components';
import { WorkOrderDetail } from './WorkOrderDetail';

const sortLabels = { code: 'Código registro', type: 'Tipo', date: 'Fecha' } as const;
type SortField = keyof typeof sortLabels;
const collator = new Intl.Collator('es-CL', { numeric: true, sensitivity: 'base' });

export function WorkOrdersPanel({ workOrders }: { workOrders: WorkOrder[]; onChanged: () => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ field: SortField; descending: boolean } | null>(null);
  const selectedOrder = workOrders.find((order) => order.idOt === selectedId) ?? null;

  function ownerLabel(order: WorkOrder) {
    if (order.prospecto?.idProspecto) {
      return order.prospecto.nombreCompleto?.trim()
        || order.cliente?.nombreCompleto?.trim()
        || `Prospecto #${order.prospecto.idProspecto}`;
    }

    if (order.idCliente) {
      return order.cliente?.nombreCompleto?.trim() || `Cliente #${order.idCliente}`;
    }

    if (order.idTicket) {
      return `Ticket ${order.ticket?.codigoSeguimiento ?? order.idTicket}`;
    }

    return '—';
  }

  function formatWorkOrderTicketCode(order: WorkOrder, fallback = '-') {
    const code = order.ticket?.codigoSeguimiento?.trim();

    if (code) {
      return code;
    }

    return fallback;
  }

  function formatWorkOrderCode(order: WorkOrder) {
    const code = order.codigoSeguimiento?.trim();

    if (code) {
      return code;
    }

    const normalizedType = normalizeWorkOrderValue(order.tipoOt);
    const prefix = normalizedType.includes('instalacion')
      ? 'INS'
      : normalizedType.includes('reparacion')
        ? 'REP'
        : normalizedType.includes('soporte')
          ? 'SOP'
          : 'OTR';

    return `OT-${prefix}-${String(order.idOt).padStart(6, '0')}`;
  }

  const rows = workOrders.map(order => ({
    order,
    code: formatWorkOrderCode(order),
    client: order.cliente?.nombreCompleto?.trim() || order.prospecto?.nombreCompleto?.trim()
      || (order.idCliente ? `Cliente #${order.idCliente}` : 'Sin cliente asociado'),
    ticket: formatWorkOrderTicketCode(order),
    technician: order.tecnico?.nombreCompleto ?? 'Sin asignar',
    type: formatWorkOrderValue(order.tipoOt),
    date: order.fechaProgramada ? `${order.fechaProgramada.slice(0, 10)} ${order.horaVisita ?? ''}` : '',
    priority: formatWorkOrderValue(order.prioridad),
    status: formatWorkOrderValue(order.estado),
  }));
  const searchTerm = normalizeWorkOrderValue(query);
  const rutTerm = /^[\d.k-]+$/.test(searchTerm) ? searchTerm.replace(/[.-]/g, '') : '';
  const visibleRows = rows.filter(row => {
    if (!searchTerm) return true;
    const ruts = [row.order.cliente?.rut, row.order.prospecto?.rut];
    return [row.code, row.client, row.ticket, row.technician, ...ruts]
      .some(value => normalizeWorkOrderValue(value).includes(searchTerm))
      || Boolean(rutTerm && ruts.some(rut => normalizeWorkOrderValue(rut).replace(/[.-]/g, '').includes(rutTerm)));
  });

  if (sort) {
    const { field, descending } = sort;
    visibleRows.sort((left, right) => {
      const a = left[field];
      const b = right[field];
      if (field === 'date' && Boolean(a) !== Boolean(b)) return a ? -1 : 1;
      return descending ? collator.compare(b, a) : collator.compare(a, b);
    });
  }

  function sortableHeading(field: SortField) {
    const direction = sort?.field === field ? (sort.descending ? 'descending' : 'ascending') : undefined;
    const Icon = direction === 'ascending' ? ArrowUp : direction === 'descending' ? ArrowDown : ArrowDownUp;
    return <th scope="col" aria-sort={direction}>
      <button type="button" className="work-order-column-sort" onClick={() => setSort(current => ({
        field,
        descending: current?.field === field && !current.descending,
      }))}>
        {sortLabels[field]} <Icon size={14} aria-hidden="true" />
      </button>
    </th>;
  }

  return (
    <section className="work-orders-panel stack">
      <div className="section-heading">
        <h2>Órdenes de trabajo</h2>
      </div>
      <div className="work-orders-toolbar">
        <label className="work-orders-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" aria-label="Buscar órdenes de trabajo" placeholder="Buscar por código, cliente, RUT, ticket o técnico" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        {searchTerm && <button type="button" className="secondary compact crm-table-action" onClick={() => setQuery('')}>Limpiar búsqueda</button>}
        <span className="work-orders-result-count" role="status">{searchTerm ? `${visibleRows.length} de ${rows.length}` : rows.length} {rows.length === 1 ? 'orden' : 'órdenes'}</span>
      </div>
      <div className="table-wrap work-orders-table-wrap">
        <table className="work-orders-table operational-table">
          <thead>
            <tr>
              {sortableHeading('code')}
              {sortableHeading('type')}
              <th>Cliente</th>
              <th>Ticket</th>
              {sortableHeading('date')}
              <th>Técnico</th>
              <th className="operational-badge-column">Prioridad</th>
              <th className="operational-badge-column">Estado</th>
              <th><span className="sr-only">Acción</span></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => (
              <tr key={row.order.idOt}>
                <td className="work-order-id">{row.code}</td>
                <td><span className="work-order-type">{row.type}</span></td>
                <td>{row.client}</td>
                <td>{row.ticket}</td>
                <td>
                  {row.order.fechaProgramada ? formatDateOnly(row.order.fechaProgramada) : '-'}
                  {row.order.horaVisita ? ` ${row.order.horaVisita}` : ''}
                </td>
                <td>{row.technician}</td>
                <td className="operational-badge-column"><StatusBadge value={row.priority} /></td>
                <td className="operational-badge-column"><StatusBadge value={row.status} /></td>
                <td>
                  <button
                    className="secondary compact crm-table-action"
                    onClick={() => {
                      setSelectedId(row.order.idOt);
                      setModalOpen(true);
                    }}
                  >
                    Gestionar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visibleRows.length && <p className="empty-state">{rows.length ? 'No hay órdenes de trabajo que coincidan con la búsqueda.' : 'No hay órdenes de trabajo disponibles.'}</p>}

      <Modal title="Detalle de orden de trabajo" open={modalOpen} onClose={() => setModalOpen(false)} focusClose>
        {selectedOrder ? (
          <WorkOrderDetail
            key={selectedOrder.idOt}
            order={selectedOrder}
            code={formatWorkOrderCode(selectedOrder)}
            owner={ownerLabel(selectedOrder)}
            ticket={formatWorkOrderTicketCode(selectedOrder, '—')}
            onClose={() => setModalOpen(false)}
          />
        ) : (
          <p className="inline-status">Selecciona una orden de trabajo para gestionarla.</p>
        )}
      </Modal>
    </section>
  );
}
