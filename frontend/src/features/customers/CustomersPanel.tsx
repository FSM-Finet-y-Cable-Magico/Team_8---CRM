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
                  <dt>Plan principal</dt>
                  <dd>{customerMainPlan(selectedCustomer)}</dd>
                </div>
              </dl>
              {permissions.manageObservations && (
                <button
                  type="button"
                  className="secondary compact"
                  onClick={() => setObservationTarget({
                    tipoEntidad: 'Cliente',
                    idEntidad: selectedCustomer.idCliente,
                    idCliente: selectedCustomer.idCliente,
                    idEmpresa: selectedCustomer.idEmpresa,
                    label: selectedCustomer.nombreCompleto,
                  })}
                >
                  Observaciones
                </button>
              )}
            </section>

            <section className="workflow-panel customer-service-workflow">
              <div className="section-heading">
                <h3>Flujo por servicio contratado</h3>
                <p>Selecciona un servicio para ver su etapa actual y ejecutar solo las acciones disponibles.</p>
              </div>

              {services.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Servicio</th>
                        <th>Estado</th>
                        <th>Plan</th>
                        <th>Dirección</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {services.map((service) => (
                        <tr key={`workflow-service-${service.idServicio}`}>
                          <td>{service.tipoServicio}</td>
                          <td><StatusBadge value={service.estadoOperativo} /></td>
                          <td>{service.contrato?.plan?.nombreComercial ?? '-'}</td>
                          <td>{service.direccion?.direccionCompleta ?? '-'}</td>
                          <td>
                            <button
                              type="button"
                              className="secondary compact"
                              onClick={() => setSelectedServiceId(service.idServicio)}
                            >
                              {selectedService?.idServicio === service.idServicio ? 'Seleccionado' : 'Ver perfil'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="inline-status">Este cliente aún no tiene servicios registrados para gestionar.</p>
              )}

              {selectedService && (
                <article className="customer-feature-card stack">
                  <header className="section-heading compact-heading">
                    <div>
                      <h3>Servicio #{selectedService.idServicio}</h3>
                      <p>
                        {selectedService.tipoServicio} - {selectedService.contrato?.plan?.nombreComercial ?? 'Sin plan asociado'}
                      </p>
                    </div>
                    <StatusBadge value={selectedService.estadoOperativo} />
                  </header>

                  <div className="history-grid">
                    <HistoryBox title="Dirección" value={selectedService.direccion?.direccionCompleta ?? 'Sin dirección'} />
                    <HistoryBox title="Equipos" value={selectedService.equipos?.length ?? 0} />
                    <HistoryBox title="Tickets" value={selectedService.tickets?.length ?? 0} />
                    <HistoryBox title="Órdenes" value={selectedService.ordenes?.length ?? 0} />
                  </div>

                  {selectedServicePendingInstallOrder ? (
                    <section className="history-list">
                      <h3>Orden de instalación pendiente</h3>
                      <p>
                        {formatServiceWorkOrderCode(selectedServicePendingInstallOrder)} - {formatWorkOrderValue(selectedServicePendingInstallOrder.estado)}
                      </p>
                      <p className="detail-line">
                        Visita: {formatDateOnly(selectedServicePendingInstallOrder.fechaProgramada)}.
                        Técnico: {selectedServicePendingInstallOrder.idTecnico ? `Usuario ${selectedServicePendingInstallOrder.idTecnico}` : 'Sin asignar'}.
                      </p>
                      <p className="inline-status">El cierre técnico debe realizarse desde Órdenes de Trabajo.</p>
                    </section>
                  ) : isPendingInstallationService(selectedService) ? (
                    <section className="history-list">
                      <h3>Generar orden de instalación</h3>
                      <p className="detail-line">
                        El servicio está pendiente de instalación. Agenda la visita y luego ciérrala desde Órdenes de Trabajo.
                      </p>
                      {!permissions.createInstallOrders && (
                        <p className="alert">No tienes permisos para generar órdenes de instalación.</p>
                      )}
                      <div className="install-form-grid">
                        <label>
                          Tipo de conexión
                          <select
                            value={installOrderForm.tipoConexion}
                            disabled={!selectedServiceCanGenerateInstallOrder}
                            onChange={(event) => {
                              setInstallOrderForm((current) => ({ ...current, tipoConexion: event.target.value }));
                              setInstallOrderError('');
                            }}
                          >
                            <option value="">Seleccionar tipo de conexión</option>
                            <option value="Fibra Optica">Fibra Óptica</option>
                            <option value="Television">Televisión</option>
                          </select>
                        </label>
                        <label>
                          Fecha de la visita
                          <input
                            type="date"
                            min={today}
                            max={latestInstallDate}
                            disabled={!selectedServiceCanGenerateInstallOrder}
                            value={installOrderForm.fechaProgramada}
                            onChange={(event) => updateInstallOrderSchedule('fechaProgramada', event.target.value)}
                          />
                        </label>
                        <label>
                          Hora de la visita
                          <input
                            type="time"
                            disabled={!selectedServiceCanGenerateInstallOrder}
                            value={installOrderForm.horaVisita}
                            onChange={(event) => updateInstallOrderSchedule('horaVisita', event.target.value)}
                          />
                        </label>
                        <label>
                          Prioridad
                          <select
                            value={installOrderForm.prioridad}
                            disabled={!selectedServiceCanGenerateInstallOrder}
                            onChange={(event) => setInstallOrderForm((current) => ({ ...current, prioridad: event.target.value }))}
                          >
                            <option value="Alta">Alta</option>
                            <option value="Media">Media</option>
                            <option value="Baja">Baja</option>
                          </select>
                        </label>
                        <label className="full-width-field">
                          Observaciones de agenda
                          <textarea
                            maxLength={300}
                            disabled={!selectedServiceCanGenerateInstallOrder}
                            value={installOrderForm.observaciones}
                            onChange={(event) => setInstallOrderForm((current) => ({ ...current, observaciones: event.target.value }))}
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        disabled={!selectedServiceCanGenerateInstallOrder}
                        onClick={() => void checkServiceInstallAvailability()}
                      >
                        Verificar disponibilidad técnica
                      </button>

                      {installAvailability?.tecnicosDisponibles.length ? (
                        <label>
                          Técnico asignado
                          <select value={installTechnicianId} onChange={(event) => setInstallTechnicianId(event.target.value)}>
                            {installAvailability.tecnicosDisponibles.map((technician) => (
                              <option key={technician.idTecnico} value={technician.idTecnico}>
                                {technician.nombreCompleto}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      {installAvailability && !installAvailability.tecnicosDisponibles.length && installAvailability.alternativas.length > 0 && (
                        <div className="alternative-slots">
                          <strong>Horarios alternativos sugeridos</strong>
                          <div className="button-row">
                            {installAvailability.alternativas.map((alternative) => (
                              <button
                                key={`${alternative.fechaProgramada}-${alternative.horaVisita}`}
                                type="button"
                                className="secondary compact"
                                onClick={() => selectServiceInstallAlternative(alternative)}
                              >
                                {alternative.fechaProgramada} {alternative.horaVisita} ({alternative.tecnicosDisponibles.length} técnico(s))
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={!selectedServiceCanGenerateInstallOrder || !installTechnicianId}
                        onClick={() => void createServiceInstallOrder()}
                      >
                        Generar orden de instalación
                      </button>
                      {installOrderError && <p className="alert">{installOrderError}</p>}
                      {installOrderStatus && <p className="inline-status">{installOrderStatus}</p>}
                    </section>
                  ) : normalizeServiceStatus(selectedService.estadoOperativo).includes('suspendido') ? (
                    <p className="alert">Servicio suspendido. Revisa Cobranza antes de coordinar nuevas acciones operativas.</p>
                  ) : normalizeServiceStatus(selectedService.estadoOperativo) === 'activo' ? (
                    <p className="inline-status">Servicio activo. Las acciones disponibles se concentran en soporte, observaciones, equipos y datos técnicos.</p>
                  ) : (
                    <p className="inline-status">No hay acciones de instalación disponibles para el estado actual del servicio.</p>
                  )}
                </article>
              )}
            </section>

            {(permissions.viewMonitoring || permissions.manageTvip) && (
              <details className="customer-modal-section">
                <summary>
                  <span className="customer-section-icon customer-section-icon-blue" aria-hidden="true">
                    <Wifi size={19} strokeWidth={1.8} />
                  </span>
                  <span>
                    <strong>Conectividad y TV IP</strong>
                    <small>Monitoreo de conexión y credenciales del servicio.</small>
                  </span>
                  <ChevronDown size={18} strokeWidth={1.8} aria-hidden="true" />
                </summary>
                <div className="customer-modal-section-content">
                  <section className="customer-extra-grid">
                    {permissions.viewMonitoring && (
                      <article className="customer-feature-card stack">
                        <div className="section-heading compact-heading">
                          <h3>Monitoreo de conexión</h3>
                          <button type="button" className="secondary compact" onClick={() => void loadCustomerMonitoring()}>
                            Actualizar
                          </button>
                        </div>
                        <MonitoringStatusView status={monitoringStatus} />
                      </article>
                    )}
                    {permissions.manageTvip && (
                      <article className="customer-feature-card stack">
                        <div className="section-heading compact-heading">
                          <h3>TV IP</h3>
                          <button type="button" className="secondary compact" onClick={() => void loadCustomerTvip()}>
                            Actualizar
                          </button>
                        </div>
                        {!tvipCredentials.length && <p className="inline-status">El cliente no tiene contratos con plan TV IP.</p>}
                        {tvipCredentials.map((credential) => (
                          <section className="compact-list-item" key={credential.idContrato}>
                            <strong>{credential.plan?.nombreComercial ?? `Contrato ${credential.idContrato}`}</strong>
                            <span>Usuario: {credential.credencial?.usuarioTvip ?? 'Sin generar'}</span>
                            <span>Generada: {formatDateTime(credential.credencial?.fechaGeneracion)}</span>
                            <button type="button" className="secondary compact" onClick={() => void regenerateTvipCredential(credential.idContrato)}>
                              {credential.credencial ? 'Regenerar' : 'Generar'} credencial
                            </button>
                            {tvipTempPassword?.idContrato === credential.idContrato && (
                              <p className="inline-status">
                                Password temporal: <strong>{tvipTempPassword.password}</strong>. Guardar ahora; no se volvera a mostrar.
                              </p>
                            )}
                          </section>
                        ))}
                      </article>
                    )}
                  </section>
                </div>
              </details>
            )}

      <details className="customer-modal-section">
              <summary>
                <span className="customer-section-icon" aria-hidden="true">
                  <UserCog size={19} strokeWidth={1.8} />
                </span>
                <span>
                  <strong>Estado e historial</strong>
                  <small>Gestiona el estado operativo y revisa la actividad del cliente.</small>
                </span>
                <ChevronDown size={18} strokeWidth={1.8} aria-hidden="true" />
              </summary>
              <div className="customer-modal-section-content customer-operational-section">
                {selectedCustomer ? (
                  <>
                    <p className="detail-line">
                      Origen: {selectedCustomer.origenContacto ?? 'Sin dato'} - Servicios registrados: {services.length}
                    </p>
                    <label>
                      Estado operativo
                      <select value={statusValue} onChange={(event) => setStatusValue(event.target.value)}>
                        {['Pendiente firma contrato', 'Activo', 'Suspendido', 'En Mantencion', 'Moroso', 'Baja'].map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="button-row">
                      <button type="button" onClick={updateCustomerStatus}>
                        Cambiar Estado Operativo
                      </button>
                      <button type="button" className="secondary" onClick={loadHistory}>
                        Ver Historial
                      </button>
                    </div>
                    {status && <p className="inline-status">{status}</p>}
                    {permissions.manageServices && (
                      <form className="stack customer-service-form" onSubmit={updateCustomerTechnicalData}>
                        <h3>Datos técnicos generales del cliente</h3>
                        <div className="workflow-grid">
                          <input
                            placeholder="Tecnología principal"
                            value={customerTechnicalForm.tecnologiaPrincipal}
                            onChange={(event) => setCustomerTechnicalForm({ ...customerTechnicalForm, tecnologiaPrincipal: event.target.value })}
                          />
                          <input
                            placeholder="Nodo principal"
                            value={customerTechnicalForm.nodoPrincipal}
                            onChange={(event) => setCustomerTechnicalForm({ ...customerTechnicalForm, nodoPrincipal: event.target.value })}
                          />
                          <input
                            placeholder="Caja NAP principal"
                            value={customerTechnicalForm.cajaNapPrincipal}
                            onChange={(event) => setCustomerTechnicalForm({ ...customerTechnicalForm, cajaNapPrincipal: event.target.value })}
                          />
                          <input
                            placeholder="Número de poste"
                            value={customerTechnicalForm.numeroPoste}
                            onChange={(event) => setCustomerTechnicalForm({ ...customerTechnicalForm, numeroPoste: event.target.value })}
                          />
                          <input
                            placeholder="IP de referencia"
                            value={customerTechnicalForm.ipReferencia}
                            onChange={(event) => setCustomerTechnicalForm({ ...customerTechnicalForm, ipReferencia: event.target.value })}
                          />
                        </div>
                        <textarea
                          placeholder="Observaciones técnicas generales"
                          value={customerTechnicalForm.observacionesTecnicas}
                          onChange={(event) => setCustomerTechnicalForm({ ...customerTechnicalForm, observacionesTecnicas: event.target.value })}
                        />
                        <button type="submit">Guardar datos técnicos</button>
                      </form>
                    )}
                    {permissions.manageCustomerRequests && (
                      <form className="stack customer-service-form" onSubmit={createCustomerRequest}>
                        <h3>Registrar solicitud del cliente</h3>
                        <div className="workflow-grid">
                          <input
                            placeholder="Tipo de solicitud"
                            value={requestForm.tipoSolicitud}
                            onChange={(event) => setRequestForm({ ...requestForm, tipoSolicitud: event.target.value })}
                          />
                          <select
                            value={requestForm.canalOrigen}
                            onChange={(event) => setRequestForm({ ...requestForm, canalOrigen: event.target.value })}
                          >
                            {captureOriginOptions.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
                            <option value="CRM">CRM</option>
                          </select>
                          <select value={requestForm.estado} onChange={(event) => setRequestForm({ ...requestForm, estado: event.target.value })}>
                            {['Abierta', 'En Gestion', 'Cerrada', 'No Factible', 'Cancelada'].map((item) => <option key={item} value={item}>{item}</option>)}
                          </select>
                          <select value={requestForm.factible} onChange={(event) => setRequestForm({ ...requestForm, factible: event.target.value })}>
                            <option value="">Factibilidad pendiente</option>
                            <option value="true">Factible</option>
                            <option value="false">No factible</option>
                          </select>
                        </div>
                        <input
                          placeholder="Motivo no factible, si aplica"
                          value={requestForm.motivoNoFactible}
                          onChange={(event) => setRequestForm({ ...requestForm, motivoNoFactible: event.target.value })}
                        />
                        <textarea
                          placeholder="Descripción u observaciones de la solicitud"
                          value={requestForm.descripcion}
                          onChange={(event) => setRequestForm({ ...requestForm, descripcion: event.target.value })}
                        />
                        <button type="submit">Registrar solicitud</button>
                      </form>
                    )}
                    {history && (
                      <div className="history-grid">
                        <HistoryBox title="Contratos" value={history.contratos.length} />
                        <HistoryBox title="Servicios" value={history.servicios.length} />
                        <HistoryBox title="Tickets" value={history.tickets.length} />
                        <HistoryBox title="OTs" value={history.ordenes.length} />
                        <HistoryBox title="Equipos" value={history.equipos.length} />
                        <HistoryBox title="Solicitudes" value={history.solicitudes?.length ?? 0} />
                        <HistoryBox title="Cambios de plan" value={history.cambiosPlan?.length ?? 0} />
                        <section className="history-list">
                          <h3>Ultimos movimientos</h3>
                          <ul>
                            {history.auditoria.slice(0, 6).map((row) => (
                              <li key={row.idLog}>
                                {row.accion} {row.fechaHora ? new Date(row.fechaHora).toLocaleString() : ''}
                              </li>
                            ))}
                          </ul>
                        </section>
                        <section className="history-list">
                          <h3>Solicitudes recientes</h3>
                          <ul>
                            {(history.solicitudes ?? []).slice(0, 6).map((request) => (
                              <li key={request.idSolicitud}>
                                {request.tipoSolicitud} - {request.estado}
                                {request.factible === false ? ` - No factible: ${request.motivoNoFactible ?? 'sin motivo'}` : ''}
                              </li>
                            ))}
                            {!history.solicitudes?.length && <li>Sin solicitudes registradas.</li>}
                          </ul>
                        </section>
                        <section className="history-list">
                          <h3>Cambios de plan y contratos digitales</h3>
                          <ul>
                            {(history.cambiosPlan ?? []).slice(0, 4).map((change) => (
                              <li key={change.idCambioPlan}>
                                Contrato {change.idContrato}: {change.planAnterior?.nombreComercial ?? '-'} a {change.planNuevo?.nombreComercial ?? '-'}
                              </li>
                            ))}
                            {(history.contratosDigitales ?? []).slice(0, 4).map((document) => (
                              <li key={document.idContratoDigital}>
                                Contrato digital {document.idContrato} v{document.version} - {document.estadoFirma}
                              </li>
                            ))}
                            {!history.cambiosPlan?.length && !history.contratosDigitales?.length && <li>Sin cambios ni documentos registrados.</li>}
                          </ul>
                        </section>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="inline-status">No hay clientes para gestionar.</p>
                )}
              </div>
            </details>

            <details className="customer-modal-section">
              <summary>
                <span className="customer-section-icon customer-section-icon-violet" aria-hidden="true">
                  <Router size={19} strokeWidth={1.8} />
                </span>
                <span>
                  <strong>Servicios contratados</strong>
                  <small>{services.length} servicio(s) registrado(s), perfiles técnicos y equipos.</small>
                </span>
                <ChevronDown size={18} strokeWidth={1.8} aria-hidden="true" />
              </summary>
              <div className="customer-modal-section-content customer-services-section">
                {selectedCustomer ? (
                  <>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Servicio</th>
                            <th>Estado</th>
                            <th>Plan</th>
                            <th>Direccion</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {services.map((service) => (
                            <tr key={service.idServicio}>
                              <td>{service.tipoServicio}</td>
                              <td>{service.estadoOperativo}</td>
                              <td>{service.contrato?.plan?.nombreComercial ?? '-'}</td>
                              <td>{service.direccion?.direccionCompleta ?? '-'}</td>
                              <td>
                                <button
                                  type="button"
                                  className="secondary compact"
                                  onClick={() => setSelectedServiceId(service.idServicio)}
                                >
                                  Ver perfil
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {!services.length && (
                      <p className="inline-status">Este cliente aun no tiene servicios contratados registrados.</p>
                    )}

                    {selectedService && (
                      <div className="workflow-panel customer-service-profile">
                        <h3>Servicio #{selectedService.idServicio}</h3>
                        <p className="detail-line">
                          {selectedService.tipoServicio} - {selectedService.estadoOperativo}
                          {selectedService.contrato?.plan ? ` - ${selectedService.contrato.plan.nombreComercial}` : ''}
                        </p>
                        <div className="history-grid">
                          <HistoryBox title="Equipos instalados" value={selectedService.equipos?.length ?? 0} />
                          <HistoryBox title="Tickets" value={selectedService.tickets?.length ?? 0} />
                          <HistoryBox title="OTs" value={selectedService.ordenes?.length ?? 0} />
                          <HistoryBox title="Direccion" value={selectedService.direccion?.comuna ?? 'Sin dato'} />
                          <section className="history-list">
                            <h3>Datos tecnicos del servicio</h3>
                            <ul>
                              {technicalEntries(selectedService.datosTecnicos).map((entry) => (
                                <li key={entry}>{entry}</li>
                              ))}
                              {!technicalEntries(selectedService.datosTecnicos).length && <li>Sin datos tecnicos registrados.</li>}
                            </ul>
                            {permissions.manageObservations && (
                              <button
                                type="button"
                                className="secondary compact"
                                onClick={() => setObservationTarget({
                                  tipoEntidad: 'Servicio',
                                  idEntidad: selectedService.idServicio,
                                  idCliente: selectedService.idCliente,
                                  idEmpresa: selectedService.idEmpresa,
                                  label: `Servicio ${selectedService.idServicio}`,
                                })}
                              >
                                Observaciones del servicio
                              </button>
                            )}
                          </section>
                          <section className="history-list">
                            <h3>Equipos instalados</h3>
                            <ul>
                              {(selectedService.equipos ?? []).map((unit) => (
                                <li key={unit.idUnidad}>
                                  {unit.numeroSerie} - {unit.estado} - modalidad: {unit.modalidadAsignacion ?? 'Sin clasificar'}
                                  {unit.valorArriendoMensual ? ` - $${Number(unit.valorArriendoMensual).toLocaleString('es-CL')}/mes` : ''}
                                </li>
                              ))}
                              {!selectedService.equipos?.length && <li>Sin equipos asociados al servicio.</li>}
                            </ul>
                          </section>
                          {permissions.viewMonitoring && (
                            <section className="history-list">
                              <div className="section-heading compact-heading">
                                <h3>Monitoreo del servicio</h3>
                                <button type="button" className="secondary compact" onClick={() => void loadServiceMonitoring()}>
                                  Actualizar
                                </button>
                              </div>
                              <MonitoringStatusView status={serviceMonitoringStatus} />
                            </section>
                          )}
                          <section className="history-list">
                            <h3>Solicitudes y visitas asociadas</h3>
                            <ul>
                              {(selectedService.solicitudes ?? []).slice(0, 4).map((request) => (
                                <li key={`request-${request.idSolicitud}`}>
                                  Solicitud {request.idSolicitud} - {request.tipoSolicitud} - {request.estado}
                                </li>
                              ))}
                              {(selectedService.tickets ?? []).slice(0, 4).map((ticket) => (
                                <li key={`ticket-${ticket.idTicket}`}>
                                  Ticket {ticket.codigoSeguimiento ?? ticket.idTicket} - {ticket.estado} - {ticket.prioridad}
                                </li>
                              ))}
                              {(selectedService.ordenes ?? []).slice(0, 4).map((order) => (
                                <li key={`order-${order.idOt}`}>
                                  Orden {order.idOt} - {order.tipoOt} - {order.estado} - {formatDateOnly(order.fechaProgramada)}
                                </li>
                              ))}
                              {!selectedService.solicitudes?.length && !selectedService.tickets?.length && !selectedService.ordenes?.length && (
                                <li>No hay solicitudes ni visitas asociadas.</li>
                              )}
                            </ul>
                          </section>
                          {selectedService.idContrato && (permissions.changeCustomerPlan || permissions.generateDigitalContract) && (
                            <section className="history-list">
                              <h3>Contrato del servicio</h3>
                              <p>Contrato {selectedService.idContrato} - {selectedService.contrato?.plan?.nombreComercial ?? 'Sin plan'}</p>
                              {permissions.generateDigitalContract && (
                                <div className="button-row">
                                  <button type="button" className="secondary compact" onClick={() => void generateDigitalContract(selectedService.idContrato ?? 0)}>
                                    Generar contrato digital
                                  </button>
                                  <button type="button" className="secondary compact" onClick={() => void downloadDigitalContract(selectedService.idContrato ?? 0)}>
                                    Descargar último contrato
                                  </button>
                                </div>
                              )}
                              {permissions.changeCustomerPlan && (
                                <form className="stack" onSubmit={changeServicePlan}>
                                  <select
                                    value={changePlanForm.newPlanId}
                                    onChange={(event) => setChangePlanForm({ ...changePlanForm, newPlanId: event.target.value })}
                                    required
                                  >
                                    <option value="">Seleccionar nuevo plan</option>
                                    {plans
                                      .filter((plan) => plan.activo !== false && (!selectedService.idEmpresa || !plan.idEmpresa || plan.idEmpresa === selectedService.idEmpresa))
                                      .map((plan) => (
                                        <option key={plan.idPlan} value={plan.idPlan}>
                                          {plan.nombreComercial} - ${Number(plan.precioMensual).toLocaleString('es-CL')}
                                        </option>
                                      ))}
                                  </select>
                                  <input
                                    type="date"
                                    value={changePlanForm.fechaEfectiva}
                                    onChange={(event) => setChangePlanForm({ ...changePlanForm, fechaEfectiva: event.target.value })}
                                    required
                                  />
                                  <input
                                    placeholder="Motivo del cambio"
                                    value={changePlanForm.motivo}
                                    onChange={(event) => setChangePlanForm({ ...changePlanForm, motivo: event.target.value })}
                                    required
                                  />
                                  <textarea
                                    placeholder="Observaciones del cambio"
                                    value={changePlanForm.observaciones}
                                    onChange={(event) => setChangePlanForm({ ...changePlanForm, observaciones: event.target.value })}
                                  />
                                  <button type="submit">Cambiar plan</button>
                                </form>
                              )}
                            </section>
                          )}
                        </div>
                      </div>
                    )}

                    {permissions.manageServices && (
                      <div className="workflow-grid customer-service-forms">
                        <form className="stack customer-service-form" onSubmit={createService}>
                          <h3>Registrar servicio adicional</h3>
                          <label>
                            Contrato asociado
                            <select
                              value={serviceCreateForm.idContrato}
                              onChange={(event) => setServiceCreateForm({ ...serviceCreateForm, idContrato: event.target.value })}
                            >
                              <option value="">Sin contrato especifico</option>
                              {contractOptions.map((contract) => (
                                <option key={contract.idContrato} value={contract.idContrato}>
                                  Contrato {contract.idContrato} - {contract.plan?.nombreComercial ?? 'sin plan'}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Zona de pago
                            <select
                              value={serviceCreateForm.idZonaPago}
                              onChange={(event) => setServiceCreateForm({ ...serviceCreateForm, idZonaPago: event.target.value })}
                            >
                              <option value="">Sin zona definida</option>
                              {paymentZones.map((zone) => (
                                <option key={zone.idZonaPago} value={zone.idZonaPago}>
                                  {zone.nombreZona} {zone.comuna ? `- ${zone.comuna}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Tipo de servicio
                            <select
                              value={serviceCreateForm.tipoServicio}
                              onChange={(event) => setServiceCreateForm({ ...serviceCreateForm, tipoServicio: event.target.value })}
                            >
                              {serviceTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>
                          </label>
                          <label>
                            Estado operativo
                            <select
                              value={serviceCreateForm.estadoOperativo}
                              onChange={(event) => setServiceCreateForm({ ...serviceCreateForm, estadoOperativo: event.target.value })}
                            >
                              {serviceStatusOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>
                          </label>
                          <input
                            placeholder="Tecnologia, ej: Fibra Optica"
                            value={serviceCreateForm.tecnologia}
                            onChange={(event) => setServiceCreateForm({ ...serviceCreateForm, tecnologia: event.target.value })}
                          />
                          <input
                            placeholder="Velocidad o caracteristica comercial"
                            value={serviceCreateForm.velocidad}
                            onChange={(event) => setServiceCreateForm({ ...serviceCreateForm, velocidad: event.target.value })}
                          />
                          <input
                            placeholder="Caja NAP"
                            value={serviceCreateForm.cajaNap}
                            onChange={(event) => setServiceCreateForm({ ...serviceCreateForm, cajaNap: event.target.value })}
                          />
                          <input
                            placeholder="Número de poste"
                            value={serviceCreateForm.numeroPoste}
                            onChange={(event) => setServiceCreateForm({ ...serviceCreateForm, numeroPoste: event.target.value })}
                          />
                          <textarea
                            placeholder="Características comerciales relevantes"
                            value={serviceCreateForm.caracteristicasComerciales}
                            onChange={(event) => setServiceCreateForm({ ...serviceCreateForm, caracteristicasComerciales: event.target.value })}
                          />
                          <textarea
                            placeholder="Observaciones del servicio"
                            value={serviceCreateForm.observaciones}
                            onChange={(event) => setServiceCreateForm({ ...serviceCreateForm, observaciones: event.target.value })}
                          />
                          <button type="submit">Registrar servicio</button>
                        </form>

                        {selectedService && (
                          <form className="stack customer-service-form" onSubmit={updateService}>
                            <h3>Actualizar perfil tecnico</h3>
                            <label>
                              Estado operativo
                              <select
                                value={serviceUpdateForm.estadoOperativo}
                                onChange={(event) => setServiceUpdateForm({ ...serviceUpdateForm, estadoOperativo: event.target.value })}
                              >
                                {serviceStatusOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                              </select>
                            </label>
                            <label>
                              Tipo de servicio
                              <select
                                value={serviceUpdateForm.tipoServicio}
                                onChange={(event) => setServiceUpdateForm({ ...serviceUpdateForm, tipoServicio: event.target.value })}
                              >
                                {serviceTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                              </select>
                            </label>
                            <label>
                              Zona de pago
                              <select
                                value={serviceUpdateForm.idZonaPago}
                                onChange={(event) => setServiceUpdateForm({ ...serviceUpdateForm, idZonaPago: event.target.value })}
                              >
                                <option value="">Sin zona definida</option>
                                {paymentZones.map((zone) => (
                                  <option key={zone.idZonaPago} value={zone.idZonaPago}>
                                    {zone.nombreZona} {zone.comuna ? `- ${zone.comuna}` : ''}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <input
                              placeholder="MAC del servicio"
                              value={serviceUpdateForm.macAddress}
                              onChange={(event) => setServiceUpdateForm({ ...serviceUpdateForm, macAddress: event.target.value })}
                            />
                            <input
                              placeholder="Puerto OLT / nodo"
                              value={serviceUpdateForm.puertoOlt}
                              onChange={(event) => setServiceUpdateForm({ ...serviceUpdateForm, puertoOlt: event.target.value })}
                            />
                            <input
                              placeholder="IP asignada"
                              value={serviceUpdateForm.ipAsignada}
                              onChange={(event) => setServiceUpdateForm({ ...serviceUpdateForm, ipAsignada: event.target.value })}
                            />
                            <input
                              placeholder="Caja NAP"
                              value={serviceUpdateForm.cajaNap}
                              onChange={(event) => setServiceUpdateForm({ ...serviceUpdateForm, cajaNap: event.target.value })}
                            />
                            <input
                              placeholder="Número de poste"
                              value={serviceUpdateForm.numeroPoste}
                              onChange={(event) => setServiceUpdateForm({ ...serviceUpdateForm, numeroPoste: event.target.value })}
                            />
                            <textarea
                              placeholder="Observaciones técnicas"
                              value={serviceUpdateForm.observacionesTecnicas}
                              onChange={(event) => setServiceUpdateForm({ ...serviceUpdateForm, observacionesTecnicas: event.target.value })}
                            />
                            <button type="submit">Actualizar perfil de servicio</button>
                          </form>
                        )}
                      </div>
                    )}

                    {permissions.manageServices && selectedService && (
                      <form className="stack customer-service-form customer-equipment-form" onSubmit={attachEquipment}>
                        <h3>Asociar equipo instalado al servicio</h3>
                        <div className="workflow-grid">
                          <input
                            placeholder="Numero de serie existente"
                            value={equipmentForm.numeroSerie}
                            onChange={(event) => setEquipmentForm({ ...equipmentForm, numeroSerie: event.target.value })}
                          />
                          <input
                            placeholder="Modelo opcional"
                            value={equipmentForm.modelo}
                            onChange={(event) => setEquipmentForm({ ...equipmentForm, modelo: event.target.value })}
                          />
                          <input
                            placeholder="MAC AA:BB:CC:DD:EE:FF"
                            value={equipmentForm.macAddress}
                            onChange={(event) => setEquipmentForm({ ...equipmentForm, macAddress: event.target.value })}
                          />
                          <input
                            placeholder="Puerto OLT / nodo"
                            value={equipmentForm.puertoOlt}
                            onChange={(event) => setEquipmentForm({ ...equipmentForm, puertoOlt: event.target.value })}
                          />
                          <select
                            value={equipmentForm.modalidadAsignacion}
                            onChange={(event) => setEquipmentForm({ ...equipmentForm, modalidadAsignacion: event.target.value })}
                          >
                            {equipmentModeOptions.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                          </select>
                          <input
                            type="number"
                            min="0"
                            placeholder="Valor arriendo mensual"
                            value={equipmentForm.valorArriendoMensual}
                            onChange={(event) => setEquipmentForm({ ...equipmentForm, valorArriendoMensual: event.target.value })}
                          />
                          <input
                            type="date"
                            value={equipmentForm.fechaInicioAsignacion}
                            onChange={(event) => setEquipmentForm({ ...equipmentForm, fechaInicioAsignacion: event.target.value })}
                          />
                        </div>
                        <textarea
                          placeholder="Observaciones de instalacion"
                          value={equipmentForm.observaciones}
                          onChange={(event) => setEquipmentForm({ ...equipmentForm, observaciones: event.target.value })}
                        />
                        <button type="submit">Asociar equipo</button>
                      </form>
                    )}
                  </>
                ) : (
                  <p className="inline-status">Selecciona un cliente para revisar sus servicios contratados.</p>
                )}
              </div>
            </details>
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
