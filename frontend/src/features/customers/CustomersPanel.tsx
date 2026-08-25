import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart3, Boxes, ChevronDown, CircleCheckBig, Router, Ticket as TicketIcon, UserCog, Users, Wifi } from 'lucide-react';
import {
  api,
  apiErrorMessage,
  Customer,
  CustomerRequest,
  CustomerService,
  DigitalContract,
  InstallAvailability,
  MonitoringStatus,
  OperationalObservation,
  PaymentZone,
  Plan,
  TvipCredentialSummary,
  TvipGenerationResult,
} from '../../api';
import { captureOriginOptions, equipmentModeOptions, serviceStatusOptions, serviceTypeOptions } from '../../constants';
import {
  addYearsToInputDate,
  dateInputValue,
  emptyServiceForm,
  formatConnectionType,
  formatDateOnly,
  formatDateTime,
  formatWorkOrderValue,
  normalizeWorkOrderValue,
  normalizeRutInput,
  technicalEntries,
} from '../../lib';
import { DashboardPermissions } from '../../permissions';
import { HistoryBox, Modal, MonitoringStatusView, StatusBadge, TablePagination } from '../../shared/components';
import { ObservationsModal } from '../observations';
import { CustomerContractWorkflow } from './CustomerContractWorkflow';

type CustomerHistory = {
  contratos: Array<{ idContrato: number; estado: string | null; plan?: Plan | null }>;
  servicios: CustomerService[];
  tickets: Array<{ idTicket: number; estado: string; prioridad: string; descripcion: string | null }>;
  ordenes: Array<{ idOt: number; tipoOt: string; estado: string; observaciones: string | null }>;
  equipos: Array<{ idUnidad: number; numeroSerie: string; estado: string; modelo: string | null }>;
  solicitudes?: CustomerRequest[];
  observaciones?: OperationalObservation[];
  cambiosPlan?: Array<{
    idCambioPlan: number;
    idContrato: number;
    motivo: string;
    fechaRegistro: string | null;
    planAnterior?: Plan | null;
    planNuevo?: Plan | null;
  }>;
  contratosDigitales?: DigitalContract[];
  auditoria: Array<{ idLog: string; accion: string; fechaHora: string | null }>;
};
type CustomerServiceWorkOrder = NonNullable<CustomerService['ordenes']>[number];

const CLOSED_INSTALL_ORDER_STATES = ['completada', 'cancelada'];

function emptyServiceInstallOrderForm() {
  return {
    tipoConexion: '',
    fechaProgramada: '',
    horaVisita: '',
    prioridad: 'Media',
    observaciones: '',
  };
}

function normalizeServiceStatus(value?: string | null) {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase('es-CL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isPendingInstallationService(service?: CustomerService | null) {
  const normalized = normalizeServiceStatus(service?.estadoOperativo);

  return normalized === 'pendiente' || (normalized.includes('pendiente') && normalized.includes('instalacion'));
}

function isOpenInstallOrder(order: CustomerServiceWorkOrder) {
  return normalizeWorkOrderValue(order.tipoOt) === 'instalacion' &&
    !CLOSED_INSTALL_ORDER_STATES.includes(normalizeWorkOrderValue(order.estado));
}

function formatServiceWorkOrderCode(order?: CustomerServiceWorkOrder | null) {
  const code = order?.codigoSeguimiento?.trim();

  if (code) {
    return code;
  }

  return order ? `OT-INS-${String(order.idOt).padStart(6, '0')}` : '-';
}

function customerAddressLabel(customer: Customer) {
  const technicalAddress = customer.datosTecnicos?.direccion;

  if (typeof technicalAddress === 'string' && technicalAddress.trim()) {
    return technicalAddress.trim();
  }

  return customer.direcciones?.find((address) => address.direccionCompleta?.trim())?.direccionCompleta.trim()
    ?? 'No registrada';
}

export function CustomersPanel({
  customers,
  plans,
  scope,
  permissions,
  onChanged,
}: {
  customers: Customer[];
  plans: Plan[];
  scope: string;
  permissions: DashboardPermissions;
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusValue, setStatusValue] = useState('Activo');
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [status, setStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [services, setServices] = useState<CustomerService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [serviceCreateForm, setServiceCreateForm] = useState(emptyServiceForm());
  const [serviceUpdateForm, setServiceUpdateForm] = useState(emptyServiceForm());
  const [equipmentForm, setEquipmentForm] = useState({
    numeroSerie: '',
    modelo: '',
    macAddress: '',
    puertoOlt: '',
    observaciones: '',
    modalidadAsignacion: 'Propiedad empresa',
    valorArriendoMensual: '',
    fechaInicioAsignacion: '',
  });
  const [paymentZones, setPaymentZones] = useState<PaymentZone[]>([]);
  const [customerTechnicalForm, setCustomerTechnicalForm] = useState({
    tecnologiaPrincipal: '',
    nodoPrincipal: '',
    cajaNapPrincipal: '',
    numeroPoste: '',
    ipReferencia: '',
    observacionesTecnicas: '',
  });
  const [requestForm, setRequestForm] = useState({
    tipoSolicitud: 'Cambio de plan',
    canalOrigen: 'CRM',
    estado: 'Abierta',
    factible: '',
    motivoNoFactible: '',
    descripcion: '',
    observaciones: '',
  });
  const [changePlanForm, setChangePlanForm] = useState({
    newPlanId: '',
    fechaEfectiva: dateInputValue(new Date()),
    motivo: '',
    observaciones: '',
  });
  const [observationTarget, setObservationTarget] = useState<{
    tipoEntidad: string;
    idEntidad: number;
    label: string;
    idCliente?: number;
    idEmpresa?: number | null;
  } | null>(null);
  const [managementOpen, setManagementOpen] = useState(false);
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus | null>(null);
  const [serviceMonitoringStatus, setServiceMonitoringStatus] = useState<MonitoringStatus | null>(null);
  const [tvipCredentials, setTvipCredentials] = useState<TvipCredentialSummary[]>([]);
  const [tvipTempPassword, setTvipTempPassword] = useState<{ idContrato: number; usuario: string | null; password: string } | null>(null);
  const [installOrderForm, setInstallOrderForm] = useState(emptyServiceInstallOrderForm());
  const [installAvailability, setInstallAvailability] = useState<InstallAvailability | null>(null);
  const [installTechnicianId, setInstallTechnicianId] = useState('');
  const [installOrderStatus, setInstallOrderStatus] = useState('');
  const [installOrderError, setInstallOrderError] = useState('');
  const [page, setPage] = useState(1);
  const [customerStatusFilter, setCustomerStatusFilter] = useState('');

  const normalizedSearchTerm = normalizeWorkOrderValue(searchTerm);
  const customerList = customers.filter((customer) => {
    if (!normalizedSearchTerm) {
      return true;
    }

    return [
      customer.rut,
      customer.nombreCompleto,
      customer.telefono,
      customer.email,
      ...((customer.contratos ?? []).map((contract) => String(contract.idContrato))),
    ].some((value) => normalizeWorkOrderValue(value).includes(normalizedSearchTerm));
  });
  const customerStatusOptions = [...new Set(customerList.map((customer) => normalizeWorkOrderValue(customer.estado)).filter(Boolean))].sort();
  const visibleCustomers = customerStatusFilter
    ? customerList.filter((customer) => normalizeWorkOrderValue(customer.estado) === customerStatusFilter)
    : customerList;
  const pageSize = 20;
  const paginatedCustomers = visibleCustomers.slice((page - 1) * pageSize, page * pageSize);
  const selectedCustomer = visibleCustomers.find((customer) => customer.idCliente === selectedId) ?? null;
  const selectedService =
    services.find((service) => service.idServicio === selectedServiceId) ?? services[0] ?? null;
  const today = dateInputValue(new Date());
  const latestInstallDate = addYearsToInputDate(today, 1);
  const selectedServiceInstallOrders = useMemo(
    () => (selectedService?.ordenes ?? []).filter((order) => normalizeWorkOrderValue(order.tipoOt) === 'instalacion'),
    [selectedService?.idServicio, selectedService?.ordenes],
  );
  const selectedServicePendingInstallOrder =
    selectedServiceInstallOrders.find((order) => isOpenInstallOrder(order)) ?? null;
  const selectedServiceCanGenerateInstallOrder =
    permissions.createInstallOrders &&
    Boolean(selectedService) &&
    isPendingInstallationService(selectedService) &&
    !selectedServicePendingInstallOrder;
  const contractOptions = selectedCustomer?.contratos ?? [];
  const customerCompanyId = scope !== 'consolidado'
    ? Number(scope)
    : selectedCustomer?.idEmpresa ?? contractOptions[0]?.idEmpresa ?? undefined;

  useEffect(() => {
    if (selectedCustomer) {
      setStatusValue(selectedCustomer.estado);
      setHistory(null);
      setServices([]);
      setSelectedServiceId(null);
      setServiceCreateForm({
        ...emptyServiceForm(),
        idContrato: selectedCustomer.contratos?.[0] ? String(selectedCustomer.contratos[0].idContrato) : '',
      });
      setCustomerTechnicalForm({
        tecnologiaPrincipal: String(selectedCustomer.datosTecnicos?.tecnologiaPrincipal ?? ''),
        nodoPrincipal: String(selectedCustomer.datosTecnicos?.nodoPrincipal ?? ''),
        cajaNapPrincipal: String(selectedCustomer.datosTecnicos?.cajaNapPrincipal ?? ''),
        numeroPoste: String(selectedCustomer.datosTecnicos?.numeroPoste ?? ''),
        ipReferencia: String(selectedCustomer.datosTecnicos?.ipReferencia ?? ''),
        observacionesTecnicas: String(selectedCustomer.datosTecnicos?.observacionesTecnicas ?? ''),
      });
      void loadServicesForCustomer(selectedCustomer.idCliente, true);
      if (permissions.viewMonitoring) {
        void loadCustomerMonitoring(selectedCustomer.idCliente, true);
      }
      if (permissions.manageTvip) {
        void loadCustomerTvip(selectedCustomer.idCliente, true);
      }
    }
  }, [selectedCustomer?.idCliente]);

  useEffect(() => {
    if (!selectedService) {
      setServiceUpdateForm(emptyServiceForm());
      setInstallOrderForm(emptyServiceInstallOrderForm());
      setInstallAvailability(null);
      setInstallTechnicianId('');
      setInstallOrderStatus('');
      setInstallOrderError('');
      return;
    }

    if (permissions.viewMonitoring) {
      void loadServiceMonitoring(selectedService.idServicio, true);
    }

    const technicalData = selectedService.datosTecnicos ?? {};

    setServiceUpdateForm({
      idContrato: selectedService.idContrato ? String(selectedService.idContrato) : '',
      idZonaPago: selectedService.idZonaPago ? String(selectedService.idZonaPago) : '',
      tipoServicio: selectedService.tipoServicio,
      estadoOperativo: selectedService.estadoOperativo,
      observaciones: selectedService.observaciones ?? '',
      tecnologia: String(technicalData.tecnologia ?? ''),
      velocidad: String(technicalData.velocidad ?? technicalData.velocidadMbps ?? ''),
      macAddress: String(technicalData.macAddress ?? ''),
      puertoOlt: String(technicalData.puertoOlt ?? ''),
      ipAsignada: String(technicalData.ipAsignada ?? ''),
      observacionesTecnicas: String(technicalData.observacionesTecnicas ?? ''),
      cajaNap: String(technicalData.cajaNap ?? ''),
      numeroPoste: String(technicalData.numeroPoste ?? ''),
      caracteristicasComerciales: String(technicalData.caracteristicasComerciales ?? ''),
    });
    setInstallOrderForm(emptyServiceInstallOrderForm());
    setInstallAvailability(null);
    setInstallTechnicianId('');
    setInstallOrderStatus('');
    setInstallOrderError('');
  }, [selectedService?.idServicio]);

  useEffect(() => {
    setSearchTerm('');
    void loadPaymentZones(true);
  }, [scope]);

  useEffect(() => { setPage(1); }, [customers.length, searchTerm, customerStatusFilter]);

  function openCustomerManagement(customerId: number) {
    setSelectedId(customerId);
    setManagementOpen(true);
    setStatus('');
  }

  function customerCompanyLabel(customer: Customer) {
    return customer.empresas?.join(', ') || customer.empresa?.nombre || '-';
  }

  function customerMainPlan(customer: Customer) {
    return customer.contratos?.find((contract) => contract.plan)?.plan?.nombreComercial ?? '-';
  }

  async function updateCustomerStatus() {
    if (!selectedCustomer) {
      return;
    }

    try {
      const { data } = await api.patch<Customer>(`/customers/${selectedCustomer.idCliente}/status`, { estado: statusValue });
      setStatusValue(data.estado);
      setStatus('Estado del cliente actualizado');
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function loadHistory() {
    if (!selectedCustomer) {
      return;
    }

    try {
      const { data } = await api.get<CustomerHistory>(`/customers/${selectedCustomer.idCliente}/history`);
      setHistory(data);
      setStatus('Historial cargado');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function loadPaymentZones(silent = false) {
    try {
      const { data } = await api.get<PaymentZone[]>('/billing/zones', { params: { scope } });
      setPaymentZones(data);
    } catch (err) {
      setPaymentZones([]);
      if (!silent) {
        setStatus(apiErrorMessage(err));
      }
    }
  }

  async function updateCustomerTechnicalData(event: FormEvent) {
    event.preventDefault();

    if (!selectedCustomer) {
      return;
    }

    try {
      await api.patch(`/customers/${selectedCustomer.idCliente}/technical-data`, {
        tecnologiaPrincipal: customerTechnicalForm.tecnologiaPrincipal.trim() || undefined,
        nodoPrincipal: customerTechnicalForm.nodoPrincipal.trim() || undefined,
        cajaNapPrincipal: customerTechnicalForm.cajaNapPrincipal.trim() || undefined,
        numeroPoste: customerTechnicalForm.numeroPoste.trim() || undefined,
        ipReferencia: customerTechnicalForm.ipReferencia.trim() || undefined,
        observacionesTecnicas: customerTechnicalForm.observacionesTecnicas.trim() || undefined,
      });
      setStatus('Datos técnicos del cliente actualizados');
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function createCustomerRequest(event: FormEvent) {
    event.preventDefault();

    if (!selectedCustomer) {
      return;
    }

    try {
      await api.post<CustomerRequest>('/requests', {
        idCliente: selectedCustomer.idCliente,
        idServicio: selectedService?.idServicio,
        idEmpresa: customerCompanyId,
        tipoSolicitud: requestForm.tipoSolicitud.trim(),
        canalOrigen: requestForm.canalOrigen,
        estado: requestForm.estado,
        factible: requestForm.factible === '' ? undefined : requestForm.factible === 'true',
        motivoNoFactible: requestForm.motivoNoFactible.trim() || undefined,
        descripcion: requestForm.descripcion.trim() || undefined,
        observaciones: requestForm.observaciones.trim() || undefined,
      });
      setRequestForm({
        tipoSolicitud: 'Cambio de plan',
        canalOrigen: 'CRM',
        estado: 'Abierta',
        factible: '',
        motivoNoFactible: '',
        descripcion: '',
        observaciones: '',
      });
      await loadHistory();
      await loadServicesForCustomer(selectedCustomer.idCliente, true, selectedService?.idServicio);
      setStatus('Solicitud registrada en el historial del cliente');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function changeServicePlan(event: FormEvent) {
    event.preventDefault();

    if (!selectedService?.idContrato || !selectedCustomer) {
      setStatus('Selecciona un servicio con contrato asociado.');
      return;
    }

    try {
      await api.post(`/contracts/${selectedService.idContrato}/change-plan`, {
        newPlanId: Number(changePlanForm.newPlanId),
        fechaEfectiva: changePlanForm.fechaEfectiva,
        motivo: changePlanForm.motivo.trim(),
        observaciones: changePlanForm.observaciones.trim() || undefined,
      });
      setChangePlanForm({ newPlanId: '', fechaEfectiva: dateInputValue(new Date()), motivo: '', observaciones: '' });
      await loadServicesForCustomer(selectedCustomer.idCliente, true, selectedService.idServicio);
      await loadHistory();
      setStatus('Cambio de plan registrado con historial');
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function generateDigitalContract(idContrato: number) {
    try {
      await api.post<DigitalContract>(`/contracts/${idContrato}/digital-contract`);
      await loadHistory();
      setStatus('Contrato digital generado con hash de integridad');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function downloadDigitalContract(idContrato: number) {
    try {
      const { data } = await api.get<Blob>(`/contracts/${idContrato}/digital-contract/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus('Contrato digital abierto para revisión');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function loadServicesForCustomer(idCliente: number, silent = false, preferredServiceId?: number) {
    try {
      const { data } = await api.get<CustomerService[]>(`/services/customer/${idCliente}`);
      setServices(data);
      setSelectedServiceId(preferredServiceId ?? data[0]?.idServicio ?? null);

      if (!silent) {
        setStatus(data.length ? 'Servicios contratados cargados' : 'El cliente no tiene servicios registrados');
      }
    } catch (err) {
      setServices([]);
      setSelectedServiceId(null);
      setStatus(apiErrorMessage(err));
    }
  }


  async function loadCustomerMonitoring(idCliente = selectedCustomer?.idCliente, silent = false) {
    if (!idCliente) {
      return;
    }

    try {
      const { data } = await api.get<MonitoringStatus>(`/monitoring/customers/${idCliente}/status`);
      setMonitoringStatus(data);
      if (!silent) {
        setStatus('Monitoreo del cliente actualizado');
      }
    } catch (err) {
      setMonitoringStatus(null);
      if (!silent) {
        setStatus(apiErrorMessage(err));
      }
    }
  }

  async function loadServiceMonitoring(idServicio = selectedService?.idServicio, silent = false) {
    if (!idServicio) {
      return;
    }

    try {
      const { data } = await api.get<MonitoringStatus>(`/monitoring/services/${idServicio}/status`);
      setServiceMonitoringStatus(data);
      if (!silent) {
        setStatus('Monitoreo del servicio actualizado');
      }
    } catch (err) {
      setServiceMonitoringStatus(null);
      if (!silent) {
        setStatus(apiErrorMessage(err));
      }
    }
  }

  async function loadCustomerTvip(idCliente = selectedCustomer?.idCliente, silent = false) {
    if (!idCliente) {
      return;
    }

    try {
      const { data } = await api.get<TvipCredentialSummary[]>(`/tvip/customer/${idCliente}`);
      setTvipCredentials(data);
      if (!silent) {
        setStatus('Credenciales TV IP actualizadas');
      }
    } catch (err) {
      setTvipCredentials([]);
      if (!silent) {
        setStatus(apiErrorMessage(err));
      }
    }
  }

  async function regenerateTvipCredential(idContrato: number) {
    try {
      const { data } = await api.post<TvipGenerationResult>(`/tvip/contracts/${idContrato}/regenerate`);
      setTvipTempPassword({ idContrato, usuario: data.usuarioTvip, password: data.temporaryPassword });
      await loadCustomerTvip(selectedCustomer?.idCliente, true);
      setStatus('Credencial TV IP generada. La contraseña temporal se muestra solo una vez.');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function createService(event: FormEvent) {
    event.preventDefault();

    if (!selectedCustomer) {
      return;
    }

    try {
      const { data } = await api.post<CustomerService>('/services', {
        idCliente: selectedCustomer.idCliente,
        idEmpresa: customerCompanyId,
        idContrato: serviceCreateForm.idContrato ? Number(serviceCreateForm.idContrato) : undefined,
        idZonaPago: serviceCreateForm.idZonaPago ? Number(serviceCreateForm.idZonaPago) : undefined,
        tipoServicio: serviceCreateForm.tipoServicio,
        estadoOperativo: serviceCreateForm.estadoOperativo,
        observaciones: serviceCreateForm.observaciones.trim() || undefined,
        tecnologia: serviceCreateForm.tecnologia.trim() || undefined,
        velocidad: serviceCreateForm.velocidad.trim() || undefined,
        macAddress: serviceCreateForm.macAddress.trim() || undefined,
        puertoOlt: serviceCreateForm.puertoOlt.trim() || undefined,
        ipAsignada: serviceCreateForm.ipAsignada.trim() || undefined,
        observacionesTecnicas: serviceCreateForm.observacionesTecnicas.trim() || undefined,
        cajaNap: serviceCreateForm.cajaNap.trim() || undefined,
        numeroPoste: serviceCreateForm.numeroPoste.trim() || undefined,
        caracteristicasComerciales: serviceCreateForm.caracteristicasComerciales.trim() || undefined,
      });
      setServiceCreateForm(emptyServiceForm());
      await loadServicesForCustomer(selectedCustomer.idCliente, true, data.idServicio);
      setStatus('Servicio contratado registrado');
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function updateService(event: FormEvent) {
    event.preventDefault();

    if (!selectedService || !selectedCustomer) {
      return;
    }

    try {
      await api.patch<CustomerService>(`/services/${selectedService.idServicio}`, {
        tipoServicio: serviceUpdateForm.tipoServicio,
        estadoOperativo: serviceUpdateForm.estadoOperativo,
        idZonaPago: serviceUpdateForm.idZonaPago ? Number(serviceUpdateForm.idZonaPago) : undefined,
        observaciones: serviceUpdateForm.observaciones.trim() || undefined,
        tecnologia: serviceUpdateForm.tecnologia.trim() || undefined,
        velocidad: serviceUpdateForm.velocidad.trim() || undefined,
        macAddress: serviceUpdateForm.macAddress.trim() || undefined,
        puertoOlt: serviceUpdateForm.puertoOlt.trim() || undefined,
        ipAsignada: serviceUpdateForm.ipAsignada.trim() || undefined,
        observacionesTecnicas: serviceUpdateForm.observacionesTecnicas.trim() || undefined,
        cajaNap: serviceUpdateForm.cajaNap.trim() || undefined,
        numeroPoste: serviceUpdateForm.numeroPoste.trim() || undefined,
        caracteristicasComerciales: serviceUpdateForm.caracteristicasComerciales.trim() || undefined,
      });
      await loadServicesForCustomer(selectedCustomer.idCliente, true, selectedService.idServicio);
      setStatus('Perfil de servicio actualizado');
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function attachEquipment(event: FormEvent) {
    event.preventDefault();

    if (!selectedService || !selectedCustomer) {
      return;
    }

    if (!equipmentForm.numeroSerie.trim()) {
      setStatus('Ingresa el numero de serie del equipo a asociar.');
      return;
    }

    try {
      await api.post(`/services/${selectedService.idServicio}/equipment`, {
        numeroSerie: equipmentForm.numeroSerie.trim(),
        modelo: equipmentForm.modelo.trim() || undefined,
        macAddress: equipmentForm.macAddress.trim() || undefined,
        puertoOlt: equipmentForm.puertoOlt.trim() || undefined,
        observaciones: equipmentForm.observaciones.trim() || undefined,
        modalidadAsignacion: equipmentForm.modalidadAsignacion,
        valorArriendoMensual: equipmentForm.valorArriendoMensual ? Number(equipmentForm.valorArriendoMensual) : undefined,
        fechaInicioAsignacion: equipmentForm.fechaInicioAsignacion || undefined,
      });
      setEquipmentForm({
        numeroSerie: '',
        modelo: '',
        macAddress: '',
        puertoOlt: '',
        observaciones: '',
        modalidadAsignacion: 'Propiedad empresa',
        valorArriendoMensual: '',
        fechaInicioAsignacion: '',
      });
      await loadServicesForCustomer(selectedCustomer.idCliente, true, selectedService.idServicio);
      setStatus('Equipo asociado al servicio contratado');
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  function updateInstallOrderSchedule(field: 'fechaProgramada' | 'horaVisita', value: string) {
    setInstallOrderForm((current) => ({ ...current, [field]: value }));
    setInstallAvailability(null);
    setInstallTechnicianId('');
    setInstallOrderStatus('');
    setInstallOrderError('');
  }

  function validateServiceInstallOrderFields() {
    if (!selectedService) {
      return 'Selecciona un servicio para generar la orden de instalación.';
    }

    if (!isPendingInstallationService(selectedService)) {
      return 'La orden de instalación solo puede generarse para servicios pendientes de instalación.';
    }

    if (selectedServicePendingInstallOrder) {
      return `El servicio ya tiene la orden ${formatServiceWorkOrderCode(selectedServicePendingInstallOrder)} pendiente.`;
    }

    if (!installOrderForm.tipoConexion || !installOrderForm.fechaProgramada || !installOrderForm.horaVisita) {
      return 'Completa tipo de conexión, fecha y hora de la visita.';
    }

    if (installOrderForm.fechaProgramada < today) {
      return 'La fecha de instalación no puede ser anterior a hoy.';
    }

    if (installOrderForm.fechaProgramada > latestInstallDate) {
      return 'La fecha de instalación no puede superar un año desde hoy.';
    }

    return '';
  }

  async function checkServiceInstallAvailability() {
    setInstallOrderStatus('');
    setInstallOrderError('');
    const validationError = validateServiceInstallOrderFields();

    if (validationError) {
      setInstallOrderError(validationError);
      return;
    }

    if (!selectedService) {
      return;
    }

    try {
      const { data } = await api.get<InstallAvailability>(
        `/services/${selectedService.idServicio}/install-availability`,
        {
          params: {
            fechaProgramada: installOrderForm.fechaProgramada,
            horaVisita: installOrderForm.horaVisita,
          },
        },
      );
      setInstallAvailability(data);
      setInstallTechnicianId(data.tecnicosDisponibles[0] ? String(data.tecnicosDisponibles[0].idTecnico) : '');

      if (data.tecnicosDisponibles.length) {
        setInstallOrderStatus(data.mensaje);
      } else {
        setInstallOrderError(data.mensaje);
      }
    } catch (err) {
      setInstallAvailability(null);
      setInstallTechnicianId('');
      setInstallOrderError(apiErrorMessage(err));
    }
  }

  function selectServiceInstallAlternative(alternative: InstallAvailability['alternativas'][number]) {
    setInstallOrderForm((current) => ({
      ...current,
      fechaProgramada: alternative.fechaProgramada,
      horaVisita: alternative.horaVisita,
    }));
    setInstallAvailability({
      fechaProgramada: alternative.fechaProgramada,
      horaVisita: alternative.horaVisita,
      tecnicosDisponibles: alternative.tecnicosDisponibles,
      alternativas: [],
      mensaje: 'Horario alternativo seleccionado. Confirma el técnico asignado.',
    });
    setInstallTechnicianId(
      alternative.tecnicosDisponibles[0] ? String(alternative.tecnicosDisponibles[0].idTecnico) : '',
    );
    setInstallOrderError('');
    setInstallOrderStatus('Horario alternativo seleccionado. Confirma el técnico asignado.');
  }

  async function createServiceInstallOrder() {
    setInstallOrderStatus('');
    setInstallOrderError('');
    const validationError = validateServiceInstallOrderFields();

    if (validationError) {
      setInstallOrderError(validationError);
      return;
    }

    if (!selectedService || !selectedCustomer) {
      return;
    }

    if (!installTechnicianId) {
      setInstallOrderError('Verifica la disponibilidad y selecciona un técnico antes de crear la orden.');
      return;
    }

    try {
      const { data } = await api.post<{
        orden: {
          idOt: number;
          codigoSeguimiento: string | null;
          tecnico: { nombreCompleto: string };
        };
        servicio: CustomerService;
      }>(`/services/${selectedService.idServicio}/install-order`, {
        ...installOrderForm,
        idTecnico: Number(installTechnicianId),
      });
      setInstallOrderStatus(
        `Orden ${data.orden.codigoSeguimiento ?? formatServiceWorkOrderCode(data.orden as CustomerServiceWorkOrder)} creada y asignada a ${data.orden.tecnico.nombreCompleto}.`,
      );
      setInstallOrderForm(emptyServiceInstallOrderForm());
      setInstallAvailability(null);
      setInstallTechnicianId('');
      await loadServicesForCustomer(selectedCustomer.idCliente, true, data.servicio.idServicio);
      onChanged();
    } catch (err) {
      setInstallOrderError(apiErrorMessage(err));
    }
  }

  return (
    <section className="customers-module">
      <section className="customers-list-panel">
        <div className="section-heading customers-list-heading">
          <h2>Clientes</h2>
        </div>
        <div className="customer-search">
          <label>
            Buscar cliente
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por RUT, nombre, teléfono o contrato"
            />
          </label>
        </div>
        <div className="customer-list-filters">
          <span>{visibleCustomers.length} registros</span>
          <select aria-label="Filtrar clientes por estado" value={customerStatusFilter} onChange={(event) => setCustomerStatusFilter(event.target.value)}>
            <option value="">Todos los estados</option>
            {customerStatusOptions.map((state) => <option key={state} value={state}>{formatWorkOrderValue(state)}</option>)}
          </select>
        </div>
        {status && !managementOpen && <p className="inline-status">{status}</p>}
        <div className="table-wrap customers-table-wrap">
          <table className="customers-table">
            <thead>
              <tr>
                <th>RUT</th>
                <th>Nombre</th>
                <th>Empresa</th>
                <th>Estado actual</th>
                <th>Origen</th>
                <th>Servicio / Plan</th>
                <th>Contacto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paginatedCustomers.map((customer) => (
                <tr key={customer.idCliente}>
                  <td>{customer.rut ?? '-'}</td>
                  <td>{customer.nombreCompleto}</td>
                  <td>{customerCompanyLabel(customer)}</td>
                  <td><span className="customer-current-status">{formatWorkOrderValue(customer.estado)}</span></td>
                  <td>{customer.origenContacto ?? '-'}</td>
                  <td>{customerMainPlan(customer)}</td>
                  <td>{customer.telefono ?? customer.email ?? '-'}</td>
                  <td>
                    <button className="secondary compact" onClick={() => openCustomerManagement(customer.idCliente)}>
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={page} totalItems={visibleCustomers.length} pageSize={pageSize} onPageChange={setPage} />
        {!visibleCustomers.length && (
          <p className="empty-state">
            {searchTerm || customerStatusFilter ? 'No se encontraron clientes con los filtros seleccionados.' : 'No hay clientes registrados para mostrar.'}
          </p>
        )}
      </section>

      <Modal title="Gestionar cliente" open={managementOpen} onClose={() => setManagementOpen(false)}>
        {selectedCustomer ? (
          <div className="customer-management-modal">
            <section className="customer-profile-overview">
              <header className="customer-profile-header">
                <span className="customer-profile-avatar" aria-hidden="true">
                  <Users size={22} strokeWidth={1.8} />
                </span>
                <div>
                  <h3>{selectedCustomer.nombreCompleto}</h3>
                  <p>{selectedCustomer.rut ?? 'RUT no registrado'}</p>
                </div>
                <StatusBadge value={selectedCustomer.estado} />
              </header>
              <dl className="customer-profile-data">
                <div>
                  <dt>Empresa</dt>
                  <dd>{customerCompanyLabel(selectedCustomer)}</dd>
                </div>
                <div>
                  <dt>Origen</dt>
                  <dd>{selectedCustomer.origenContacto ?? 'No registrado'}</dd>
                </div>
                <div>
                  <dt>Teléfono</dt>
                  <dd>{selectedCustomer.telefono ?? 'No registrado'}</dd>
                </div>
                <div>
                  <dt>Correo</dt>
                  <dd>{selectedCustomer.email ?? 'No registrado'}</dd>
                </div>
                <div>
                  <dt>Dirección</dt>
                  <dd>{customerAddressLabel(selectedCustomer)}</dd>
                </div>
                <div>
                  <dt>Contratos / servicios</dt>
                  <dd>{contractOptions.length} contrato(s) · {services.length} servicio(s)</dd>
                </div>
              </dl>
            </section>

            <CustomerContractWorkflow
              customer={selectedCustomer}
              services={services}
              plans={plans}
              paymentZones={paymentZones}
              permissions={permissions}
              onRefresh={async (preferredServiceId) => {
                await loadServicesForCustomer(selectedCustomer.idCliente, true, preferredServiceId);
                onChanged();
              }}
              onOpenObservations={setObservationTarget}
            />
          </div>
        ) : (
          <p className="inline-status">Selecciona un cliente para gestionarlo.</p>
        )}
      </Modal>
      <ObservationsModal
        target={observationTarget}
        onClose={() => setObservationTarget(null)}
        onSaved={() => {
          if (selectedCustomer) {
            void loadHistory();
          }
        }}
      />
    </section>
  );
}
