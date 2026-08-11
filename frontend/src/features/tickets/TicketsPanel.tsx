import { useEffect, useState } from 'react';
import { api, apiErrorMessage, type Customer, type CustomerService, type Ticket, type TicketCategory, type UserRow } from '../../api';
import { rutPattern } from '../../constants';
import { formatWorkOrderValue, normalizeRutInput } from '../../lib';
import { type DashboardPermissions } from '../../permissions';
import { Modal, StatusBadge } from '../../shared/components';

export function TicketsPanel({
  tickets,
  categories,
  permissions,
  users = [],
  onChanged,
}: {
  tickets: Ticket[];
  categories: TicketCategory[];
  permissions: DashboardPermissions;
  users?: UserRow[];
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState({ rut: '', idCategoria: '', idServicio: '', prioridad: 'Media', descripcion: '' });
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState('Media');
  const [ticketStatus, setTicketStatus] = useState('En progreso');
  const [comment, setComment] = useState('');
  const [diagnosis, setDiagnosis] = useState({
    causaRaiz: '',
    descripcionProblema: '',
    accionesRealizadas: '',
    estadoFinalServicio: 'Activo',
    observaciones: '',
  });
  const [workOrderForm, setWorkOrderForm] = useState({
    tipoOt: 'Reparacion',
    idTecnico: '',
    fechaProgramada: '',
    horaVisita: '',
    prioridad: '',
    observaciones: '',
  });
  const [technicalNote, setTechnicalNote] = useState('');
  const [status, setStatus] = useState('');
  const [customerPreview, setCustomerPreview] = useState<Customer | null>(null);
  const [ticketServices, setTicketServices] = useState<CustomerService[]>([]);
  const [customerLookupStatus, setCustomerLookupStatus] = useState('');
  const [managementOpen, setManagementOpen] = useState(false);

  const selectedTicket = tickets.find((ticket) => ticket.idTicket === selectedId) ?? null;
  const associatedWorkOrder = selectedTicket?.workOrders?.[0] ?? null;
  const hasOpenWorkOrder = Boolean(
    selectedTicket?.hasOpenWorkOrder
      || (associatedWorkOrder && associatedWorkOrder.estado !== 'Completada'),
  );
  const ticketIsClosed = ['Resuelto', 'Cerrado'].includes(selectedTicket?.estado ?? '');
  const directClosureBlocked = hasOpenWorkOrder && ['Resuelto', 'Cerrado'].includes(ticketStatus);

  useEffect(() => {
    if (selectedTicket) {
      setCategoryId(String(selectedTicket.idCategoria));
      setPriority(selectedTicket.prioridad);
      setTicketStatus(selectedTicket.estado);
      setWorkOrderForm({
        tipoOt: 'Reparacion',
        idTecnico: '',
        fechaProgramada: '',
        horaVisita: '',
        prioridad: selectedTicket.prioridad,
        observaciones: '',
      });
      setTechnicalNote('');
    }
  }, [selectedTicket?.idTicket]);

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      setStatus(success);
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function lookupTicketCustomer() {
    const rut = normalizeRutInput(createForm.rut);

    if (!rutPattern.test(rut)) {
      setCustomerPreview(null);
      setTicketServices([]);
      setCustomerLookupStatus('Ingresa un RUT válido para consultar al cliente.');
      return;
    }

    try {
      const { data } = await api.get<Customer>('/customers/search', { params: { term: rut } });
      setCreateForm((current) => ({ ...current, rut }));
      setCustomerPreview(data);
      const servicesResult = await api.get<CustomerService[]>(`/services/customer/${data.idCliente}`);
      setTicketServices(servicesResult.data);
      setCustomerLookupStatus('Cliente encontrado');
    } catch (err) {
      setCustomerPreview(null);
      setTicketServices([]);
      setCustomerLookupStatus(apiErrorMessage(err));
    }
  }

  return (
    <section className="workspace-grid">
      {permissions.createTickets && <form
        className="ticket-create-form stack"
        onSubmit={(event) => {
          event.preventDefault();
          const rut = normalizeRutInput(createForm.rut);

          if (!rutPattern.test(rut)) {
            setStatus('Ingresa el RUT del cliente con guion, por ejemplo 11111111-1.');
            return;
          }

          if (!createForm.idCategoria) {
            setStatus('Selecciona una categoría de falla.');
            return;
          }

          if (createForm.descripcion.trim().length < 10) {
            setStatus('Describe brevemente el problema reportado por el cliente.');
            return;
          }

          void run(
            () =>
              api.post('/tickets', {
                rut,
                idCategoria: Number(createForm.idCategoria),
                idServicio: createForm.idServicio ? Number(createForm.idServicio) : undefined,
                prioridad: createForm.prioridad,
                descripcion: createForm.descripcion.trim(),
              }),
            'Ticket creado',
          );
        }}
      >
        <h2>Registrando ticket de soporte</h2>
        <label>
          RUT cliente
          <input
            value={createForm.rut}
            onChange={(event) => {
              setCreateForm({ ...createForm, rut: event.target.value, idServicio: '' });
              setCustomerPreview(null);
              setTicketServices([]);
              setCustomerLookupStatus('');
            }}
            onBlur={() => {
              if (createForm.rut.trim()) {
                void lookupTicketCustomer();
              }
            }}
            placeholder="11111111-1"
            required
          />
        </label>
        <button type="button" className="secondary" onClick={() => void lookupTicketCustomer()}>
          Buscar datos del cliente
        </button>
        {customerLookupStatus && <p className="inline-status">{customerLookupStatus}</p>}
        {customerPreview && (
          <section className="customer-preview">
            <h3>{customerPreview.nombreCompleto}</h3>
            <p><strong>RUT:</strong> {customerPreview.rut ?? '-'}</p>
            <p><strong>Teléfono:</strong> {customerPreview.telefono ?? '-'}</p>
            <p><strong>Correo:</strong> {customerPreview.email ?? '-'}</p>
            <p><strong>Estado:</strong> {customerPreview.estado}</p>
          </section>
        )}
        {ticketServices.length > 0 && (
          <label>
            Servicio asociado
            <select
              value={createForm.idServicio}
              onChange={(event) => setCreateForm({ ...createForm, idServicio: event.target.value })}
            >
              <option value="">Ticket general del cliente</option>
              {ticketServices.map((service) => (
                <option key={service.idServicio} value={service.idServicio}>
                  Servicio {service.idServicio} - {service.tipoServicio} - {service.estadoOperativo}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Categoría
          <select value={createForm.idCategoria} onChange={(event) => setCreateForm({ ...createForm, idCategoria: event.target.value })}>
            <option value="">Seleccionar</option>
            {categories.map((category) => (
              <option key={category.idCategoria} value={category.idCategoria}>
                {category.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prioridad
          <select value={createForm.prioridad} onChange={(event) => setCreateForm({ ...createForm, prioridad: event.target.value })}>
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>
        </label>
        <label>
          Descripción
          <textarea
            value={createForm.descripcion}
            onChange={(event) => setCreateForm({ ...createForm, descripcion: event.target.value })}
            placeholder="Cliente reporta intermitencia o perdida de servicio"
            required
          />
        </label>
        <button disabled={!createForm.idCategoria}>Crear ticket</button>
        {status && <p className="inline-status">{status}</p>}
      </form>}

      <section className="tickets-list-section">
        <h2>Tickets</h2>
        <div className="table-wrap tickets-table-wrap">
          <table className="tickets-table operational-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Categoría</th>
                <th>Servicio</th>
                <th>OT</th>
                <th className="operational-badge-column">Prioridad</th>
                <th className="operational-badge-column">Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.idTicket}>
                  <td>{ticket.codigoSeguimiento ?? ticket.idTicket}</td>
                  <td>{ticket.cliente?.nombreCompleto ?? '-'}</td>
                  <td>{ticket.categoria?.nombre ?? ticket.idCategoria}</td>
                  <td>{ticket.idServicio ?? '-'}</td>
                  <td>{ticket.workOrders?.[0] ? `#${ticket.workOrders[0].idOt}` : '-'}</td>
                  <td className="operational-badge-column">
                    <StatusBadge value={formatWorkOrderValue(ticket.prioridad)} />
                  </td>
                  <td className="operational-badge-column">
                    <StatusBadge value={formatWorkOrderValue(ticket.estado)} />
                  </td>
                  <td>
                    <button
                      className="secondary compact operational-manage-button"
                      onClick={() => {
                        setSelectedId(ticket.idTicket);
                        setManagementOpen(true);
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

        <Modal title="Gestionar ticket" open={managementOpen} onClose={() => setManagementOpen(false)}>
          {selectedTicket ? (
            <div className="workflow-panel modal-workflow">
              <section className="customer-preview">
                <h3>{selectedTicket.codigoSeguimiento ?? `Ticket ${selectedTicket.idTicket}`}</h3>
                <p><strong>Cliente:</strong> {selectedTicket.cliente?.nombreCompleto ?? '-'}</p>
                <p><strong>Clasificación:</strong> {selectedTicket.categoria?.nombre ?? selectedTicket.idCategoria}</p>
                <p><strong>Prioridad:</strong> <StatusBadge value={formatWorkOrderValue(selectedTicket.prioridad)} /></p>
                <p><strong>Estado:</strong> <StatusBadge value={formatWorkOrderValue(selectedTicket.estado)} /></p>
              </section>
              <section className="history-list full-width-panel">
                <h3>Orden de trabajo asociada</h3>
                {associatedWorkOrder ? (
                  <div className="customer-preview">
                    <p><strong>OT:</strong> #{associatedWorkOrder.idOt}</p>
                    <p><strong>Tipo:</strong> {formatWorkOrderValue(associatedWorkOrder.tipoOt)}</p>
                    <p><strong>Estado:</strong> <StatusBadge value={formatWorkOrderValue(associatedWorkOrder.estado)} /></p>
                    {hasOpenWorkOrder && (
                      <p className="alert">El cierre debe realizarse desde la orden de trabajo asociada.</p>
                    )}
                  </div>
                ) : permissions.classifyTickets && !ticketIsClosed ? (
                  <div className="workflow-grid">
                    <label>
                      Tipo de orden
                      <select
                        value={workOrderForm.tipoOt}
                        onChange={(event) => setWorkOrderForm({ ...workOrderForm, tipoOt: event.target.value })}
                      >
                        <option value="Reparacion">Reparación</option>
                        <option value="Soporte">Soporte</option>
                      </select>
                    </label>
                    {users.length > 0 && (
                      <label>
                        Técnico asignado
                        <select
                          value={workOrderForm.idTecnico}
                          onChange={(event) => setWorkOrderForm({ ...workOrderForm, idTecnico: event.target.value })}
                        >
                          <option value="">Sin asignar</option>
                          {users.map((user) => (
                            <option key={user.idUsuario} value={user.idUsuario}>
                              {user.nombreCompleto}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      Fecha de visita
                      <input
                        type="date"
                        value={workOrderForm.fechaProgramada}
                        onChange={(event) => setWorkOrderForm({ ...workOrderForm, fechaProgramada: event.target.value })}
                      />
                    </label>
                    <label>
                      Hora de visita
                      <input
                        type="time"
                        value={workOrderForm.horaVisita}
                        onChange={(event) => setWorkOrderForm({ ...workOrderForm, horaVisita: event.target.value })}
                      />
                    </label>
                    <label>
                      Prioridad
                      <select
                        value={workOrderForm.prioridad || selectedTicket.prioridad}
                        onChange={(event) => setWorkOrderForm({ ...workOrderForm, prioridad: event.target.value })}
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                    </label>
                    <label>
                      Observaciones para terreno
                      <textarea
                        value={workOrderForm.observaciones}
                        onChange={(event) => setWorkOrderForm({ ...workOrderForm, observaciones: event.target.value })}
                        placeholder="Indicaciones para la visita técnica"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        void run(
                          () => api.post(`/tickets/${selectedTicket.idTicket}/work-order`, {
                            tipoOt: workOrderForm.tipoOt,
                            idTecnico: workOrderForm.idTecnico ? Number(workOrderForm.idTecnico) : undefined,
                            fechaProgramada: workOrderForm.fechaProgramada || undefined,
                            horaVisita: workOrderForm.horaVisita || undefined,
                            prioridad: workOrderForm.prioridad || selectedTicket.prioridad,
                            observaciones: workOrderForm.observaciones.trim() || undefined,
                          }),
                          'Orden de trabajo generada',
                        )
                      }
                    >
                      Generar orden de trabajo
                    </button>
                  </div>
                ) : (
                  <p className="inline-status">Este ticket no requiere una nueva orden de trabajo.</p>
                )}
              </section>
              {(permissions.classifyTickets || permissions.updateTicketStatus || permissions.diagnoseTickets) ? (
                <div className="workflow-grid">
                  {permissions.classifyTickets && <label>
                    Clasificación
                    <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                      {categories.map((category) => (
                        <option key={category.idCategoria} value={category.idCategoria}>
                          {category.nombre}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        void run(
                          () => api.patch(`/tickets/${selectedTicket.idTicket}/category`, { idCategoria: Number(categoryId) }),
                          'Ticket clasificado',
                        )
                      }
                    >
                      Clasificar
                    </button>
                  </label>}

                  {permissions.classifyTickets && <label>
                    Prioridad
                    <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                      <option value="Alta">Alta</option>
                      <option value="Media">Media</option>
                      <option value="Baja">Baja</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        void run(
                          () => api.patch(`/tickets/${selectedTicket.idTicket}/priority`, { prioridad: priority }),
                          'Prioridad actualizada',
                        )
                      }
                    >
                      Actualizar
                    </button>
                  </label>}

                  {permissions.updateTicketStatus && <label>
                    Estado
                    <select value={ticketStatus} onChange={(event) => setTicketStatus(event.target.value)}>
                      {['Abierto', 'En progreso', 'Escalado', 'Resuelto', 'Cerrado'].map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                    <input value={comment} placeholder="Comentario" onChange={(event) => setComment(event.target.value)} />
                    {directClosureBlocked && (
                      <p className="alert">El cierre debe realizarse desde la orden de trabajo asociada.</p>
                    )}
                    <button
                      type="button"
                      disabled={directClosureBlocked}
                      onClick={() =>
                        void run(
                          () => api.patch(`/tickets/${selectedTicket.idTicket}/status`, { estado: ticketStatus, comentario: comment }),
                          'Estado de ticket actualizado',
                        )
                      }
                    >
                      Cambiar estado
                    </button>
                  </label>}

                  {permissions.diagnoseTickets && <label>
                    Diagnóstico técnico
                    <input
                      placeholder="Causa raíz"
                      value={diagnosis.causaRaiz}
                      onChange={(event) => setDiagnosis({ ...diagnosis, causaRaiz: event.target.value })}
                    />
                    <textarea
                      placeholder="Problema detectado"
                      value={diagnosis.descripcionProblema}
                      onChange={(event) => setDiagnosis({ ...diagnosis, descripcionProblema: event.target.value })}
                    />
                    <textarea
                      placeholder="Acciones realizadas"
                      value={diagnosis.accionesRealizadas}
                      onChange={(event) => setDiagnosis({ ...diagnosis, accionesRealizadas: event.target.value })}
                    />
                    <select
                      value={diagnosis.estadoFinalServicio}
                      onChange={(event) => setDiagnosis({ ...diagnosis, estadoFinalServicio: event.target.value })}
                    >
                      <option value="Activo">Activo</option>
                      <option value="En Mantencion">En Mantencion</option>
                    </select>
                    {hasOpenWorkOrder && (
                      <p className="alert">Este ticket tiene una OT pendiente. Registra el cierre desde Órdenes de Trabajo.</p>
                    )}
                    <button
                      type="button"
                      disabled={hasOpenWorkOrder}
                      onClick={() =>
                        void run(
                          () => api.post(`/tickets/${selectedTicket.idTicket}/diagnosis`, diagnosis),
                          'Diagnóstico registrado',
                        )
                      }
                    >
                      Registrar diagnóstico
                    </button>
                  </label>}
                </div>
              ) : (
                <p className="inline-status">No tienes permisos para modificar este ticket.</p>
              )}
              {permissions.registerTechnicalNotes && (
                <section className="history-list full-width-panel">
                  <h3>Observaciones técnicas</h3>
                  {selectedTicket.observacionesTecnicas?.length ? (
                    <ul className="compact-list">
                      {selectedTicket.observacionesTecnicas.map((note) => (
                        <li key={note.metadata}>
                          <strong>{note.metadata}</strong>: {note.texto}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="inline-status">No hay observaciones técnicas registradas.</p>
                  )}
                  <textarea
                    value={technicalNote}
                    onChange={(event) => setTechnicalNote(event.target.value)}
                    placeholder="Agregar observación técnica sin cerrar el ticket"
                  />
                  <button
                    type="button"
                    disabled={technicalNote.trim().length < 3}
                    onClick={() =>
                      void run(
                        () => api.post(`/tickets/${selectedTicket.idTicket}/technical-notes`, { observacion: technicalNote.trim() }),
                        'Observación técnica registrada',
                      ).then(() => setTechnicalNote(''))
                    }
                  >
                    Registrar observación
                  </button>
                </section>
              )}
              {status && <p className="inline-status">{status}</p>}
            </div>
          ) : (
            <p className="inline-status">Selecciona un ticket para gestionarlo.</p>
          )}
        </Modal>
      </section>
    </section>
  );
}
