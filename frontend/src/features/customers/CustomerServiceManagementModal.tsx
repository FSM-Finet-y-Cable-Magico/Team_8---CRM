import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Pencil, Power, Wrench } from 'lucide-react';
import { api, apiErrorMessage, Customer, CustomerService, Plan } from '../../api';
import { dateInputValue, formatDateOnly, formatWorkOrderValue } from '../../lib';
import { DashboardPermissions } from '../../permissions';
import { Modal, StatusBadge } from '../../shared/components';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';

type CustomerContract = NonNullable<Customer['contratos']>[number];

function customerAddress(customer: Customer, service: CustomerService) {
  const serviceAddress = service.direccion?.direccionCompleta?.trim();

  if (serviceAddress) {
    return serviceAddress;
  }

  const primaryAddress = customer.direcciones?.find((address) => address.esPrincipal && address.direccionCompleta?.trim())
    ?? customer.direcciones?.find((address) => address.direccionCompleta?.trim());

  return primaryAddress?.direccionCompleta.trim() ?? 'No registrada';
}

function companyName(contract: CustomerContract, customer: Customer) {
  return contract.plan?.empresa?.nombre ?? customer.empresa?.nombre ?? customer.empresas?.[0] ?? '-';
}

function formatCurrency(value?: string | number | null) {
  const amount = Number(value);
  return Number.isFinite(amount) ? '$' + amount.toLocaleString('es-CL') : '-';
}

function technicalValue(service: CustomerService, key: string) {
  const value = service.datosTecnicos?.[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '-';
}

export function CustomerServiceManagementModal({
  open,
  customer,
  contract,
  service,
  plans,
  permissions,
  onClose,
  onRefresh,
  onOpenObservations,
}: {
  open: boolean;
  customer: Customer;
  contract: CustomerContract;
  service: CustomerService;
  plans: Plan[];
  permissions: DashboardPermissions;
  onClose: () => void;
  onRefresh: (preferredServiceId?: number) => Promise<void>;
  onOpenObservations: (target: {
    tipoEntidad: string;
    idEntidad: number;
    label: string;
    idCliente?: number;
    idEmpresa?: number | null;
  }) => void;
}) {
  const { message, showMessage, clearMessage } = useTransientMessage();
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [newPlanId, setNewPlanId] = useState('');
  const [fechaEfectiva, setFechaEfectiva] = useState(dateInputValue(new Date()));
  const [planObservation, setPlanObservation] = useState('');
  const [deactivateObservation, setDeactivateObservation] = useState('');

  const activePlans = useMemo(
    () => plans.filter((plan) =>
      plan.activo !== false &&
      (!contract.idEmpresa || !plan.idEmpresa || plan.idEmpresa === contract.idEmpresa),
    ),
    [plans, contract.idEmpresa],
  );
  const nextPlan = activePlans.find((plan) => plan.idPlan === Number(newPlanId)) ?? null;

  useEffect(() => {
    if (!open) {
      setChangePlanOpen(false);
      setDeactivateOpen(false);
      setNewPlanId('');
      setPlanObservation('');
      setDeactivateObservation('');
      clearMessage();
    }
  }, [open, clearMessage]);

  async function savePlanChange(event: FormEvent) {
    event.preventDefault();

    if (!newPlanId) {
      showMessage('Selecciona el nuevo plan.');
      return;
    }

    try {
      await api.post('/contracts/' + contract.idContrato + '/change-plan', {
        newPlanId: Number(newPlanId),
        fechaEfectiva,
        observaciones: planObservation.trim() || undefined,
      });
      setChangePlanOpen(false);
      setNewPlanId('');
      setPlanObservation('');
      await onRefresh(service.idServicio);
      showMessage('Cambio de plan registrado.');
    } catch (error) {
      showMessage(apiErrorMessage(error));
    }
  }

  async function deactivateService(event: FormEvent) {
    event.preventDefault();

    try {
      await api.patch('/services/' + service.idServicio + '/deactivate', {
        observacion: deactivateObservation.trim() || undefined,
      });
      setDeactivateOpen(false);
      setDeactivateObservation('');
      await onRefresh(service.idServicio);
      showMessage('Servicio dado de baja.');
    } catch (error) {
      showMessage(apiErrorMessage(error));
    }
  }

  const installation = service.instalacion;
  const equipment = service.equipos ?? [];

  return (
    <Modal title="Gestionar servicio" open={open} onClose={onClose}>
      <div className="customer-service-management">
        {message && <p className="inline-status customer-transient-status">{message}</p>}

        <section className="customer-service-summary">
          <header className="customer-service-summary-header">
            <div>
              <p>Servicio contratado</p>
              <h3>{contract.plan?.nombreComercial ?? 'Plan no registrado'}</h3>
              <span>{companyName(contract, customer)}</span>
            </div>
            <StatusBadge value={formatWorkOrderValue(service.estadoOperativo)} />
          </header>
          <dl className="customer-readonly-details">
            <div><dt>Tipo de servicio</dt><dd>{service.tipoServicio}</dd></div>
            <div><dt>Velocidad</dt><dd>{contract.plan?.velocidadMbps ? contract.plan.velocidadMbps + ' Mbps' : '-'}</dd></div>
            <div><dt>Precio mensual</dt><dd>{formatCurrency(contract.plan?.precioMensual)}</dd></div>
            <div><dt>Fecha contratación</dt><dd>{contract.fechaInicio ? formatDateOnly(contract.fechaInicio) : '-'}</dd></div>
            <div><dt>Dirección</dt><dd>{customerAddress(customer, service)}</dd></div>
            <div><dt>Contrato</dt><dd>#{contract.idContrato}</dd></div>
          </dl>
        </section>

        <div className="customer-service-actions">
          {permissions.changeCustomerPlan && (
            <button type="button" className="secondary compact" onClick={() => setChangePlanOpen((current) => !current)}>
              <Pencil size={15} /> Modificar plan
            </button>
          )}
          {permissions.manageServices && service.estadoOperativo !== 'Baja' && (
            <button type="button" className="danger compact" onClick={() => setDeactivateOpen((current) => !current)}>
              <Power size={15} /> Dar de baja servicio
            </button>
          )}
          {permissions.manageObservations && (
            <button
              type="button"
              className="secondary compact"
              onClick={() => onOpenObservations({
                tipoEntidad: 'Servicio',
                idEntidad: service.idServicio,
                idCliente: customer.idCliente,
                idEmpresa: service.idEmpresa,
                label: 'Servicio ' + service.idServicio,
              })}
            >
              Observaciones
            </button>
          )}
        </div>

        {changePlanOpen && (
          <form className="workflow-grid customer-inline-form" onSubmit={savePlanChange}>
            <label>
              Nuevo plan
              <select required value={newPlanId} onChange={(event) => setNewPlanId(event.target.value)}>
                <option value="">Seleccionar plan</option>
                {activePlans.map((plan) => (
                  <option key={plan.idPlan} value={plan.idPlan}>
                    {plan.nombreComercial} - {plan.empresa?.nombre ?? 'Sin empresa'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha efectiva
              <input type="date" required value={fechaEfectiva} onChange={(event) => setFechaEfectiva(event.target.value)} />
            </label>
            {nextPlan && (
              <p className="customer-inline-summary">
                {nextPlan.tipoPlan} · {nextPlan.velocidadMbps ? nextPlan.velocidadMbps + ' Mbps' : 'Sin velocidad'} · {formatCurrency(nextPlan.precioMensual)}
              </p>
            )}
            <label className="customer-inline-form-wide">
              Observaciones
              <textarea value={planObservation} onChange={(event) => setPlanObservation(event.target.value)} />
            </label>
            <div className="button-row">
              <button type="button" className="secondary" onClick={() => setChangePlanOpen(false)}>Cancelar</button>
              <button type="submit">Guardar cambio</button>
            </div>
          </form>
        )}

        {deactivateOpen && (
          <form className="workflow-grid customer-inline-form" onSubmit={deactivateService}>
            <label className="customer-inline-form-wide">
              Observaciones
              <textarea value={deactivateObservation} onChange={(event) => setDeactivateObservation(event.target.value)} />
            </label>
            <div className="button-row">
              <button type="button" className="secondary" onClick={() => setDeactivateOpen(false)}>Cancelar</button>
              <button type="submit" className="danger">Confirmar baja</button>
            </div>
          </form>
        )}

        <section className="customer-service-history">
          <header>
            <Wrench size={18} />
            <h3>Información de instalación</h3>
          </header>
          <dl className="customer-readonly-details">
            <div><dt>Técnico instalador</dt><dd>{installation?.tecnico?.nombreCompleto ?? 'No registrado'}</dd></div>
            <div><dt>Fecha instalación</dt><dd>{installation?.fechaCompletada ? formatDateOnly(installation.fechaCompletada) : 'Pendiente'}</dd></div>
            <div><dt>Orden de trabajo</dt><dd>{installation?.codigoSeguimiento ?? (installation ? 'OT #' + installation.idOt : 'Pendiente')}</dd></div>
            <div><dt>MAC</dt><dd>{technicalValue(service, 'macAddress')}</dd></div>
            <div><dt>Puerto OLT</dt><dd>{technicalValue(service, 'puertoOlt')}</dd></div>
            <div><dt>Potencia óptica</dt><dd>{technicalValue(service, 'potenciaOpticaDbm')}</dd></div>
          </dl>
        </section>

        <section className="customer-service-history">
          <header>
            <ClipboardList size={18} />
            <h3>Equipo instalado</h3>
          </header>
          {equipment.length ? (
            <div className="customer-equipment-list">
              {equipment.map((unit) => (
                <dl className="customer-readonly-details" key={unit.idUnidad}>
                  <div><dt>Equipo</dt><dd>{unit.modelo ?? 'Modelo no registrado'}</dd></div>
                  <div><dt>Número de serie</dt><dd>{unit.numeroSerie}</dd></div>
                  <div><dt>Modalidad</dt><dd>{unit.modalidadAsignacion ?? 'No registrada'}</dd></div>
                  <div><dt>Estado</dt><dd>{unit.estado}</dd></div>
                  {unit.modalidadAsignacion === 'Arriendo' && (
                    <div><dt>Valor mensual</dt><dd>{formatCurrency(unit.valorArriendoMensual)}</dd></div>
                  )}
                </dl>
              ))}
            </div>
          ) : (
            <p className="empty-state">No hay equipos asociados a este servicio.</p>
          )}
        </section>
      </div>
    </Modal>
  );
}
