import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  apiErrorMessage,
  createCommercialEvent,
  getCommercialControl,
  type CommercialControlRow,
  type CreateCommercialEventInput,
  type PaymentZone,
} from '../../api';
import { formatDateOnly, formatDateTime } from '../../lib';
import { type DashboardPermissions } from '../../permissions';
import { Modal, StatusBadge } from '../../shared/components';

const commercialStates = [
  'AL_DIA',
  'POR_VENCER',
  'VENCIDO',
  'MOROSO',
  'AVISO_PAGO_ENVIADO',
  'AVISO_CORTE_ENVIADO',
  'CORTE_PROGRAMADO',
  'CORTADO',
  'RETIRO_PROGRAMADO',
  'RETIRADO',
  'CONVENIO',
  'PRORROGA',
  'REACTIVACION_PENDIENTE',
  'REGULARIZADO',
];

const eventTypes = [
  'AVISO_PAGO',
  'AVISO_CORTE',
  'AVISO_RETIRO',
  'RESPUESTA_CLIENTE',
  'OBSERVACION_COMERCIAL',
];

const eventChannels = ['MANUAL', 'WHATSAPP_COPIABLE', 'LLAMADA', 'CORREO', 'PRESENCIAL', 'SISTEMA'];
const eventStatuses = ['REGISTRADO', 'PENDIENTE', 'ENVIADO', 'RESPONDIDO', 'FALLIDO', 'ANULADO'];

type EventForm = {
  tipoEvento: string;
  canal: string;
  estado: string;
  observacion: string;
  respuestaCliente: string;
  fechaCompromiso: string;
};

const initialEventForm: EventForm = {
  tipoEvento: 'AVISO_PAGO',
  canal: 'MANUAL',
  estado: 'REGISTRADO',
  observacion: '',
  respuestaCliente: '',
  fechaCompromiso: '',
};

export function CommercialControlPanel({
  scope,
  zones,
  permissions,
  onChanged,
}: {
  scope: string;
  zones: PaymentZone[];
  permissions: DashboardPermissions;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<CommercialControlRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    estadoComercial: '',
    zonaPagoId: '',
    periodo: '',
    vencidosOnly: false,
  });
  const [eventTarget, setEventTarget] = useState<CommercialControlRow | null>(null);
  const [eventForm, setEventForm] = useState<EventForm>(initialEventForm);

  useEffect(() => {
    void loadRows();
  }, [scope]);

  const visibleZones = useMemo(
    () => zones.filter((zone) => zone.activo !== false),
    [zones],
  );

  async function loadRows(nextFilters = filters) {
    try {
      setLoading(true);
      setError('');
      const data = await getCommercialControl({
        scope,
        search: nextFilters.search.trim() || undefined,
        estadoComercial: nextFilters.estadoComercial || undefined,
        zonaPagoId: nextFilters.zonaPagoId ? Number(nextFilters.zonaPagoId) : undefined,
        periodo: nextFilters.periodo || undefined,
        vencidosOnly: nextFilters.vencidosOnly || undefined,
      });
      setRows(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function openEventModal(row: CommercialControlRow, type: string) {
    setEventTarget(row);
    setEventForm({
      ...initialEventForm,
      tipoEvento: type,
      canal: type.startsWith('AVISO_') ? 'MANUAL' : 'MANUAL',
      estado: type === 'RESPUESTA_CLIENTE' ? 'RESPONDIDO' : 'REGISTRADO',
    });
  }

  async function submitEvent(event: FormEvent) {
    event.preventDefault();

    if (!eventTarget) {
      return;
    }

    try {
      setStatus('');
      setError('');
      const payload: CreateCommercialEventInput = {
        idCliente: eventTarget.idCliente,
        idContrato: eventTarget.idContrato,
        idFactura: eventTarget.idFactura,
        idServicio: eventTarget.idServicio ?? undefined,
        tipoEvento: eventForm.tipoEvento,
        canal: eventForm.canal,
        estado: eventForm.estado,
        observacion: eventForm.observacion.trim() || undefined,
        respuestaCliente: eventForm.respuestaCliente.trim() || undefined,
        fechaCompromiso: eventForm.fechaCompromiso || undefined,
      };

      await createCommercialEvent(payload);
      setStatus('Gestión comercial registrada');
      setEventTarget(null);
      await loadRows();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  function submitFilters(event: FormEvent) {
    event.preventDefault();
    void loadRows();
  }

  function clearFilters() {
    const nextFilters = {
      search: '',
      estadoComercial: '',
      zonaPagoId: '',
      periodo: '',
      vencidosOnly: false,
    };
    setFilters(nextFilters);
    void loadRows(nextFilters);
  }

  return (
    <section className="panel stack">
      <div className="section-heading">
        <h2>Libro Control Comercial</h2>
        <p>Vista calculada desde facturas, pagos, contratos, servicios y gestiones comerciales registradas.</p>
      </div>

      <form className="filters-row" onSubmit={submitFilters}>
        <input
          placeholder="Buscar cliente, RUT o teléfono"
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
        />
        <select
          value={filters.estadoComercial}
          onChange={(event) => setFilters({ ...filters, estadoComercial: event.target.value })}
        >
          <option value="">Todos los estados</option>
          {commercialStates.map((state) => (
            <option key={state} value={state}>{formatCommercialLabel(state)}</option>
          ))}
        </select>
        <select
          value={filters.zonaPagoId}
          onChange={(event) => setFilters({ ...filters, zonaPagoId: event.target.value })}
        >
          <option value="">Todas las zonas</option>
          {visibleZones.map((zone) => (
            <option key={zone.idZonaPago} value={zone.idZonaPago}>{zone.nombreZona}</option>
          ))}
        </select>
        <input
          type="month"
          value={filters.periodo}
          onChange={(event) => setFilters({ ...filters, periodo: event.target.value })}
        />
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={filters.vencidosOnly}
            onChange={(event) => setFilters({ ...filters, vencidosOnly: event.target.checked })}
          />
          Solo vencidos
        </label>
        <div className="button-row">
          <button type="submit" className="secondary">Filtrar</button>
          <button type="button" className="ghost" onClick={clearFilters}>Limpiar</button>
        </div>
      </form>

      {status && <p className="inline-status">{status}</p>}
      {error && <p className="inline-status error">{error}</p>}
      {loading && <p className="empty-state">Cargando Libro Control Comercial...</p>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>RUT</th>
                <th>Empresa</th>
                <th>Plan</th>
                <th>Zona</th>
                <th>Vencimiento</th>
                <th>Días atraso</th>
                <th>Monto</th>
                <th>Pagado</th>
                <th>Saldo</th>
                <th>Estado comercial</th>
                <th>Última gestión</th>
                <th>Acción sugerida</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.idFactura}-${row.idServicio ?? 'sin-servicio'}`}>
                  <td>
                    <strong>{row.clienteNombre}</strong>
                    <small>{row.telefono ?? row.email ?? '-'}</small>
                  </td>
                  <td>{row.rut ?? '-'}</td>
                  <td>{row.empresa ?? '-'}</td>
                  <td>{row.plan ?? '-'}</td>
                  <td>{row.zonaPago ?? '-'}</td>
                  <td>{formatDateOnly(row.fechaVencimiento)}</td>
                  <td>{row.diasAtraso}</td>
                  <td>{formatMoney(row.montoFacturado)}</td>
                  <td>{formatMoney(row.montoPagado)}</td>
                  <td>{formatMoney(row.saldoPendiente)}</td>
                  <td><StatusBadge value={formatCommercialLabel(row.estadoComercial)} /></td>
                  <td>
                    {row.ultimoEventoTipo ? (
                      <>
                        <strong>{formatCommercialLabel(row.ultimoEventoTipo)}</strong>
                        <small>{formatDateTime(row.ultimoEventoFecha)} {row.ultimoEventoResponsable ? `- ${row.ultimoEventoResponsable}` : ''}</small>
                      </>
                    ) : '-'}
                  </td>
                  <td>{row.accionSugerida}</td>
                  <td>
                    {permissions.manageBilling ? (
                      <div className="table-actions">
                        <button
                          className="secondary compact"
                          type="button"
                          disabled={!row.puedeEnviarAvisoPago}
                          onClick={() => openEventModal(row, 'AVISO_PAGO')}
                        >
                          Aviso pago
                        </button>
                        <button
                          className="secondary compact"
                          type="button"
                          disabled={!row.puedeEnviarAvisoCorte}
                          onClick={() => openEventModal(row, 'AVISO_CORTE')}
                        >
                          Aviso corte
                        </button>
                        <button
                          className="secondary compact"
                          type="button"
                          disabled={!row.puedeRegistrarRetiro}
                          onClick={() => openEventModal(row, 'AVISO_RETIRO')}
                        >
                          Aviso retiro
                        </button>
                        <button
                          className="secondary compact"
                          type="button"
                          onClick={() => openEventModal(row, 'RESPUESTA_CLIENTE')}
                        >
                          Respuesta/obs.
                        </button>
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !rows.length && !error && (
        <p className="empty-state">No hay registros comerciales para los filtros seleccionados.</p>
      )}

      <Modal title="Registrar gestión comercial" open={Boolean(eventTarget)} onClose={() => setEventTarget(null)}>
        {eventTarget && (
          <form className="stack" onSubmit={submitEvent}>
            <section className="customer-preview">
              <h3>{eventTarget.clienteNombre}</h3>
              <p><strong>Factura:</strong> {eventTarget.idFactura}</p>
              <p><strong>Saldo:</strong> {formatMoney(eventTarget.saldoPendiente)}</p>
              <p><strong>Estado comercial:</strong> {formatCommercialLabel(eventTarget.estadoComercial)}</p>
            </section>
            <label>
              Tipo de gestión
              <select
                value={eventForm.tipoEvento}
                onChange={(event) => setEventForm({ ...eventForm, tipoEvento: event.target.value })}
              >
                {eventTypes.map((type) => (
                  <option key={type} value={type}>{formatCommercialLabel(type)}</option>
                ))}
              </select>
            </label>
            <label>
              Canal
              <select
                value={eventForm.canal}
                onChange={(event) => setEventForm({ ...eventForm, canal: event.target.value })}
              >
                {eventChannels.map((channel) => (
                  <option key={channel} value={channel}>{formatCommercialLabel(channel)}</option>
                ))}
              </select>
            </label>
            <label>
              Estado
              <select
                value={eventForm.estado}
                onChange={(event) => setEventForm({ ...eventForm, estado: event.target.value })}
              >
                {eventStatuses.map((state) => (
                  <option key={state} value={state}>{formatCommercialLabel(state)}</option>
                ))}
              </select>
            </label>
            <label>
              Observación
              <textarea
                value={eventForm.observacion}
                onChange={(event) => setEventForm({ ...eventForm, observacion: event.target.value })}
                placeholder="Detalle de la gestión realizada"
              />
            </label>
            <label>
              Respuesta cliente
              <textarea
                value={eventForm.respuestaCliente}
                onChange={(event) => setEventForm({ ...eventForm, respuestaCliente: event.target.value })}
                placeholder="Registrar respuesta si existe"
              />
            </label>
            <label>
              Fecha compromiso
              <input
                type="date"
                value={eventForm.fechaCompromiso}
                onChange={(event) => setEventForm({ ...eventForm, fechaCompromiso: event.target.value })}
              />
            </label>
            <button type="submit">Registrar gestión</button>
          </form>
        )}
      </Modal>
    </section>
  );
}

function formatMoney(value: number) {
  return `$${value.toLocaleString('es-CL')}`;
}

function formatCommercialLabel(value: string) {
  const labels: Record<string, string> = {
    AL_DIA: 'Al día',
    POR_VENCER: 'Por vencer',
    VENCIDO: 'Vencido',
    MOROSO: 'Moroso',
    AVISO_PAGO_ENVIADO: 'Aviso pago enviado',
    AVISO_CORTE_ENVIADO: 'Aviso corte enviado',
    CORTE_PROGRAMADO: 'Corte programado',
    CORTADO: 'Cortado',
    RETIRO_PROGRAMADO: 'Retiro programado',
    RETIRADO: 'Retirado',
    CONVENIO: 'Convenio',
    PRORROGA: 'Prórroga',
    REACTIVACION_PENDIENTE: 'Reactivación pendiente',
    REGULARIZADO: 'Regularizado',
    AVISO_PAGO: 'Aviso pago',
    AVISO_CORTE: 'Aviso corte',
    AVISO_RETIRO: 'Aviso retiro',
    RESPUESTA_CLIENTE: 'Respuesta cliente',
    OBSERVACION_COMERCIAL: 'Observación comercial',
    MANUAL: 'Manual',
    WHATSAPP_COPIABLE: 'WhatsApp copiable',
    LLAMADA: 'Llamada',
    CORREO: 'Correo',
    PRESENCIAL: 'Presencial',
    SISTEMA: 'Sistema',
    REGISTRADO: 'Registrado',
    PENDIENTE: 'Pendiente',
    ENVIADO: 'Enviado',
    RESPONDIDO: 'Respondido',
    FALLIDO: 'Fallido',
    ANULADO: 'Anulado',
  };

  return labels[value] ?? value.split('_').join(' ').toLowerCase();
}
