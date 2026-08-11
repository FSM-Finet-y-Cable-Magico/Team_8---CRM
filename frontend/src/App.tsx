import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  ChevronDown,
  CircleCheckBig,
  ClipboardList,
  FileClock,
  FileUp,
  HandCoins,
  House,
  Router,
  Ticket as TicketIcon,
  UserCog,
  UserRoundPlus,
  Users,
  Wifi,
} from 'lucide-react';
import {
  api,
  apiErrorMessage,
  AdvancedInventory,
  AuditLog,
  AuthUser,
  BillingOverview,
  Company,
  Customer,
  CustomerRequest,
  CustomerService,
  DigitalContract,
  InventoryUnit,
  MonitoringStatus,
  OperationalObservation,
  PaymentZone,
  Plan,
  PortalCustomer,
  Prospect,
  Role,
  Ticket,
  TicketCategory,
  TvipCredentialSummary,
  TvipGenerationResult,
  UserRow,
  WorkOrder,
} from './api';
import {
  captureOriginOptions,
  equipmentModeOptions,
  rutPattern,
  serviceStatusOptions,
  serviceTypeOptions,
} from './constants';
import { AuditPanel } from './features/audit';
import { LoginScreen } from './features/auth';
import { BillingPanel } from './features/billing';
import { CustomersPanel } from './features/customers';
import { DashboardHome } from './features/dashboard';
import { ImportPanel } from './features/import';
import { InstallationsPanel } from './features/installations';
import { InventoryPanel } from './features/inventory';
import { PlansPanel } from './features/plans';
import { ProspectsPanel } from './features/prospects';
import { ReportsPanel } from './features/reports';
import { TicketsPanel } from './features/tickets';
import { UsersPanel } from './features/users';
import { WorkOrdersPanel } from './features/work-orders';
import {
  dateInputValue,
  emptyServiceForm,
  expiryAlertKey,
  expiryUrgency,
  formatConnectionType,
  formatDateOnly,
  formatDateTime,
  formatWorkOrderValue,
  normalizeAuthUser,
  normalizeRutInput,
  settledData,
  technicalEntries,
} from './lib';
import { Sidebar, Topbar, type SidebarNavItem } from './layouts';
import { DashboardPermissions, getDashboardPermissions, hasPermission } from './permissions';
import {
  DashboardStatCard,
  ExpiryBadge,
  ExpiryCustomerCard,
  HistoryBox,
  Modal,
  MonitoringStatusView,
  QuickActionCard,
  StatusBadge,
  type ExpiryCustomerAlert,
} from './shared/components';

type Tab =
  | 'dashboard'
  | 'prospects'
  | 'installations'
  | 'customers'
  | 'inventory'
  | 'plans'
  | 'billing'
  | 'tickets'
  | 'workOrders'
  | 'reports'
  | 'import'
  | 'users'
  | 'audit';

type NavItem = SidebarNavItem<Tab>;

type Summary = {
  scope: string;
  empresas: Company[];
  metricas: {
    clientes: number;
    prospectos: number;
    instalacionesPendientes?: number;
    ticketsAbiertos?: number;
    clientesMorosos?: number;
    inventarioDisponible?: number;
    serviciosActivos?: number;
    instalacionesMensuales?: number;
    ticketsCerradosMensuales?: number;
    churnRateMensual?: number;
    churnBajasMensuales?: number;
    solicitudesAbiertas?: number;
    solicitudesNoFactibles?: number;
  };
  cambiosPlanRecientes?: Array<{
    idCambioPlan: number;
    idContrato: number;
    cliente: string;
    planAnterior: string | null;
    planNuevo: string;
    fechaRegistro: string | null;
  }>;
  origenCaptacion?: Array<{
    origen: string;
    total: number;
  }>;
  ticketsCerradosPorTipo?: Array<{
    idCategoria: number;
    categoria: string;
    total: number;
  }>;
  alertasVencimiento?: Array<{
    idContrato: number;
    idCliente: number | null;
    cliente: string;
    rut: string | null;
    plan: string | null;
    estado: string;
    fechaVencimiento: string;
    diasRestantes: number;
  }>;
};

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('finet_user');
    return stored ? normalizeAuthUser(JSON.parse(stored) as AuthUser) : null;
  });
  const [portalMode, setPortalMode] = useState(() => window.location.pathname.startsWith('/portal'));

  if (portalMode) {
    return (
      <CustomerPortal
        onBack={() => {
          window.history.pushState(null, '', '/');
          setPortalMode(false);
        }}
      />
    );
  }

  if (!user) {
    return (
      <LoginScreen
        onLogin={setUser}
        onOpenPortal={() => {
          window.history.pushState(null, '', '/portal');
          setPortalMode(true);
        }}
      />
    );
  }

  return <Dashboard user={user} onLogout={() => setUser(null)} />;
}

function CustomerPortal({ onBack }: { onBack: () => void }) {
  const [token, setToken] = useState(() => localStorage.getItem('finet_portal_token') ?? '');
  const [customer, setCustomer] = useState<PortalCustomer | null>(() => {
    const stored = localStorage.getItem('finet_portal_customer');
    return stored ? JSON.parse(stored) as PortalCustomer : null;
  });
  const [loginForm, setLoginForm] = useState({ rut: '', password: '' });
  const [services, setServices] = useState<CustomerService[]>([]);
  const [contracts, setContracts] = useState<Array<{ idContrato: number; estado: string; plan?: Plan | null; servicios?: CustomerService[] }>>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [tvip, setTvip] = useState<TvipCredentialSummary[]>([]);
  const [ticketForm, setTicketForm] = useState({ idCategoria: '', idServicio: '', prioridad: 'Media', descripcion: '' });
  const [wifiForm, setWifiForm] = useState({ idServicio: '', nuevaContrasena: '', observaciones: '' });
  const [temporaryTvPassword, setTemporaryTvPassword] = useState<{ idContrato: number; password: string } | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const auth = (value = token) => ({ headers: { Authorization: `Bearer ${value}` } });

  useEffect(() => {
    if (token) {
      void loadPortalData(token, true);
    }
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setStatus('');

    try {
      const { data } = await api.post<{ portalToken: string; customer: PortalCustomer }>('/portal/login', {
        rut: normalizeRutInput(loginForm.rut),
        password: loginForm.password,
      });
      localStorage.setItem('finet_portal_token', data.portalToken);
      localStorage.setItem('finet_portal_customer', JSON.stringify(data.customer));
      setToken(data.portalToken);
      setCustomer(data.customer);
      await loadPortalData(data.portalToken, true);
      setStatus('Sesion portal iniciada');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadPortalData(nextToken = token, silent = false) {
    try {
      const [servicesResult, contractsResult, ticketsResult, categoriesResult, tvipResult] = await Promise.all([
        api.get<CustomerService[]>('/portal/services', auth(nextToken)),
        api.get<Array<{ idContrato: number; estado: string; plan?: Plan | null; servicios?: CustomerService[] }>>('/portal/contracts', auth(nextToken)),
        api.get<Ticket[]>('/portal/tickets', auth(nextToken)),
        api.get<TicketCategory[]>('/portal/ticket-categories', auth(nextToken)),
        api.get<TvipCredentialSummary[]>('/portal/tvip', auth(nextToken)),
      ]);
      setServices(servicesResult.data);
      setContracts(contractsResult.data);
      setTickets(ticketsResult.data);
      setCategories(categoriesResult.data);
      setTvip(tvipResult.data);
      if (!silent) {
        setStatus('Portal actualizado');
      }
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function createPortalTicket(event: FormEvent) {
    event.preventDefault();

    if (!ticketForm.idCategoria || ticketForm.descripcion.trim().length < 10) {
      setStatus('Selecciona categoría y describe el problema con al menos 10 caracteres.');
      return;
    }

    try {
      await api.post('/portal/tickets', {
        idCategoria: Number(ticketForm.idCategoria),
        idServicio: ticketForm.idServicio ? Number(ticketForm.idServicio) : undefined,
        prioridad: ticketForm.prioridad,
        descripcion: ticketForm.descripcion.trim(),
      }, auth());
      setTicketForm({ idCategoria: '', idServicio: '', prioridad: 'Media', descripcion: '' });
      await loadPortalData(token, true);
      setStatus('Ticket creado desde portal');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function requestWifiChange(event: FormEvent) {
    event.preventDefault();

    if (!wifiForm.idServicio) {
      setStatus('Selecciona el servicio para registrar la solicitud Wi-Fi.');
      return;
    }

    try {
      const { data } = await api.post<{ mensaje: string }>('/portal/wifi-change-request', {
        idServicio: Number(wifiForm.idServicio),
        nuevaContrasena: wifiForm.nuevaContrasena.trim() || undefined,
        observaciones: wifiForm.observaciones.trim() || undefined,
      }, auth());
      setWifiForm({ idServicio: '', nuevaContrasena: '', observaciones: '' });
      await loadPortalData(token, true);
      setStatus(data.mensaje);
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function regeneratePortalTvip(idContrato: number) {
    try {
      const { data } = await api.post<TvipGenerationResult>('/portal/tvip/regenerate', { idContrato }, auth());
      setTemporaryTvPassword({ idContrato, password: data.temporaryPassword });
      await loadPortalData(token, true);
      setStatus('Credencial TV IP generada. La clave temporal se muestra solo una vez.');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  function logoutPortal() {
    localStorage.removeItem('finet_portal_token');
    localStorage.removeItem('finet_portal_customer');
    setToken('');
    setCustomer(null);
    setServices([]);
    setContracts([]);
    setTickets([]);
    setTvip([]);
    setStatus('');
  }

  if (!token || !customer) {
    return (
      <main className="login-shell portal-login-shell">
        <section className="login-card" aria-label="Acceso Portal Cliente">
          <section className="login-panel">
            <div className="login-heading">
              <h1>Portal Cliente</h1>
              <p>Consulta tus servicios, tickets y solicitudes técnicas.</p>
            </div>
            <form className="stack" onSubmit={login}>
              <label>
                RUT
                <input value={loginForm.rut} onChange={(event) => setLoginForm({ ...loginForm, rut: event.target.value })} placeholder="12345678-5" />
              </label>
              <label>
                Contraseña portal
                <input type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} />
              </label>
              <button className="login-button" disabled={loading}>{loading ? 'Ingresando...' : 'Ingresar al portal'}</button>
            </form>
            {status && <p className="inline-status">{status}</p>}
            <button type="button" className="secondary portal-entry-button" onClick={onBack}>Volver al CRM interno</button>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="portal-shell">
      <header className="portal-topbar">
        <div>
          <span className="eyebrow">Portal Cliente</span>
          <h1>{customer.nombreCompleto}</h1>
          <p>{customer.rut ?? 'Sin RUT'} - Estado: {customer.estado}</p>
        </div>
        <div className="button-row">
          <button type="button" className="secondary" onClick={() => void loadPortalData()}>Actualizar</button>
          <button type="button" className="secondary" onClick={logoutPortal}>Cerrar portal</button>
          <button type="button" className="secondary" onClick={onBack}>CRM interno</button>
        </div>
      </header>
      {status && <p className="inline-status">{status}</p>}
      <section className="portal-grid">
        <article className="panel stack">
          <h2>Mis servicios</h2>
          {!services.length && <p className="inline-status">No hay servicios contratados registrados.</p>}
          {services.map((service) => (
            <section className="compact-list-item" key={service.idServicio}>
              <strong>{service.tipoServicio} - {service.estadoOperativo}</strong>
              <span>Plan: {service.contrato?.plan?.nombreComercial ?? 'Sin plan asociado'}</span>
              <span>Direccion: {service.direccion?.direccionCompleta ?? 'Sin direccion'}</span>
            </section>
          ))}
        </article>
        <article className="panel stack">
          <h2>Mis contratos</h2>
          {!contracts.length && <p className="inline-status">No hay contratos visibles.</p>}
          {contracts.map((contract) => (
            <section className="compact-list-item" key={contract.idContrato}>
              <strong>Contrato {contract.idContrato} - {contract.estado}</strong>
              <span>{contract.plan?.nombreComercial ?? 'Sin plan'}</span>
            </section>
          ))}
        </article>
        <form className="panel stack" onSubmit={createPortalTicket}>
          <h2>Crear ticket</h2>
          <label>
            Servicio
            <select value={ticketForm.idServicio} onChange={(event) => setTicketForm({ ...ticketForm, idServicio: event.target.value })}>
              <option value="">Ticket general</option>
              {services.map((service) => <option key={service.idServicio} value={service.idServicio}>Servicio {service.idServicio} - {service.tipoServicio}</option>)}
            </select>
          </label>
          <label>
            Categoria
            <select value={ticketForm.idCategoria} onChange={(event) => setTicketForm({ ...ticketForm, idCategoria: event.target.value })}>
              <option value="">Seleccionar</option>
              {categories.map((category) => <option key={category.idCategoria} value={category.idCategoria}>{category.nombre}</option>)}
            </select>
          </label>
          <label>
            Prioridad
            <select value={ticketForm.prioridad} onChange={(event) => setTicketForm({ ...ticketForm, prioridad: event.target.value })}>
              <option value="Alta">Alta</option>
              <option value="Media">Media</option>
              <option value="Baja">Baja</option>
            </select>
          </label>
          <label>
            Descripción
            <textarea value={ticketForm.descripcion} onChange={(event) => setTicketForm({ ...ticketForm, descripcion: event.target.value })} />
          </label>
          <button disabled={!ticketForm.idCategoria}>Crear ticket</button>
        </form>
        <form className="panel stack" onSubmit={requestWifiChange}>
          <h2>Solicitud cambio Wi-Fi</h2>
          <p className="detail-line">El portal registra la solicitud para revisión técnica; no cambia el router automáticamente.</p>
          <label>
            Servicio
            <select value={wifiForm.idServicio} onChange={(event) => setWifiForm({ ...wifiForm, idServicio: event.target.value })}>
              <option value="">Seleccionar servicio</option>
              {services.map((service) => <option key={service.idServicio} value={service.idServicio}>Servicio {service.idServicio} - {service.tipoServicio}</option>)}
            </select>
          </label>
          <label>
            Nueva clave sugerida
            <input type="password" value={wifiForm.nuevaContrasena} onChange={(event) => setWifiForm({ ...wifiForm, nuevaContrasena: event.target.value })} />
          </label>
          <label>
            Observaciones
            <textarea value={wifiForm.observaciones} onChange={(event) => setWifiForm({ ...wifiForm, observaciones: event.target.value })} />
          </label>
          <button disabled={!wifiForm.idServicio}>Registrar solicitud</button>
        </form>
        <article className="panel stack">
          <h2>Mis tickets</h2>
          {!tickets.length && <p className="inline-status">No tienes tickets registrados.</p>}
          {tickets.map((ticket) => (
            <section className="compact-list-item" key={ticket.idTicket}>
              <strong>{ticket.codigoSeguimiento ?? `Ticket ${ticket.idTicket}`}</strong>
              <span>{ticket.categoria?.nombre ?? 'Sin categoría'} - {ticket.prioridad} - {ticket.estado}</span>
              <span>{ticket.descripcion ?? '-'}</span>
            </section>
          ))}
        </article>
        <article className="panel stack">
          <h2>TV IP</h2>
          {!tvip.length && <p className="inline-status">Tu plan actual no incluye TV IP.</p>}
          {tvip.map((credential) => (
            <section className="compact-list-item" key={credential.idContrato}>
              <strong>{credential.plan?.nombreComercial ?? `Contrato ${credential.idContrato}`}</strong>
              <span>Usuario: {credential.credencial?.usuarioTvip ?? 'Sin generar'}</span>
              <button type="button" className="secondary compact" onClick={() => void regeneratePortalTvip(credential.idContrato)}>
                {credential.credencial ? 'Regenerar credencial' : 'Generar credencial'}
              </button>
              {temporaryTvPassword?.idContrato === credential.idContrato && (
                <p className="inline-status">Password temporal: <strong>{temporaryTvPassword.password}</strong>. Guardar ahora; no se volvera a mostrar.</p>
              )}
            </section>
          ))}
        </article>
      </section>
    </main>
  );
}

function Dashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [scope, setScope] = useState('consolidado');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusedInstallationProspectId, setFocusedInstallationProspectId] = useState<number | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryUnit[]>([]);
  const [advancedInventory, setAdvancedInventory] = useState<AdvancedInventory | null>(null);
  const [billingOverview, setBillingOverview] = useState<BillingOverview | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketCategories, setTicketCategories] = useState<TicketCategory[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [message, setMessage] = useState('');
  const isAdmin = hasPermission(user.roles, 'manageCompanyScope');
  const permissions = getDashboardPermissions(user.roles);
  const canManageCustomers = permissions.viewCustomers;
  const canViewInventory = permissions.viewInventory;
  const canViewBilling = permissions.viewBilling;
  const canViewTickets = permissions.viewTickets;
  const canViewInstallations = permissions.viewInstallations;
  const canViewWorkOrders = permissions.viewWorkOrders;

  const writeCompanyId = useMemo(() => {
    if (scope !== 'consolidado') {
      return Number(scope);
    }

    return user.idEmpresa ?? companies[0]?.idEmpresa ?? 1;
  }, [companies, scope, user.idEmpresa]);

  async function loadData() {
    setMessage('');
    const errors: string[] = [];
    const loadCustomers = canManageCustomers || permissions.installEquipment;
    const [
      summaryResult,
      prospectsResult,
      plansResult,
      customersResult,
      inventoryResult,
      advancedInventoryResult,
      billingResult,
      ticketsResult,
      categoriesResult,
      workOrdersResult,
    ] = await Promise.allSettled([
      api.get<Summary>('/companies/summary', { params: { scope } }),
      api.get<Prospect[]>('/prospects', { params: { scope } }),
      api.get<Plan[]>('/plans', { params: { scope, includeInactive: permissions.managePlans ? 'true' : undefined } }),
      loadCustomers ? api.get<Customer[]>('/customers', { params: { scope } }) : Promise.resolve({ data: [] as Customer[] }),
      canViewInventory ? api.get<InventoryUnit[]>('/inventory', { params: { scope } }) : Promise.resolve({ data: [] as InventoryUnit[] }),
      canViewInventory ? api.get<AdvancedInventory>('/inventory/advanced', { params: { scope } }) : Promise.resolve({ data: null as AdvancedInventory | null }),
      canViewBilling ? api.get<BillingOverview>('/billing/overview', { params: { scope } }) : Promise.resolve({ data: null as BillingOverview | null }),
      canViewTickets ? api.get<Ticket[]>('/tickets', { params: { scope } }) : Promise.resolve({ data: [] as Ticket[] }),
      canViewTickets ? api.get<TicketCategory[]>('/tickets/categories') : Promise.resolve({ data: [] as TicketCategory[] }),
      canViewWorkOrders ? api.get<WorkOrder[]>('/work-orders', { params: { scope } }) : Promise.resolve({ data: [] as WorkOrder[] }),
    ]);
    const summaryData = settledData(summaryResult, null as Summary | null, errors);

    setSummary(summaryData);
    setCompanies(summaryData?.empresas ?? []);
    setProspects(settledData(prospectsResult, [] as Prospect[], errors));
    setPlans(settledData(plansResult, [] as Plan[], errors));
    setCustomers(settledData(customersResult, [] as Customer[], errors));
    setInventory(settledData(inventoryResult, [] as InventoryUnit[], errors));
    setAdvancedInventory(settledData(advancedInventoryResult, null as AdvancedInventory | null, errors));
    setBillingOverview(settledData(billingResult, null as BillingOverview | null, errors));
    setTickets(settledData(ticketsResult, [] as Ticket[], errors));
    setTicketCategories(settledData(categoriesResult, [] as TicketCategory[], errors));
    setWorkOrders(settledData(workOrdersResult, [] as WorkOrder[], errors));

    if (isAdmin) {
      const [usersResult, rolesResult, auditResult] = await Promise.allSettled([
        api.get<UserRow[]>('/users'),
        api.get<Role[]>('/users/roles'),
        api.get<AuditLog[]>('/audit', { params: { limit: 40 } }),
      ]);
      setUsers(settledData(usersResult, [] as UserRow[], errors));
      setRoles(settledData(rolesResult, [] as Role[], errors));
      setAudit(settledData(auditResult, [] as AuditLog[], errors));
    }

    if (errors.length) {
      setMessage([...new Set(errors)].join(' | '));
    }
  }

  useEffect(() => {
    void loadData();
  }, [scope]);

  function logout() {
    localStorage.removeItem('finet_token');
    localStorage.removeItem('finet_user');
    onLogout();
  }

  const currentCompanyName = companies.find((company) => company.idEmpresa === writeCompanyId)?.nombre ?? 'FiNet Limitada';
  const userInitials = user.nombreCompleto
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const mainNavItems: NavItem[] = [
    { tab: 'dashboard', label: 'Dashboard', visible: true, icon: House },
    { tab: 'prospects', label: 'Prospectos', visible: permissions.viewProspects, icon: UserRoundPlus },
    { tab: 'customers', label: 'Clientes', visible: canManageCustomers, icon: Users },
    { tab: 'installations', label: 'Instalaciones', visible: canViewInstallations, icon: Router },
    { tab: 'inventory', label: 'Inventario', visible: canViewInventory, icon: Boxes },
    { tab: 'plans', label: 'Planes', visible: permissions.managePlans, icon: ClipboardList },
    { tab: 'billing', label: 'Cobranza', visible: canViewBilling, icon: HandCoins },
    { tab: 'tickets', label: 'Tickets', visible: canViewTickets, icon: TicketIcon },
    { tab: 'workOrders', label: 'Órdenes de Trabajo', visible: canViewWorkOrders, icon: ClipboardList },
    { tab: 'reports', label: 'Reportes', visible: permissions.viewReports, icon: BarChart3 },
    { tab: 'audit', label: 'Auditoría', visible: permissions.viewAudit, icon: FileClock },
  ];
  const secondaryNavItems: NavItem[] = [
    { tab: 'import', label: 'Importación', visible: permissions.viewImport, icon: FileUp },
    { tab: 'users', label: 'Usuarios', visible: permissions.viewUsers, icon: UserCog },
  ];

  return (
    <main className="crm-shell">
      <Sidebar
        activeTab={activeTab}
        mainItems={mainNavItems}
        secondaryItems={secondaryNavItems}
        onNavigate={setActiveTab}
      />

      <section className="crm-main">
        <Topbar
          isAdmin={isAdmin}
          scope={scope}
          companies={companies}
          currentCompanyName={currentCompanyName}
          user={user}
          userInitials={userInitials}
          onScopeChange={setScope}
          onOpenSettings={() => setSettingsOpen(true)}
          onLogout={logout}
        />
        <Modal title="Configuración" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
          <section className="user-settings-card">
            <header className="user-settings-heading">
              <span className="profile-avatar profile-avatar-settings" aria-hidden="true">{userInitials || 'U'}</span>
              <div>
                <span className="eyebrow">Perfil activo</span>
                <h3>{user.nombreCompleto}</h3>
                <p>Información de la sesión actual.</p>
              </div>
            </header>
            <dl className="user-settings-details">
              <div>
                <dt>Correo</dt>
                <dd>{user.email ?? 'Sin correo registrado'}</dd>
              </div>
              <div>
                <dt>Empresa</dt>
                <dd>{currentCompanyName}</dd>
              </div>
              <div>
                <dt>Rol</dt>
                <dd>{user.roles.join(', ') || 'Sin rol asignado'}</dd>
              </div>
            </dl>
          </section>
        </Modal>

        {message && <p className="alert app-alert">{message}</p>}

        <section className="content-shell">
          {activeTab === 'dashboard' && (
            <DashboardHome
              summary={summary}
              prospects={prospects}
              customers={customers}
              tickets={tickets}
              workOrders={workOrders}
              permissions={permissions}
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === 'prospects' && permissions.viewProspects && (
            <ProspectsPanel
              prospects={prospects}
              plans={plans}
              writeCompanyId={writeCompanyId}
              permissions={permissions}
              onOpenInstallation={(idProspecto) => {
                setFocusedInstallationProspectId(idProspecto);
                setActiveTab('installations');
              }}
              onCreated={() => void loadData()}
            />
          )}
          {activeTab === 'installations' && canViewInstallations && (
            <InstallationsPanel
              prospects={prospects}
              workOrders={workOrders}
              focusedProspectId={focusedInstallationProspectId}
              onFocusConsumed={() => setFocusedInstallationProspectId(null)}
              onChanged={() => void loadData()}
            />
          )}
          {activeTab === 'customers' && canManageCustomers && (
            <CustomersPanel customers={customers} plans={plans} scope={scope} permissions={permissions} onChanged={() => void loadData()} />
          )}
          {activeTab === 'inventory' && canViewInventory && (
            <InventoryPanel
              inventory={inventory}
              advancedInventory={advancedInventory}
              customers={customers}
              workOrders={workOrders}
              writeCompanyId={writeCompanyId}
              permissions={permissions}
              onChanged={() => void loadData()}
            />
          )}
          {activeTab === 'plans' && permissions.managePlans && (
            <PlansPanel
              plans={plans}
              companies={companies}
              writeCompanyId={writeCompanyId}
              onChanged={() => void loadData()}
            />
          )}
          {activeTab === 'billing' && canViewBilling && (
            <BillingPanel
              overview={billingOverview}
              plans={plans}
              scope={scope}
              writeCompanyId={writeCompanyId}
              permissions={permissions}
              onChanged={() => void loadData()}
            />
          )}
          {activeTab === 'tickets' && canViewTickets && (
            <TicketsPanel tickets={tickets} categories={ticketCategories} permissions={permissions} users={users} onChanged={() => void loadData()} />
          )}
          {activeTab === 'workOrders' && canViewWorkOrders && <WorkOrdersPanel workOrders={workOrders} onChanged={() => void loadData()} />}
          {activeTab === 'reports' && permissions.viewReports && <ReportsPanel companies={companies} initialScope={scope} />}
          {activeTab === 'import' && permissions.viewImport && (
            <ImportPanel writeCompanyId={writeCompanyId} onImported={() => void loadData()} />
          )}
          {activeTab === 'users' && permissions.viewUsers && (
            <UsersPanel users={users} roles={roles} onUpdated={() => void loadData()} />
          )}
          {activeTab === 'audit' && permissions.viewAudit && <AuditPanel audit={audit} />}
        </section>
      </section>
    </main>
  );
}
