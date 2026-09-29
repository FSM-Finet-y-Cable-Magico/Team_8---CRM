import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Pencil, Power, ShieldCheck, Wrench } from 'lucide-react';
import {
  api,
  apiErrorMessage,
  CommercialWarranty,
  Customer,
  CustomerService,
  G1EquipmentResponse,
  G1Unit,
  Plan,
} from '../../api';
import { dateInputValue, formatDateOnly, formatWorkOrderValue } from '../../lib';
import { DashboardPermissions } from '../../permissions';
import { Modal, StatusBadge } from '../../shared/components';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import { ContractDocuments } from './ContractDocuments';
import { PlanChangeHistory } from './PlanChangeHistory';

type CustomerContract = NonNullable<Customer['contratos']>[number];

function customerAddress(customer: Customer, service: CustomerService) {
  const serviceAddress = service.direccion?.direccionCompleta?.trim();
  if (serviceAddress) return serviceAddress;
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

function g1Type(unit: G1Unit) {
  if (!unit.tipo_equipo) return '-';
  if (typeof unit.tipo_equipo === 'string') return unit.tipo_equipo;
  return [unit.tipo_equipo.nombre, unit.tipo_equipo.marca, unit.tipo_equipo.modelo].filter(Boolean).join(' · ');
}

function emptyWarrantyForm() {
  const start = dateInputValue(new Date());
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);
  return { tipo: 'Garantía de servicio', fechaInicio: start, fechaTermino: dateInputValue(endDate), cobertura: '', monto: '', observaciones: '', numeroSerieEquipo: '' };
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
  onOpenObservations: (target: { tipoEntidad: string; idEntidad: number; label: string; idCliente?: number; idEmpresa?: number | null }) => void;
}) {
  const { message, showMessage, clearMessage } = useTransientMessage();
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planRevision, setPlanRevision] = useState(0);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [newPlanId, setNewPlanId] = useState('');
  const [fechaEfectiva, setFechaEfectiva] = useState(dateInputValue(new Date()));
  const [planObservation, setPlanObservation] = useState('');
  const [deactivateObservation, setDeactivateObservation] = useState('');
  const [g1Equipment, setG1Equipment] = useState<G1Unit[]>([]);
  const [equipmentStatus, setEquipmentStatus] = useState('');
  const [warranties, setWarranties] = useState<CommercialWarranty[]>([]);
  const [warrantyStatus, setWarrantyStatus] = useState('');
  const [warrantyFormOpen, setWarrantyFormOpen] = useState(false);
  const [warrantyForm, setWarrantyForm] = useState(emptyWarrantyForm());

  const activePlans = useMemo(
    () => plans.filter((plan) => plan.activo !== false && plan.idPlan !== contract.plan?.idPlan && (!contract.idEmpresa || !plan.idEmpresa || plan.idEmpresa === contract.idEmpresa)),
    [plans, contract.idEmpresa, contract.plan?.idPlan],
  );
  const nextPlan = activePlans.find((plan) => plan.idPlan === Number(newPlanId)) ?? null;

  useEffect(() => {
    if (!open) {
      setChangePlanOpen(false);
      setDeactivateOpen(false);
      setWarrantyFormOpen(false);
      setNewPlanId('');
      setPlanObservation('');
      setDeactivateObservation('');
      clearMessage();
      return;
    }
    let active = true;
    setEquipmentStatus('Consultando equipos en G1…');
    setWarrantyStatus('Cargando garantías comerciales…');
    api.get<G1EquipmentResponse<G1Unit[]>>(`/integrations/g1/services/${service.idServicio}/equipment`)
      .then(({ data }) => { if (active) { setG1Equipment(data.data); setEquipmentStatus(data.data.length ? '' : 'G1 no informó equipos para este servicio.'); } })
      .catch((error) => { if (active) { setG1Equipment([]); setEquipmentStatus(apiErrorMessage(error)); } });
    api.get<CommercialWarranty[]>('/commercial-warranties', { params: { idServicio: service.idServicio } })
      .then(({ data }) => { if (active) { setWarranties(data); setWarrantyStatus(''); } })
      .catch((error) => { if (active) { setWarranties([]); setWarrantyStatus(apiErrorMessage(error)); } });
    return () => { active = false; };
  }, [open, service.idServicio, clearMessage]);

  async function reloadWarranties() {
    const { data } = await api.get<CommercialWarranty[]>('/commercial-warranties', { params: { idServicio: service.idServicio } });
    setWarranties(data);
  }

  async function savePlanChange(event: FormEvent) {
    event.preventDefault();
    if (savingPlan || !newPlanId) { if (!newPlanId) showMessage('Selecciona el nuevo plan.'); return; }
    setSavingPlan(true);
    try {
      const { data } = await api.post('/contracts/' + contract.idContrato + '/change-plan', { newPlanId: Number(newPlanId), fechaEfectiva, observaciones: planObservation.trim() || undefined });
      setChangePlanOpen(false); setNewPlanId(''); setPlanObservation('');
      await onRefresh(service.idServicio); setPlanRevision((value) => value + 1);
      showMessage(data.cambioPlan?.estadoCambio === 'Pendiente' ? 'Cambio programado.' : 'Cambio de plan aplicado.');
    } catch (error) { showMessage(apiErrorMessage(error)); } finally { setSavingPlan(false); }
  }

  async function deactivateService(event: FormEvent) {
    event.preventDefault();
    try {
      await api.patch('/services/' + service.idServicio + '/deactivate', { observacion: deactivateObservation.trim() || undefined });
      setDeactivateOpen(false); setDeactivateObservation(''); await onRefresh(service.idServicio); showMessage('Servicio dado de baja.');
    } catch (error) { showMessage(apiErrorMessage(error)); }
  }

  async function createWarranty(event: FormEvent) {
    event.preventDefault();
    try {
      await api.post('/commercial-warranties', {
        idEmpresa: service.idEmpresa ?? undefined,
        idCliente: customer.idCliente,
        idServicio: service.idServicio,
        idContrato: contract.idContrato,
        tipo: warrantyForm.tipo.trim(),
        fechaInicio: warrantyForm.fechaInicio,
        fechaTermino: warrantyForm.fechaTermino,
        cobertura: warrantyForm.cobertura.trim(),
        monto: warrantyForm.monto ? Number(warrantyForm.monto) : undefined,
        observaciones: warrantyForm.observaciones.trim() || undefined,
        numeroSerieEquipo: warrantyForm.numeroSerieEquipo.trim() || undefined,
      });
      await reloadWarranties();
      setWarrantyForm(emptyWarrantyForm());
      setWarrantyFormOpen(false);
      showMessage('Garantía comercial creada.');
    } catch (error) { showMessage(apiErrorMessage(error)); }
  }

  async function deactivateWarranty(idGarantia: number) {
    try {
      await api.patch(`/commercial-warranties/${idGarantia}/deactivate`);
      await reloadWarranties();
      showMessage('Garantía comercial desactivada.');
    } catch (error) { showMessage(apiErrorMessage(error)); }
  }

  const installation = service.instalacion;

  return (
    <Modal title="Gestionar servicio" open={open} onClose={onClose}>
      <div className="customer-service-management">
        {message && <p className="inline-status customer-transient-status">{message}</p>}
        <section className="customer-service-summary">
          <header className="customer-service-summary-header">
            <div><p>Servicio contratado</p><h3>{contract.plan?.nombreComercial ?? 'Plan no registrado'}</h3><span>{companyName(contract, customer)}</span></div>
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
          {permissions.changeCustomerPlan && service.estadoOperativo !== 'Baja' && <button type="button" className="secondary compact" onClick={() => setChangePlanOpen((value) => !value)}><Pencil size={15} /> Modificar plan</button>}
          {permissions.manageServices && service.estadoOperativo !== 'Baja' && <button type="button" className="danger compact" onClick={() => setDeactivateOpen((value) => !value)}><Power size={15} /> Dar de baja servicio</button>}
          {permissions.manageObservations && <button type="button" className="secondary compact" onClick={() => onOpenObservations({ tipoEntidad: 'Servicio', idEntidad: service.idServicio, idCliente: customer.idCliente, idEmpresa: service.idEmpresa, label: 'Servicio ' + service.idServicio })}>Observaciones</button>}
        </div>

        {changePlanOpen && <form className="workflow-grid customer-inline-form" onSubmit={savePlanChange}>
          <label>Nuevo plan<select required value={newPlanId} onChange={(event) => setNewPlanId(event.target.value)}><option value="">Seleccionar plan</option>{activePlans.map((plan) => <option key={plan.idPlan} value={plan.idPlan}>{plan.nombreComercial} - {plan.empresa?.nombre ?? 'Sin empresa'}</option>)}</select></label>
          <label>Fecha efectiva<input type="date" required min={dateInputValue(new Date())} value={fechaEfectiva} onChange={(event) => setFechaEfectiva(event.target.value)} /></label>
          {nextPlan && <p className="customer-inline-summary">{nextPlan.tipoPlan} · {nextPlan.velocidadMbps ? nextPlan.velocidadMbps + ' Mbps' : 'Sin velocidad'} · {formatCurrency(nextPlan.precioMensual)}</p>}
          <label className="customer-inline-form-wide">Observaciones<textarea value={planObservation} onChange={(event) => setPlanObservation(event.target.value)} /></label>
          <div className="button-row"><button type="button" className="secondary" onClick={() => setChangePlanOpen(false)}>Cancelar</button><button type="submit" disabled={savingPlan}>{savingPlan ? 'Guardando…' : 'Guardar cambio'}</button></div>
        </form>}

        {deactivateOpen && <form className="workflow-grid customer-inline-form" onSubmit={deactivateService}>
          <label className="customer-inline-form-wide">Observaciones<textarea value={deactivateObservation} onChange={(event) => setDeactivateObservation(event.target.value)} /></label>
          <div className="button-row"><button type="button" className="secondary" onClick={() => setDeactivateOpen(false)}>Cancelar</button><button type="submit" className="danger">Confirmar baja</button></div>
        </form>}

        {permissions.changeCustomerPlan && <PlanChangeHistory idContrato={contract.idContrato} revision={planRevision} />}
        {permissions.manageContracts && <ContractDocuments idContrato={contract.idContrato} canGenerate={permissions.generateDigitalContract} />}

        <section className="customer-service-history">
          <header><Wrench size={18} /><h3>Información de instalación</h3></header>
          <dl className="customer-readonly-details">
            <div><dt>Técnico instalador</dt><dd>{installation?.tecnico?.nombreCompleto ?? 'No registrado'}</dd></div>
            <div><dt>Fecha instalación</dt><dd>{installation?.fechaCompletada ? formatDateOnly(installation.fechaCompletada) : 'Pendiente'}</dd></div>
            <div><dt>Orden de trabajo</dt><dd>{installation?.codigoSeguimiento ?? (installation ? 'OT #' + installation.idOt : 'Pendiente')}</dd></div>
            <div><dt>MAC comercial</dt><dd>{technicalValue(service, 'macAddress')}</dd></div>
            <div><dt>Puerto OLT</dt><dd>{technicalValue(service, 'puertoOlt')}</dd></div>
            <div><dt>Potencia óptica</dt><dd>{technicalValue(service, 'potenciaOpticaDbm')}</dd></div>
          </dl>
        </section>

        <section className="customer-service-history">
          <header><ClipboardList size={18} /><h3>Equipos instalados</h3><span>Fuente: G1</span></header>
          {equipmentStatus && <p className="inline-status">{equipmentStatus}</p>}
          {g1Equipment.map((unit) => <dl className="customer-readonly-details" key={unit.id_unidad ?? unit.numero_serie}>
            <div><dt>Equipo</dt><dd>{g1Type(unit)}</dd></div>
            <div><dt>Número de serie</dt><dd>{unit.numero_serie}</dd></div>
            <div><dt>Estado físico</dt><dd>{unit.estado}</dd></div>
            <div><dt>Fecha instalación</dt><dd>{unit.fecha_instalacion ? formatDateOnly(unit.fecha_instalacion) : '-'}</dd></div>
            <div><dt>OT G3</dt><dd>{unit.id_ot ?? '-'}</dd></div>
            <div><dt>Garantía física</dt><dd>{unit.garantia?.vigente === true ? 'Vigente' : unit.garantia?.vigente === false ? 'Vencida' : 'Sin dato'}</dd></div>
            <div><dt>Vencimiento físico</dt><dd>{unit.garantia?.fecha_vencimiento ? formatDateOnly(unit.garantia.fecha_vencimiento) : '-'}</dd></div>
          </dl>)}
          <p className="detail-line">La garantía física es de solo lectura y se obtiene desde G1. No se usa la copia local como respaldo.</p>
        </section>

        <section className="customer-service-history">
          <header><ShieldCheck size={18} /><h3>Garantías comerciales / de servicio</h3><span>Fuente: CRM G8</span></header>
          {warrantyStatus && <p className="inline-status">{warrantyStatus}</p>}
          {warranties.map((warranty) => <dl className="customer-readonly-details" key={warranty.idGarantia}>
            <div><dt>Tipo</dt><dd>{warranty.tipo}</dd></div>
            <div><dt>Vigencia</dt><dd>{formatDateOnly(warranty.fechaInicio)} — {formatDateOnly(warranty.fechaTermino)}</dd></div>
            <div><dt>Cobertura</dt><dd>{warranty.cobertura}</dd></div>
            <div><dt>Monto</dt><dd>{formatCurrency(warranty.monto)}</dd></div>
            <div><dt>Serie externa</dt><dd>{warranty.numeroSerieEquipo ?? 'Sin referencia física'}</dd></div>
            <div><dt>Estado</dt><dd>{warranty.estado}</dd></div>
            {permissions.manageCommercialWarranties && warranty.estado === 'ACTIVA' && <div><dt>Acción</dt><dd><button type="button" className="secondary compact" onClick={() => void deactivateWarranty(warranty.idGarantia)}>Desactivar</button></dd></div>}
          </dl>)}
          {!warranties.length && !warrantyStatus && <p className="empty-state">No hay garantías comerciales registradas.</p>}
          {permissions.manageCommercialWarranties && service.estadoOperativo === 'Activo' && <button type="button" className="secondary compact" onClick={() => setWarrantyFormOpen((value) => !value)}>Nueva garantía comercial</button>}
          {warrantyFormOpen && <form className="workflow-grid customer-inline-form" onSubmit={createWarranty}>
            <label>Tipo<input required maxLength={60} value={warrantyForm.tipo} onChange={(event) => setWarrantyForm({ ...warrantyForm, tipo: event.target.value })} /></label>
            <label>Fecha inicio<input required type="date" value={warrantyForm.fechaInicio} onChange={(event) => setWarrantyForm({ ...warrantyForm, fechaInicio: event.target.value })} /></label>
            <label>Fecha término<input required type="date" value={warrantyForm.fechaTermino} onChange={(event) => setWarrantyForm({ ...warrantyForm, fechaTermino: event.target.value })} /></label>
            <label>Monto opcional<input type="number" min="0.01" step="0.01" value={warrantyForm.monto} onChange={(event) => setWarrantyForm({ ...warrantyForm, monto: event.target.value })} /></label>
            <label>Serie G1 opcional<input maxLength={80} value={warrantyForm.numeroSerieEquipo} onChange={(event) => setWarrantyForm({ ...warrantyForm, numeroSerieEquipo: event.target.value })} /></label>
            <label className="customer-inline-form-wide">Cobertura<textarea required value={warrantyForm.cobertura} onChange={(event) => setWarrantyForm({ ...warrantyForm, cobertura: event.target.value })} /></label>
            <label className="customer-inline-form-wide">Observaciones<textarea value={warrantyForm.observaciones} onChange={(event) => setWarrantyForm({ ...warrantyForm, observaciones: event.target.value })} /></label>
            <div className="button-row"><button type="button" className="secondary" onClick={() => setWarrantyFormOpen(false)}>Cancelar</button><button type="submit">Crear garantía</button></div>
          </form>}
        </section>
      </div>
    </Modal>
  );
}
