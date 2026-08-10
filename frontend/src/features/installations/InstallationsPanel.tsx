import { useEffect, useMemo, useState } from 'react';
import { type Prospect, type WorkOrder } from '../../api';
import { formatDateOnly } from '../../lib';
import { Modal } from '../../shared/components';
import { InstallOrderForm } from './InstallOrderForm';

export function InstallationsPanel({
  prospects,
  workOrders,
  focusedProspectId,
  onFocusConsumed,
  onChanged,
}: {
  prospects: Prospect[];
  workOrders: WorkOrder[];
  focusedProspectId: number | null;
  onFocusConsumed: () => void;
  onChanged: () => void;
}) {
  const installationProspects = useMemo(
    () => prospects.filter((prospect) =>
      prospect.estadoPipeline === 'Aceptado' && Boolean(prospect.idCliente),
    ),
    [prospects],
  );
  const installationOrders = useMemo(
    () => workOrders.filter((order) => order.tipoOt === 'Instalacion'),
    [workOrders],
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const selectedProspect = installationProspects.find((prospect) => prospect.idProspecto === selectedId) ?? null;
  const prospectByCustomerCompany = useMemo(() => {
    const map = new Map<string, Prospect>();

    for (const prospect of prospects) {
      if (prospect.idCliente && prospect.empresa?.idEmpresa) {
        map.set(`${prospect.idCliente}:${prospect.empresa.idEmpresa}`, prospect);
      }
    }

    return map;
  }, [prospects]);

  useEffect(() => {
    if (!focusedProspectId) {
      return;
    }

    const focused = installationProspects.find((prospect) => prospect.idProspecto === focusedProspectId);

    if (focused) {
      setSelectedId(focused.idProspecto);
      setModalOpen(true);
    }

    onFocusConsumed();
  }, [focusedProspectId, installationProspects, onFocusConsumed]);

  function openInstallModal(idProspecto: number) {
    setSelectedId(idProspecto);
    setModalOpen(true);
  }

  return (
    <section className="workspace-grid">
      <section className="panel">
        <h2>Prospectos listos para instalación</h2>
        <p className="detail-line">Agenda instalaciones para prospectos aceptados y con plan contratado.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>RUT</th>
                <th>Prospecto</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {installationProspects.map((prospect) => (
                <tr key={prospect.idProspecto}>
                  <td>{prospect.rut ?? '-'}</td>
                  <td>{prospect.nombreCompleto ?? '-'}</td>
                  <td>{prospect.estadoPipeline ?? '-'}</td>
                  <td>
                    <button className="secondary compact" onClick={() => openInstallModal(prospect.idProspecto)}>
                      Agendar instalación
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!installationProspects.length && (
          <p className="inline-status">No hay prospectos habilitados para generar una orden de instalación.</p>
        )}
      </section>

      <section className="panel">
        <h2>Agenda de instalaciones</h2>
        <p className="detail-line">Visitas de instalación generadas y conectadas con órdenes de trabajo.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Orden</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Técnico</th>
                <th>Prioridad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {installationOrders.map((order) => {
                const relatedProspect = prospectByCustomerCompany.get(`${order.idCliente}:${order.idEmpresa}`);

                return (
                  <tr key={order.idOt}>
                    <td>{order.idOt}</td>
                    <td>{relatedProspect?.nombreCompleto ?? `Cliente ${order.idCliente ?? '-'}`}</td>
                    <td>{formatDateOnly(order.fechaProgramada)}</td>
                    <td>{order.horaVisita ?? '-'}</td>
                    <td>{order.tecnico?.nombreCompleto ?? '-'}</td>
                    <td>{order.prioridad}</td>
                    <td>{order.estado}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!installationOrders.length && (
          <p className="inline-status">No hay instalaciones agendadas.</p>
        )}
      </section>

      <Modal title="Generar instalación" open={modalOpen} onClose={() => setModalOpen(false)}>
        {selectedProspect ? (
          <InstallOrderForm
            prospect={selectedProspect}
            onChanged={() => {
              setModalOpen(false);
              onChanged();
            }}
          />
        ) : (
          <p className="inline-status">Selecciona un prospecto aceptado para agendar la instalación.</p>
        )}
      </Modal>
    </section>
  );
}
