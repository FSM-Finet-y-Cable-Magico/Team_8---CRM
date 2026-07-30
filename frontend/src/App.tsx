import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  CalendarPlus,
  ChevronDown,
  CircleCheckBig,
  ClipboardList,
  FileClock,
  FileUp,
  HandCoins,
  House,
  LogOut,
  Router,
  Settings,
  Ticket as TicketIcon,
  TrendingDown,
  UserCog,
  UserRoundPlus,
  Users,
  Wifi,
  Wrench,
  X,
  type LucideIcon,
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
  CustomerService,
  InstallAvailability,
  InventoryUnit,
  MonitoringStatus,
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
import { DashboardPermissions, getDashboardPermissions, hasPermission, normalizeUserRoles } from './permissions';

type Tab =
  | 'dashboard'
  | 'prospects'
  | 'installations'
  | 'customers'
  | 'inventory'
  | 'billing'
  | 'tickets'
  | 'workOrders'
  | 'reports'
  | 'import'
  | 'users'
  | 'audit';

type NavItem = {
  tab: Tab;
  label: string;
  visible: boolean;
  icon: LucideIcon;
};

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
  };
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

type ProspectFormState = {
  rut: string;
  nombreCompleto: string;
  email: string;
  telefono: string;
  direccion: string;
  origenContacto: string;
};

const emptyProspectForm: ProspectFormState = {
  rut: '',
  nombreCompleto: '',
  email: '',
  telefono: '',
  direccion: '',
  origenContacto: 'Formulario web',
};

const rutPattern = /^\d{7,8}-[\dkK]$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const chileanMobilePattern = /^\+?56?9\d{8}$/;
const macPattern = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
const reportMinimumDate = '2020-01-01';

function normalizeRutInput(value: string) {
  return value.trim().replace(/\./g, '').toUpperCase();
}

function dateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addYearsToInputDate(value: string, years: number) {
  const [year, month, day] = value.split('-').map(Number);
  return dateInputValue(new Date(year + years, month - 1, day));
}

function parseDateValue(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateOnly(value?: string | null) {
  const dateOnly = value?.slice(0, 10);

  if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const [year, month, day] = dateOnly.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('es-CL');
  }

  const date = parseDateValue(value);
  return date ? date.toLocaleDateString('es-CL') : 'Sin dato';
}

function formatConnectionType(value?: WorkOrder['tipoConexion']) {
  if (value === 'Fibra Optica') {
    return 'Fibra Óptica';
  }

  if (value === 'Television') {
    return 'Televisión';
  }

  return 'Sin dato';
}

function normalizeWorkOrderValue(value?: string | null) {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase('es-CL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatWorkOrderValue(value?: string | null) {
  const normalized = normalizeWorkOrderValue(value);
  const knownLabels: Record<string, string> = {
    instalacion: 'Instalación',
    reparacion: 'Reparación',
    mantenimiento: 'Mantenimiento',
    soporte: 'Soporte',
    alta: 'Alta',
    media: 'Media',
    baja: 'Baja',
    critica: 'Crítica',
    urgente: 'Urgente',
    pendiente: 'Pendiente',
    abierto: 'Abierto',
    programada: 'Programada',
    escalado: 'Escalado',
    resuelto: 'Resuelto',
    cerrado: 'Cerrado',
    completada: 'Completada',
    cerrada: 'Cerrada',
    cancelada: 'Cancelada',
    'en progreso': 'En progreso',
  };

  if (!normalized) {
    return 'Sin dato';
  }

  return knownLabels[normalized] ?? normalized
    .split(/\s+/)
    .map((word) => `${word.charAt(0).toLocaleUpperCase('es-CL')}${word.slice(1)}`)
    .join(' ');
}

function formatDateTime(value?: string | null) {
  const date = parseDateValue(value);
  return date ? date.toLocaleString('es-CL') : 'Sin dato';
}

function technicalEntries(data?: Record<string, unknown> | null) {
  return Object.entries(data ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`);
}

function normalizeAuthUser(user: AuthUser) {
  return {
    ...user,
    roles: normalizeUserRoles(user.roles),
  };
}

function settledData<T>(
  result: PromiseSettledResult<{ data: T }>,
  fallback: T,
  errors: string[],
) {
  if (result.status === 'fulfilled') {
    return result.value.data;
  }

  errors.push(apiErrorMessage(result.reason));
  return fallback;
}

function validateProspectForm(form: ProspectFormState) {
  const rut = normalizeRutInput(form.rut);
  const nombreCompleto = form.nombreCompleto.trim();
  const email = form.email.trim().toLowerCase();
  const telefono = form.telefono.trim();
  const direccion = form.direccion.trim();
  const origenContacto = form.origenContacto.trim();

  if (!rutPattern.test(rut)) {
    return 'Ingresa el RUT con guion, por ejemplo 12345678-5.';
  }

  if (nombreCompleto.length < 5) {
    return 'Ingresa nombre y apellido del prospecto.';
  }

  if (email && !emailPattern.test(email)) {
    return 'Ingresa un correo valido, por ejemplo correo@ejemplo.cl.';
  }

  if (!chileanMobilePattern.test(telefono.replace(/\s/g, ''))) {
    return 'Ingresa un celular chileno, por ejemplo +56912345678.';
  }

  if (direccion.length < 8) {
    return 'Ingresa una direccion con calle, numero y comuna.';
  }

  if (!origenContacto) {
    return 'Selecciona el origen de contacto del prospecto.';
  }

  return '';
}

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

function LoginScreen({ onLogin, onOpenPortal }: { onLogin: (user: AuthUser) => void; onOpenPortal: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/auth/login', { email, password });
      const normalizedUser = normalizeAuthUser(data.user);
      localStorage.setItem('finet_token', data.accessToken);
      localStorage.setItem('finet_user', JSON.stringify(normalizedUser));
      onLogin(normalizedUser);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-label="Acceso al sistema CRM">
        <section className="login-panel">
          <div className="login-heading">
            <h1>Sistema de Gestión CRM</h1>
            <p>FiNet y Cable Mágico Litoral · Administración comercial, clientes y soporte.</p>
          </div>
          <form onSubmit={submit} className="stack" autoComplete="off">
            <label>
              Correo
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="off"
                placeholder="correo@finet.local"
              />
            </label>
            <label>
              Contraseña
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="off"
                placeholder="Ingresa tu contraseña"
              />
            </label>
            {error && <p className="alert">{error}</p>}
            <button className="login-button" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
          <button type="button" className="secondary portal-entry-button" onClick={onOpenPortal}>
            Ingresar al portal cliente
          </button>
        </section>
      </section>
    </main>
  );
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
      api.get<Plan[]>('/plans', { params: { scope } }),
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
        <header className="topbar">
          <div className="topbar-context">
            {isAdmin && (
              <div className="company-scope-control">
                <Building2 size={18} strokeWidth={1.8} aria-hidden="true" />
                <select aria-label="Seleccionar empresa" value={scope} onChange={(event) => setScope(event.target.value)}>
                  <option value="consolidado">Consolidado</option>
                  {companies.map((company) => (
                    <option key={company.idEmpresa} value={company.idEmpresa}>
                      {company.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="active-company" aria-label={`Empresa activa: ${currentCompanyName}`}>
              <strong>{currentCompanyName}</strong>
              <span className="company-status-dot" aria-hidden="true" />
            </div>
            <details className="profile-menu">
              <summary className="profile-trigger" aria-label="Abrir menú de perfil">
                <span className="profile-avatar" aria-hidden="true">{userInitials || 'U'}</span>
                <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
              </summary>
              <div className="profile-dropdown">
                <header className="profile-summary">
                  <span className="profile-avatar profile-avatar-large" aria-hidden="true">{userInitials || 'U'}</span>
                  <span>
                    <strong>{user.nombreCompleto}</strong>
                    <small>{user.email ?? 'Sin correo registrado'}</small>
                  </span>
                </header>
                <button
                  type="button"
                  className="profile-menu-item"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    setSettingsOpen(true);
                  }}
                >
                  <Settings size={18} strokeWidth={1.8} aria-hidden="true" />
                  Configuración
                </button>
                <button type="button" className="profile-menu-item danger" onClick={logout}>
                  <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
                  Cerrar sesión
                </button>
              </div>
            </details>
          </div>
        </header>

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
            <CustomersPanel customers={customers} scope={scope} permissions={permissions} onChanged={() => void loadData()} />
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
          {activeTab === 'billing' && canViewBilling && (
            <BillingPanel
              overview={billingOverview}
              permissions={permissions}
              onChanged={() => void loadData()}
            />
          )}
          {activeTab === 'tickets' && canViewTickets && (
            <TicketsPanel tickets={tickets} categories={ticketCategories} permissions={permissions} onChanged={() => void loadData()} />
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

function Sidebar({
  activeTab,
  mainItems,
  secondaryItems,
  onNavigate,
}: {
  activeTab: Tab;
  mainItems: NavItem[];
  secondaryItems: NavItem[];
  onNavigate: (tab: Tab) => void;
}) {
  const visibleSecondaryItems = secondaryItems.filter((item) => item.visible);

  return (
    <aside className="sidebar">
      <div className="brand" aria-label="smartCRM">
        <Wifi className="brand-icon" size={34} strokeWidth={2.35} aria-hidden="true" />
        <strong>
          <span>smart</span>CRM
        </strong>
      </div>

      <div className="sidebar-menu">
        <nav className="sidebar-nav" aria-label="Navegación principal">
          {mainItems.filter((item) => item.visible).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.tab}
                type="button"
                className={activeTab === item.tab ? 'sidebar-item active' : 'sidebar-item'}
                onClick={() => onNavigate(item.tab)}
                aria-current={activeTab === item.tab ? 'page' : undefined}
              >
                <Icon className="sidebar-item-icon" size={19} strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {visibleSecondaryItems.length > 0 && (
          <nav className="sidebar-nav secondary-nav" aria-label="Administración">
            {visibleSecondaryItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.tab}
                  type="button"
                  className={activeTab === item.tab ? 'sidebar-item active' : 'sidebar-item'}
                  onClick={() => onNavigate(item.tab)}
                  aria-current={activeTab === item.tab ? 'page' : undefined}
                >
                  <Icon className="sidebar-item-icon" size={19} strokeWidth={1.8} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </aside>
  );
}

function DashboardHome({
  summary,
  prospects,
  customers,
  tickets,
  workOrders,
  permissions,
  onNavigate,
}: {
  summary: Summary | null;
  prospects: Prospect[];
  customers: Customer[];
  tickets: Ticket[];
  workOrders: WorkOrder[];
  permissions: DashboardPermissions;
  onNavigate: (tab: Tab) => void;
}) {
  const [expiryFilter, setExpiryFilter] = useState<'overdue' | 'upcoming'>('upcoming');
  const [alertsModalOpen, setAlertsModalOpen] = useState(false);
  const [selectedAlertKey, setSelectedAlertKey] = useState<string | null>(null);
  const pendingInstallations = workOrders.filter(
    (order) => order.tipoOt === 'Instalacion' && !['Completada', 'Cerrada', 'Cancelada'].includes(order.estado),
  ).length;
  const openTickets = tickets.filter((ticket) => !['Resuelto', 'Cerrado'].includes(ticket.estado)).length;
  const stats = [
    {
      label: 'Prospectos activos',
      value: summary?.metricas.prospectos ?? prospects.length,
      description: 'Oportunidades registradas',
      icon: UserRoundPlus,
      tone: 'mint' as const,
    },
    {
      label: 'Clientes activos',
      value: summary?.metricas.clientes ?? customers.length,
      description: 'Clientes de la vista actual',
      icon: Users,
      tone: 'teal' as const,
    },
    {
      label: 'Instalaciones pendientes',
      value: summary?.metricas.instalacionesPendientes ?? pendingInstallations,
      description: 'Por coordinar o finalizar',
      icon: Wrench,
      tone: 'blue' as const,
    },
    {
      label: 'Tickets abiertos',
      value: summary?.metricas.ticketsAbiertos ?? openTickets,
      description: 'Casos todavía en atención',
      icon: TicketIcon,
      tone: 'orange' as const,
    },
    {
      label: 'Clientes morosos',
      value: summary?.metricas.clientesMorosos ?? 0,
      description: 'Con deuda o suspensión',
      icon: HandCoins,
      tone: 'rose' as const,
    },
    {
      label: 'Inventario disponible',
      value: summary?.metricas.inventarioDisponible ?? 0,
      description: 'Equipos listos para asignar',
      icon: Boxes,
      tone: 'violet' as const,
    },
    {
      label: 'Instalaciones del mes',
      value: summary?.metricas.instalacionesMensuales ?? 0,
      description: 'Completadas durante el mes',
      icon: CircleCheckBig,
      tone: 'green' as const,
    },
    {
      label: 'Churn mensual',
      value: `${summary?.metricas.churnRateMensual ?? 0}%`,
      description: `${summary?.metricas.churnBajasMensuales ?? 0} baja(s) durante el mes`,
      icon: TrendingDown,
      tone: 'amber' as const,
    },
  ];
  const quickActions = [
    {
      label: 'Nuevo prospecto',
      description: 'Registrar oportunidad comercial',
      icon: UserRoundPlus,
      tone: 'mint' as const,
      tab: 'prospects' as Tab,
      visible: permissions.createProspects || permissions.viewProspects,
    },
    {
      label: 'Crear ticket',
      description: 'Atender solicitud de soporte',
      icon: TicketIcon,
      tone: 'orange' as const,
      tab: 'tickets' as Tab,
      visible: permissions.viewTickets,
    },
    {
      label: 'Agendar instalación',
      description: 'Coordinar visita técnica',
      icon: CalendarPlus,
      tone: 'blue' as const,
      tab: 'installations' as Tab,
      visible: permissions.viewInstallations,
    },
    {
      label: 'Nueva orden',
      description: 'Revisar órdenes de trabajo',
      icon: ClipboardList,
      tone: 'violet' as const,
      tab: 'workOrders' as Tab,
      visible: permissions.viewWorkOrders,
    },
  ];
  const expiryAlerts = summary?.alertasVencimiento ?? [];
  const overdueAlerts = expiryAlerts.filter((alert) => alert.diasRestantes < 0);
  const upcomingAlerts = expiryAlerts.filter((alert) => alert.diasRestantes >= 0 && alert.diasRestantes <= 7);
  const filteredExpiryAlerts = expiryFilter === 'overdue' ? overdueAlerts : upcomingAlerts;
  const selectedAlert = filteredExpiryAlerts.find((alert) => expiryAlertKey(alert) === selectedAlertKey)
    ?? filteredExpiryAlerts[0]
    ?? null;
  const selectedCustomer = selectedAlert?.idCliente
    ? customers.find((customer) => customer.idCliente === selectedAlert.idCliente) ?? null
    : null;

  function selectExpiryFilter(filter: 'overdue' | 'upcoming') {
    setExpiryFilter(filter);
    setSelectedAlertKey(null);
  }

  function openExpiryDetails(alert?: ExpiryAlert) {
    setSelectedAlertKey(alert ? expiryAlertKey(alert) : null);
    setAlertsModalOpen(true);
  }

  return (
    <section className="dashboard-home">
      <div className="page-heading">
        <h1>Dashboard operativo</h1>
      </div>

      <section className="stat-grid">
        {stats.map((stat) => (
          <DashboardStatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="dashboard-insights">
        <article className="panel stack expiry-panel">
          <div className="expiry-panel-header">
            <div className="section-heading">
              <h2>Alertas de vencimiento</h2>
              <p>Revisa contratos vencidos o próximos a vencer.</p>
            </div>
            <div className="expiry-filters" role="group" aria-label="Filtrar alertas de vencimiento">
              <button
                type="button"
                className={expiryFilter === 'overdue' ? 'expiry-filter active' : 'expiry-filter'}
                aria-pressed={expiryFilter === 'overdue'}
                onClick={() => selectExpiryFilter('overdue')}
              >
                Vencidos
                <span>{overdueAlerts.length}</span>
              </button>
              <button
                type="button"
                className={expiryFilter === 'upcoming' ? 'expiry-filter active' : 'expiry-filter'}
                aria-pressed={expiryFilter === 'upcoming'}
                onClick={() => selectExpiryFilter('upcoming')}
              >
                Próximos 7 días
                <span>{upcomingAlerts.length}</span>
              </button>
            </div>
          </div>
          {filteredExpiryAlerts.length > 0 ? (
            <>
              <div className="expiry-alert-list">
                {filteredExpiryAlerts.slice(0, 4).map((alert) => (
                  <div
                    key={expiryAlertKey(alert)}
                    className={`expiry-alert-item expiry-alert-item-${expiryUrgency(alert.diasRestantes)}`}
                  >
                    <div className="expiry-alert-copy">
                      <button type="button" className="expiry-client-link" onClick={() => openExpiryDetails(alert)}>
                        {alert.cliente}
                      </button>
                      <span>{alert.plan ?? 'Plan sin detalle'} · {formatDateOnly(alert.fechaVencimiento)}</span>
                    </div>
                    <ExpiryBadge days={alert.diasRestantes} />
                  </div>
                ))}
              </div>
              <button type="button" className="expiry-view-more" onClick={() => openExpiryDetails()}>
                Ver más
                <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </>
          ) : (
            <p className="empty-state">
              {expiryFilter === 'overdue'
                ? 'No hay contratos vencidos para mostrar.'
                : 'No hay contratos próximos a vencer durante los próximos 7 días.'}
            </p>
          )}

          <Modal
            title={expiryFilter === 'overdue' ? 'Contratos vencidos' : 'Próximos vencimientos'}
            open={alertsModalOpen}
            onClose={() => setAlertsModalOpen(false)}
          >
            <div className="expiry-modal-layout">
              <section className="expiry-modal-list-panel" aria-label="Clientes con alertas">
                <p>
                  {filteredExpiryAlerts.length} cliente(s) en esta lista
                </p>
                <div className="expiry-modal-list">
                  {filteredExpiryAlerts.map((alert) => (
                    <button
                      key={expiryAlertKey(alert)}
                      type="button"
                      className={expiryAlertKey(alert) === expiryAlertKey(selectedAlert)
                        ? `expiry-modal-item expiry-alert-item-${expiryUrgency(alert.diasRestantes)} selected`
                        : `expiry-modal-item expiry-alert-item-${expiryUrgency(alert.diasRestantes)}`}
                      onClick={() => setSelectedAlertKey(expiryAlertKey(alert))}
                    >
                      <span>
                        <strong>{alert.cliente}</strong>
                        <small>{alert.rut ?? 'RUT no registrado'} · {alert.plan ?? 'Plan sin detalle'}</small>
                      </span>
                      <ExpiryBadge days={alert.diasRestantes} />
                    </button>
                  ))}
                </div>
              </section>

              {selectedAlert ? (
                <ExpiryCustomerCard alert={selectedAlert} customer={selectedCustomer} />
              ) : (
                <p className="empty-state">Selecciona un cliente para revisar sus datos.</p>
              )}
            </div>
          </Modal>
        </article>

        <article className="panel stack">
          <div className="section-heading">
            <h2>Tickets cerrados por falla</h2>
            <p>Resumen mensual por categoría de soporte.</p>
          </div>
          {(summary?.ticketsCerradosPorTipo?.length ?? 0) > 0 ? (
            <div className="compact-list">
              {summary?.ticketsCerradosPorTipo?.map((item) => (
                <div key={item.idCategoria} className="compact-list-item">
                  <strong>{item.categoria}</strong>
                  <span>{item.total} ticket(s) cerrado(s)</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No hay tickets cerrados en el periodo actual.</p>
          )}
        </article>
      </section>

      <section className="dashboard-actions">
        <div className="section-heading">
          <h2>Acciones rápidas</h2>
        </div>
        <div className="quick-actions">
          {quickActions.filter((action) => action.visible).map((action) => (
            <QuickActionCard key={action.label} {...action} onNavigate={onNavigate} />
          ))}
        </div>
      </section>
    </section>
  );
}

type ExpiryAlert = NonNullable<Summary['alertasVencimiento']>[number];

function expiryAlertKey(alert?: ExpiryAlert | null) {
  return alert ? `${alert.idContrato}-${alert.fechaVencimiento}` : '';
}

function expiryUrgency(days: number) {
  if (days < 0) return 'overdue';
  if (days <= 1) return 'critical';
  if (days <= 3) return 'near';
  if (days <= 5) return 'soon';
  return 'scheduled';
}

function expiryLabel(days: number) {
  if (days < 0) {
    const overdueDays = Math.abs(days);
    return `${overdueDays} día${overdueDays === 1 ? '' : 's'} vencido`;
  }

  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence mañana';
  return `Vence en ${days} días`;
}

function ExpiryBadge({ days }: { days: number }) {
  return <span className={`expiry-badge expiry-badge-${expiryUrgency(days)}`}>{expiryLabel(days)}</span>;
}

function ExpiryCustomerCard({ alert, customer }: { alert: ExpiryAlert; customer: Customer | null }) {
  const company = customer?.empresa?.nombre ?? customer?.empresas?.join(', ') ?? 'Sin empresa registrada';

  return (
    <article className="expiry-customer-card">
      <header>
        <span className="expiry-customer-avatar" aria-hidden="true">
          <Users size={21} strokeWidth={1.8} />
        </span>
        <div>
          <h3>{customer?.nombreCompleto ?? alert.cliente}</h3>
        </div>
        <StatusBadge value={customer?.estado ?? alert.estado} />
      </header>

      <dl className="expiry-customer-data">
        <div>
          <dt>RUT</dt>
          <dd>{customer?.rut ?? alert.rut ?? 'No registrado'}</dd>
        </div>
        <div>
          <dt>Teléfono</dt>
          <dd>{customer?.telefono ?? 'No registrado'}</dd>
        </div>
        <div>
          <dt>Correo</dt>
          <dd>{customer?.email ?? 'No registrado'}</dd>
        </div>
        <div>
          <dt>Empresa</dt>
          <dd>{company}</dd>
        </div>
        <div>
          <dt>Origen</dt>
          <dd>{customer?.origenContacto ?? 'No registrado'}</dd>
        </div>
      </dl>

      <div className="expiry-contract-card">
        <span>Contrato #{alert.idContrato}</span>
        <strong>{alert.plan ?? 'Plan sin detalle'}</strong>
        <small>Vencimiento: {formatDateOnly(alert.fechaVencimiento)}</small>
        <ExpiryBadge days={alert.diasRestantes} />
      </div>
    </article>
  );
}

type StatCardTone = 'mint' | 'teal' | 'blue' | 'orange' | 'rose' | 'violet' | 'green' | 'amber';

function DashboardStatCard({
  label,
  value,
  description,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  tone: StatCardTone;
}) {
  return (
    <article className={`dashboard-stat-card dashboard-stat-card-${tone}`}>
      <span className="dashboard-stat-card-icon" aria-hidden="true">
        <Icon size={21} strokeWidth={1.8} />
      </span>
      <div className="dashboard-stat-card-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{description}</small>
      </div>
    </article>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <article className="stat-card">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </article>
  );
}

function QuickActionCard({
  label,
  description,
  icon: Icon,
  tone,
  tab,
  onNavigate,
}: {
  label: string;
  description: string;
  icon: LucideIcon;
  tone: StatCardTone;
  tab: Tab;
  onNavigate: (tab: Tab) => void;
}) {
  return (
    <button type="button" className={`quick-action-card quick-action-card-${tone}`} onClick={() => onNavigate(tab)}>
      <span className="quick-action-icon" aria-hidden="true">
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <span className="quick-action-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <ArrowRight className="quick-action-arrow" size={17} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

function StatusBadge({ value }: { value?: string | null }) {
  const normalized = (value ?? 'Sin dato').toLowerCase();
  const tone = normalized.includes('crítica') || normalized.includes('critica')
    ? 'critical'
    : normalized.includes('cerrad') || normalized.includes('completad') || normalized.includes('resuelt') || normalized.includes('activ')
      ? 'success'
      : normalized.includes('alta') || normalized.includes('urgente') || normalized.includes('escalado') || normalized.includes('perdido') || normalized.includes('cancelad')
        ? 'danger'
        : normalized.includes('media') || normalized.includes('pendiente') || normalized.includes('programada') || normalized.includes('abierto') || normalized.includes('progreso')
          ? 'warning'
          : 'neutral';

  return <span className={`status-badge ${tone}`}>{value ?? 'Sin dato'}</span>;
}

function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close-button" aria-label="Cerrar modal" onClick={onClose}>
            <X size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>
        <div className="modal-content">{children}</div>
      </section>
    </div>
  );
}

function ProspectsPanel({
  prospects,
  plans,
  writeCompanyId,
  permissions,
  onOpenInstallation,
  onCreated,
}: {
  prospects: Prospect[];
  plans: Plan[];
  writeCompanyId: number;
  permissions: DashboardPermissions;
  onOpenInstallation: (idProspecto: number) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<ProspectFormState>(emptyProspectForm);
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selectedProspect = prospects.find((prospect) => prospect.idProspecto === selectedId) ?? null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus('');
    const validationMessage = validateProspectForm(form);

    if (validationMessage) {
      setStatus(validationMessage);
      return;
    }

    try {
      await api.post('/prospects', {
        rut: normalizeRutInput(form.rut),
        nombreCompleto: form.nombreCompleto.trim(),
        email: form.email.trim().toLowerCase() || undefined,
        telefono: form.telefono.trim().replace(/\s/g, ''),
        direccion: form.direccion.trim(),
        origenContacto: form.origenContacto.trim(),
        idEmpresa: writeCompanyId,
      });
      setForm(emptyProspectForm);
      setStatus('Prospecto creado');
      onCreated();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  return (
    <section className="workspace-grid">
      {permissions.createProspects && (
        <form className="stack prospect-create-form" onSubmit={submit}>
          <h2>Registro</h2>
          <label>
            RUT
            <input
              value={form.rut}
              onChange={(event) => setForm({ ...form, rut: event.target.value })}
              placeholder="12345678-5"
              required
            />
          </label>
          <label>
            Nombre completo
            <input
              value={form.nombreCompleto}
              onChange={(event) => setForm({ ...form, nombreCompleto: event.target.value })}
              placeholder="Nombre Apellido"
              maxLength={120}
              required
            />
          </label>
          <label>
            Email
            <input
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="correo@ejemplo.cl"
              type="email"
              maxLength={120}
            />
          </label>
          <label>
            Celular
            <input
              value={form.telefono}
              onChange={(event) => setForm({ ...form, telefono: event.target.value })}
              placeholder="+56912345678"
              maxLength={20}
              required
            />
          </label>
          <label>
            Origen de contacto
            <select
              value={form.origenContacto}
              onChange={(event) => setForm({ ...form, origenContacto: event.target.value })}
            >
              {['Formulario web', 'Telefono', 'Sucursal', 'Referido', 'Redes sociales', 'Terreno'].map((origin) => (
                <option key={origin} value={origin}>
                  {origin}
                </option>
              ))}
            </select>
          </label>
          <label>
            Direccion
            <input
              value={form.direccion}
              onChange={(event) => setForm({ ...form, direccion: event.target.value })}
              placeholder="Av. Siempre Viva 123, Comuna"
              maxLength={200}
              required
            />
          </label>
          {status && <p className="inline-status">{status}</p>}
          <button>Registrar prospecto</button>
        </form>
      )}

      <section className="prospects-list-section">
        <h2>Gestión de Prospectos</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>RUT</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Origen</th>
                <th>Empresa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((prospect) => (
                <tr key={prospect.idProspecto}>
                  <td>{prospect.rut}</td>
                  <td>{prospect.nombreCompleto}</td>
                  <td>{prospect.estadoPipeline}</td>
                  <td>{prospect.origenContacto ?? '-'}</td>
                  <td>{prospect.empresa?.nombre ?? '-'}</td>
                  <td>
                    <button type="button" className="secondary compact" onClick={() => setSelectedId(prospect.idProspecto)}>
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Modal
          title="Gestionar prospecto"
          open={Boolean(selectedProspect)}
          onClose={() => setSelectedId(null)}
        >
          {selectedProspect && (
            <ProspectWorkflowPanel
              prospect={selectedProspect}
              plans={plans}
              permissions={permissions}
              onOpenInstallation={() => {
                setSelectedId(null);
                onOpenInstallation(selectedProspect.idProspecto);
              }}
              onChanged={onCreated}
            />
          )}
        </Modal>
      </section>
    </section>
  );
}

function ProspectWorkflowPanel({
  prospect,
  plans,
  permissions,
  onOpenInstallation,
  onChanged,
}: {
  prospect: Prospect;
  plans: Plan[];
  permissions: DashboardPermissions;
  onOpenInstallation: () => void;
  onChanged: () => void;
}) {
  const [pipelineStatus, setPipelineStatus] = useState(prospect.estadoPipeline ?? 'Prospecto Nuevo');
  const [feasibilityResult, setFeasibilityResult] = useState<'Factible' | 'No Factible'>('Factible');
  const [quotePlanId, setQuotePlanId] = useState('');
  const [lossReason, setLossReason] = useState('Sin cobertura');
  const [contractPlanId, setContractPlanId] = useState('');
  const [dueDay, setDueDay] = useState(5);
  const [status, setStatus] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);

  useEffect(() => {
    setPipelineStatus(prospect.estadoPipeline ?? 'Prospecto Nuevo');
  }, [prospect.idProspecto, prospect.estadoPipeline]);

  const planOptions = plans.filter((plan) => !plan.idEmpresa || !prospect.empresa || plan.idEmpresa === prospect.empresa.idEmpresa);

  async function runAction(action: () => Promise<unknown>, success: string) {
    setStatus('');
    setStatusIsError(false);

    try {
      await action();
      setStatus(success);
      onChanged();
    } catch (err) {
      setStatusIsError(true);
      setStatus(apiErrorMessage(err));
    }
  }

  async function generateQuote() {
    setStatus('');
    setStatusIsError(false);

    try {
      const { data } = await api.post(`/prospects/${prospect.idProspecto}/quotes`, { planId: Number(quotePlanId) });
      const pdf = await api.get(data.pdfUrl, { responseType: 'blob' });
      const objectUrl = URL.createObjectURL(pdf.data);
      window.open(objectUrl, '_blank');
      setStatus(
        data.envioEmail === 'sent'
          ? `Cotización generada y enviada automáticamente a ${prospect.email}`
          : data.envioEmail === 'failed'
            ? 'Cotización generada, pero el servidor de correo rechazó el envío.'
            : 'Cotización generada. Configura SMTP para enviarla automáticamente por correo.',
      );
      onChanged();
    } catch (err) {
      setStatusIsError(true);
      setStatus(apiErrorMessage(err));
    }
  }

  return (
    <div className="workflow-panel modal-workflow prospect-workflow">
      <section className="prospect-overview">
        <header className="prospect-overview-header">
          <span className="prospect-avatar" aria-hidden="true">
            <UserRoundPlus size={22} strokeWidth={1.8} />
          </span>
          <div>
            <h3>{prospect.nombreCompleto}</h3>
            <p>{prospect.rut ?? 'RUT no registrado'}</p>
          </div>
          <StatusBadge value={prospect.estadoPipeline} />
        </header>
        <dl className="prospect-overview-data">
          <div>
            <dt>Teléfono</dt>
            <dd>{prospect.telefono ?? 'No registrado'}</dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd>{prospect.email ?? 'No registrado'}</dd>
          </div>
          <div>
            <dt>Origen</dt>
            <dd>{prospect.origenContacto ?? 'No registrado'}</dd>
          </div>
        </dl>
      </section>

      <div className="workflow-grid prospect-action-grid">
        {permissions.manageProspectPipeline && (
          <section className="prospect-action-card prospect-action-card-mint">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <ClipboardList size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Estado del prospecto</h4>
                <p>Actualiza su avance dentro del pipeline.</p>
              </div>
            </header>
            <label>
              Estado
              <select value={pipelineStatus} onChange={(event) => setPipelineStatus(event.target.value)}>
                {prospect.estadoPipeline === 'Perdido' && (
                  <option value="Perdido" disabled>
                    Perdido - selecciona un estado para reactivar
                  </option>
                )}
                {[
                  'Prospecto Nuevo',
                  'Contactado',
                  'En Factibilidad',
                  'Cotizacion Enviada',
                  'Aceptado',
                  'Instalacion Programada',
                  'Servicio Activo',
                ].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                void runAction(
                  () => api.patch(`/prospects/${prospect.idProspecto}/pipeline`, { estadoPipeline: pipelineStatus }),
                  prospect.estadoPipeline === 'Perdido' ? 'Prospecto reactivado y pipeline actualizado' : 'Pipeline actualizado',
                )
              }
            >
              Actualizar estado
            </button>
          </section>
        )}

        {permissions.verifyFeasibility && (
          <section className="prospect-action-card prospect-action-card-blue">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <Wrench size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Factibilidad técnica</h4>
                <p>Registra el resultado de la evaluación.</p>
              </div>
            </header>
            <label>
              Resultado
              <select value={feasibilityResult} onChange={(event) => setFeasibilityResult(event.target.value as 'Factible' | 'No Factible')}>
                <option value="Factible">Factible</option>
                <option value="No Factible">No Factible</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                void runAction(
                  () => api.post(`/prospects/${prospect.idProspecto}/feasibility`, { resultado: feasibilityResult }),
                  'Factibilidad registrada',
                )
              }
            >
              Registrar factibilidad
            </button>
          </section>
        )}

        {permissions.generateQuotes && (
          <section className="prospect-action-card prospect-action-card-violet">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <FileClock size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Generar cotización</h4>
                <p>Crea el documento PDF para el cliente.</p>
              </div>
            </header>
            <label>
              Plan a cotizar
              <select value={quotePlanId} onChange={(event) => setQuotePlanId(event.target.value)}>
                <option value="">Seleccionar plan</option>
                {planOptions.map((plan) => (
                  <option key={plan.idPlan} value={plan.idPlan}>
                    {plan.nombreComercial}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={!quotePlanId} onClick={() => void generateQuote()}>
              Generar cotización
            </button>
          </section>
        )}

        {permissions.recordProspectLoss && (
          <section className="prospect-action-card prospect-action-card-loss">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <TrendingDown size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Marcar como perdido</h4>
                <p>Indica por qué no continuará la oportunidad.</p>
              </div>
            </header>
            <label>
              Motivo
              <select value={lossReason} onChange={(event) => setLossReason(event.target.value)}>
                {['Sin cobertura', 'Precio', 'No responde', 'Competencia', 'Otro'].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void runAction(
                  () => api.post(`/prospects/${prospect.idProspecto}/loss`, { motivo: lossReason }),
                  'Motivo de perdida registrado',
                )
              }
            >
              Marcar como perdido
            </button>
          </section>
        )}

        {permissions.contractPlans && (
          <section className="prospect-action-card prospect-action-card-contract prospect-action-card-orange">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <HandCoins size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Registrar contratación</h4>
                <p>Asocia el plan contratado y su día de vencimiento.</p>
              </div>
            </header>
            <div className="prospect-contract-fields">
              <label>
                Plan contratado
                <select value={contractPlanId} onChange={(event) => setContractPlanId(event.target.value)}>
                  <option value="">Seleccionar plan</option>
                  {planOptions.map((plan) => (
                    <option key={plan.idPlan} value={plan.idPlan}>
                      {plan.nombreComercial}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Día de vencimiento
                <input
                  min="1"
                  max="28"
                  type="number"
                  value={dueDay}
                  onChange={(event) => setDueDay(Number(event.target.value))}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!contractPlanId}
              onClick={() =>
                void runAction(
                  () =>
                    api.post(`/prospects/${prospect.idProspecto}/contracts`, {
                      planId: Number(contractPlanId),
                      diaVencimiento: dueDay,
                    }),
                  'Plan contratado registrado',
                )
              }
            >
              Registrar plan contratado
            </button>
          </section>
        )}

        {permissions.createInstallOrders && prospect.estadoPipeline === 'Aceptado' && Boolean(prospect.idCliente) && (
          <section className="prospect-action-card prospect-action-card-installation prospect-action-card-green">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <CalendarPlus size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Agendar instalación</h4>
                <p>Continúa el proceso coordinando la visita técnica.</p>
              </div>
            </header>
            <button type="button" onClick={onOpenInstallation}>
              Generar instalación
            </button>
          </section>
        )}
      </div>

      {status && <p className={statusIsError ? 'alert' : 'inline-status'}>{status}</p>}
    </div>
  );
}

function InstallationsPanel({
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

function InstallOrderForm({ prospect, onChanged }: { prospect: Prospect; onChanged: () => void }) {
  const [form, setForm] = useState({
    tipoConexion: '',
    fechaProgramada: '',
    horaVisita: '',
    prioridad: 'Media',
    observaciones: '',
  });
  const [availability, setAvailability] = useState<InstallAvailability | null>(null);
  const [technicianId, setTechnicianId] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const today = dateInputValue(new Date());
  const latestInstallDate = addYearsToInputDate(today, 1);
  const hasContractedPlan = Boolean(prospect.idCliente);
  const canCreate = prospect.estadoPipeline === 'Aceptado' && hasContractedPlan;

  useEffect(() => {
    setForm({
      tipoConexion: '',
      fechaProgramada: '',
      horaVisita: '',
      prioridad: 'Media',
      observaciones: '',
    });
    setAvailability(null);
    setTechnicianId('');
    setStatus('');
    setError('');
  }, [prospect.idProspecto]);

  function updateSchedule(field: 'fechaProgramada' | 'horaVisita', value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setAvailability(null);
    setTechnicianId('');
    setStatus('');
    setError('');
  }

  function validateRequiredFields() {
    if (!form.tipoConexion || !form.fechaProgramada || !form.horaVisita) {
      return 'Completa tipo de conexión, fecha y hora de la visita.';
    }

    if (form.fechaProgramada < today) {
      return 'La fecha de instalación no puede ser anterior a hoy.';
    }

    if (form.fechaProgramada > latestInstallDate) {
      return 'La fecha de instalación no puede superar un año desde hoy.';
    }

    return '';
  }

  async function checkAvailability() {
    setStatus('');
    setError('');
    const validationError = validateRequiredFields();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const { data } = await api.get<InstallAvailability>(
        `/prospects/${prospect.idProspecto}/install-availability`,
        {
          params: {
            fechaProgramada: form.fechaProgramada,
            horaVisita: form.horaVisita,
          },
        },
      );
      setAvailability(data);
      setTechnicianId(data.tecnicosDisponibles[0] ? String(data.tecnicosDisponibles[0].idTecnico) : '');

      if (data.tecnicosDisponibles.length) {
        setStatus(data.mensaje);
      } else {
        setError(data.mensaje);
      }
    } catch (err) {
      setAvailability(null);
      setTechnicianId('');
      setError(apiErrorMessage(err));
    }
  }

  function selectAlternative(alternative: InstallAvailability['alternativas'][number]) {
    setForm((current) => ({
      ...current,
      fechaProgramada: alternative.fechaProgramada,
      horaVisita: alternative.horaVisita,
    }));
    setAvailability({
      fechaProgramada: alternative.fechaProgramada,
      horaVisita: alternative.horaVisita,
      tecnicosDisponibles: alternative.tecnicosDisponibles,
      alternativas: [],
      mensaje: 'Horario alternativo seleccionado. Confirma el técnico asignado.',
    });
    setTechnicianId(
      alternative.tecnicosDisponibles[0] ? String(alternative.tecnicosDisponibles[0].idTecnico) : '',
    );
    setError('');
    setStatus('Horario alternativo seleccionado. Confirma el técnico asignado.');
  }

  async function createInstallOrder() {
    setStatus('');
    setError('');
    const validationError = validateRequiredFields();

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!technicianId) {
      setError('Verifica la disponibilidad y selecciona un técnico antes de crear la orden.');
      return;
    }

    try {
      const { data } = await api.post(`/prospects/${prospect.idProspecto}/install-orders`, {
        ...form,
        idTecnico: Number(technicianId),
      });
      setStatus(
        `Orden de Instalación ${data.orden.idOt} creada y asignada a ${data.orden.tecnico.nombreCompleto}. ` +
        `El prospecto avanzó a Instalación Programada.`,
      );
      setAvailability(null);
      setTechnicianId('');
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div className="install-order-form">
      <h3>Generar orden de instalación</h3>
      <p className="detail-line">
        Prospecto: {prospect.nombreCompleto} - Estado: {prospect.estadoPipeline}
      </p>
      {prospect.estadoPipeline === 'Aceptado' && !hasContractedPlan && (
        <p className="alert">Primero registra correctamente el plan contratado del prospecto.</p>
      )}
      {prospect.estadoPipeline !== 'Aceptado' && (
        <p className="inline-status">La orden de instalación ya fue generada para este prospecto.</p>
      )}
      <div className="install-form-grid">
        <label>
          Tipo de conexión
          <select
            value={form.tipoConexion}
            disabled={!canCreate}
            onChange={(event) => {
              setForm((current) => ({ ...current, tipoConexion: event.target.value }));
              setError('');
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
            disabled={!canCreate}
            value={form.fechaProgramada}
            onChange={(event) => updateSchedule('fechaProgramada', event.target.value)}
          />
        </label>
        <label>
          Hora de la visita
          <input
            type="time"
            disabled={!canCreate}
            value={form.horaVisita}
            onChange={(event) => updateSchedule('horaVisita', event.target.value)}
          />
        </label>
        <label>
          Prioridad
          <select
            value={form.prioridad}
            disabled={!canCreate}
            onChange={(event) => setForm((current) => ({ ...current, prioridad: event.target.value }))}
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
            disabled={!canCreate}
            value={form.observaciones}
            onChange={(event) => setForm((current) => ({ ...current, observaciones: event.target.value }))}
          />
        </label>
      </div>
      <button type="button" className="secondary" disabled={!canCreate} onClick={() => void checkAvailability()}>
        Verificar disponibilidad técnica
      </button>

      {availability?.tecnicosDisponibles.length ? (
        <label>
          Técnico asignado
          <select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}>
            {availability.tecnicosDisponibles.map((technician) => (
              <option key={technician.idTecnico} value={technician.idTecnico}>
                {technician.nombreCompleto}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {availability && !availability.tecnicosDisponibles.length && availability.alternativas.length > 0 && (
        <div className="alternative-slots">
          <strong>Horarios alternativos sugeridos</strong>
          <div className="button-row">
            {availability.alternativas.map((alternative) => (
              <button
                key={`${alternative.fechaProgramada}-${alternative.horaVisita}`}
                type="button"
                className="secondary compact"
                onClick={() => selectAlternative(alternative)}
              >
                {alternative.fechaProgramada} {alternative.horaVisita} ({alternative.tecnicosDisponibles.length} técnico(s))
              </button>
            ))}
          </div>
        </div>
      )}

      <button type="button" disabled={!canCreate || !technicianId} onClick={() => void createInstallOrder()}>
        Generar Orden de Instalación
      </button>
      {error && <p className="alert">{error}</p>}
      {status && <p className="inline-status">{status}</p>}
    </div>
  );
}

type CustomerHistory = {
  contratos: Array<{ idContrato: number; estado: string | null; plan?: Plan | null }>;
  servicios: CustomerService[];
  tickets: Array<{ idTicket: number; estado: string; prioridad: string; descripcion: string | null }>;
  ordenes: Array<{ idOt: number; tipoOt: string; estado: string; observaciones: string | null }>;
  equipos: Array<{ idUnidad: number; numeroSerie: string; estado: string; modelo: string | null }>;
  auditoria: Array<{ idLog: string; accion: string; fechaHora: string | null }>;
};

const serviceTypeOptions = ['Internet', 'Television', 'Internet + Television'];
const serviceStatusOptions = ['Activo', 'Pendiente Instalacion', 'Suspendido', 'Baja'];

function emptyServiceForm() {
  return {
    idContrato: '',
    tipoServicio: 'Internet',
    estadoOperativo: 'Pendiente Instalacion',
    observaciones: '',
    tecnologia: '',
    velocidad: '',
    macAddress: '',
    puertoOlt: '',
    ipAsignada: '',
    observacionesTecnicas: '',
  };
}

function CustomersPanel({
  customers,
  scope,
  permissions,
  onChanged,
}: {
  customers: Customer[];
  scope: string;
  permissions: DashboardPermissions;
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusValue, setStatusValue] = useState('Activo');
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [status, setStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[] | null>(null);
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
  });
  const [managementOpen, setManagementOpen] = useState(false);
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus | null>(null);
  const [serviceMonitoringStatus, setServiceMonitoringStatus] = useState<MonitoringStatus | null>(null);
  const [tvipCredentials, setTvipCredentials] = useState<TvipCredentialSummary[]>([]);
  const [tvipTempPassword, setTvipTempPassword] = useState<{ idContrato: number; usuario: string | null; password: string } | null>(null);

  const visibleCustomers = searchResults ?? customers;
  const selectedCustomer = visibleCustomers.find((customer) => customer.idCliente === selectedId) ?? null;
  const selectedService =
    services.find((service) => service.idServicio === selectedServiceId) ?? services[0] ?? null;
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
      return;
    }

    if (permissions.viewMonitoring) {
      void loadServiceMonitoring(selectedService.idServicio, true);
    }

    const technicalData = selectedService.datosTecnicos ?? {};

    setServiceUpdateForm({
      idContrato: selectedService.idContrato ? String(selectedService.idContrato) : '',
      tipoServicio: selectedService.tipoServicio,
      estadoOperativo: selectedService.estadoOperativo,
      observaciones: selectedService.observaciones ?? '',
      tecnologia: String(technicalData.tecnologia ?? ''),
      velocidad: String(technicalData.velocidad ?? technicalData.velocidadMbps ?? ''),
      macAddress: String(technicalData.macAddress ?? ''),
      puertoOlt: String(technicalData.puertoOlt ?? ''),
      ipAsignada: String(technicalData.ipAsignada ?? ''),
      observacionesTecnicas: String(technicalData.observacionesTecnicas ?? ''),
    });
  }, [selectedService?.idServicio]);

  useEffect(() => {
    setSearchResults(null);
    setSearchTerm('');
  }, [scope]);

  async function searchCustomers(event: FormEvent) {
    event.preventDefault();
    const term = searchTerm.trim();

    if (!term) {
      setSearchResults(null);
      setStatus('');
      return;
    }

    try {
      const { data } = await api.get<Customer[]>('/customers', { params: { scope, query: term } });
      setSearchResults(data);
      setSelectedId(null);
      setManagementOpen(false);
      setStatus(data.length ? `${data.length} cliente(s) encontrado(s)` : 'No se encontraron clientes');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  function clearSearch() {
    setSearchTerm('');
    setSearchResults(null);
    setSelectedId(null);
    setManagementOpen(false);
    setStatus('');
  }

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
      setSearchResults((current) =>
        current?.map((customer) =>
          customer.idCliente === data.idCliente ? { ...customer, ...data } : customer,
        ) ?? null,
      );
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
        tipoServicio: serviceCreateForm.tipoServicio,
        estadoOperativo: serviceCreateForm.estadoOperativo,
        observaciones: serviceCreateForm.observaciones.trim() || undefined,
        tecnologia: serviceCreateForm.tecnologia.trim() || undefined,
        velocidad: serviceCreateForm.velocidad.trim() || undefined,
        macAddress: serviceCreateForm.macAddress.trim() || undefined,
        puertoOlt: serviceCreateForm.puertoOlt.trim() || undefined,
        ipAsignada: serviceCreateForm.ipAsignada.trim() || undefined,
        observacionesTecnicas: serviceCreateForm.observacionesTecnicas.trim() || undefined,
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
        observaciones: serviceUpdateForm.observaciones.trim() || undefined,
        tecnologia: serviceUpdateForm.tecnologia.trim() || undefined,
        velocidad: serviceUpdateForm.velocidad.trim() || undefined,
        macAddress: serviceUpdateForm.macAddress.trim() || undefined,
        puertoOlt: serviceUpdateForm.puertoOlt.trim() || undefined,
        ipAsignada: serviceUpdateForm.ipAsignada.trim() || undefined,
        observacionesTecnicas: serviceUpdateForm.observacionesTecnicas.trim() || undefined,
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
      });
      setEquipmentForm({ numeroSerie: '', modelo: '', macAddress: '', puertoOlt: '', observaciones: '' });
      await loadServicesForCustomer(selectedCustomer.idCliente, true, selectedService.idServicio);
      setStatus('Equipo asociado al servicio contratado');
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  return (
    <section className="customers-module">
      <section className="customers-list-panel">
        <div className="section-heading">
          <h2>Clientes</h2>
        </div>
        <form className="customer-search" onSubmit={searchCustomers}>
          <label>
            Buscar cliente
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por RUT, nombre, teléfono o contrato"
            />
          </label>
          <div className="button-row">
            <button type="submit">Buscar</button>
            {searchResults && (
              <button type="button" className="secondary" onClick={clearSearch}>
                Limpiar
              </button>
            )}
          </div>
        </form>
        {status && !managementOpen && <p className="inline-status">{status}</p>}
        <div className="table-wrap">
          <table>
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
              {visibleCustomers.map((customer) => (
                <tr key={customer.idCliente}>
                  <td>{customer.rut ?? '-'}</td>
                  <td>{customer.nombreCompleto}</td>
                  <td>{customerCompanyLabel(customer)}</td>
                  <td><StatusBadge value={customer.estado} /></td>
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
        {!visibleCustomers.length && (
          <p className="empty-state">
            {searchResults ? 'No se encontraron clientes con los criterios ingresados.' : 'No hay clientes registrados para mostrar.'}
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
                  <dd>{String(selectedCustomer.datosTecnicos?.direccion ?? 'No registrada')}</dd>
                </div>
                <div>
                  <dt>Plan principal</dt>
                  <dd>{customerMainPlan(selectedCustomer)}</dd>
                </div>
              </dl>
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
                        {['Activo', 'Suspendido', 'En Mantencion', 'Moroso', 'Baja'].map((item) => (
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
                    {history && (
                      <div className="history-grid">
                        <HistoryBox title="Contratos" value={history.contratos.length} />
                        <HistoryBox title="Servicios" value={history.servicios.length} />
                        <HistoryBox title="Tickets" value={history.tickets.length} />
                        <HistoryBox title="OTs" value={history.ordenes.length} />
                        <HistoryBox title="Equipos" value={history.equipos.length} />
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
                              {!selectedService.tickets?.length && !selectedService.ordenes?.length && (
                                <li>No hay solicitudes ni visitas asociadas.</li>
                              )}
                            </ul>
                          </section>
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
    </section>
  );
}

function BillingPanel({
  overview,
  permissions,
  onChanged,
}: {
  overview: BillingOverview | null;
  permissions: DashboardPermissions;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState('');
  const [paymentTarget, setPaymentTarget] = useState<BillingOverview['morosos'][number] | null>(null);
  const [paymentForm, setPaymentForm] = useState({ monto: '', pasarela: 'Transferencia', codigoTransaccion: '' });

  useEffect(() => {
    if (paymentTarget) {
      setPaymentForm({ monto: String(paymentTarget.saldo), pasarela: 'Transferencia', codigoTransaccion: '' });
    }
  }, [paymentTarget?.idFactura]);

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      setStatus('');
      await action();
      setStatus(success);
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function registerPayment(event: FormEvent) {
    event.preventDefault();

    if (!paymentTarget) {
      return;
    }

    const amount = Number(paymentForm.monto);

    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus('Ingresa un monto valido para registrar el pago.');
      return;
    }

    await run(
      () => api.post('/billing/payments', {
        idFactura: paymentTarget.idFactura,
        monto: amount,
        pasarela: paymentForm.pasarela.trim(),
        codigoTransaccion: paymentForm.codigoTransaccion.trim() || undefined,
      }),
      'Pago registrado y estado de cobranza actualizado',
    );
    setPaymentTarget(null);
  }

  const morosos = overview?.morosos ?? [];
  const cortes = overview?.cortesProgramados ?? [];
  const notifications = overview?.notificaciones ?? [];

  return (
    <section className="billing-module stack">
      <div className="page-heading">
        <h1>Cobranza</h1>
        <p>Gestion de morosidad, cortes programados, avisos preventivos y pagos registrados.</p>
      </div>

      <section className="stat-grid billing-stats">
        <StatCard label="Clientes morosos" value={overview?.metricas.clientesMorosos ?? 0} hint="Con deuda vencida" />
        <StatCard label="Facturas vencidas" value={overview?.metricas.facturasVencidas ?? 0} hint="Pendientes de pago" />
        <StatCard label="Programados para corte" value={overview?.metricas.clientesProgramadosCorte ?? 0} hint={`Regla: ${overview?.reglaCorteDias ?? 5} día(s)`} />
        <StatCard label="Notificacion" value={overview?.modoNotificacion ?? 'mock'} hint="Modo de envio actual" />
      </section>

      {permissions.manageBilling && (
        <div className="button-row">
          <button type="button" onClick={() => void run(() => api.post('/billing/refresh-delinquency'), 'Clientes morosos actualizados')}>
            Actualizar morosidad
          </button>
        </div>
      )}

      {status && <p className="inline-status">{status}</p>}

      <section className="panel stack">
        <div className="section-heading">
          <h2>Clientes morosos</h2>
          <p>Facturas vencidas calculadas con fecha actual, pagos registrados y contrato asociado.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>RUT</th>
                <th>Plan</th>
                <th>Vencimiento</th>
                <th>Saldo</th>
                <th>Atraso</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {morosos.map((row) => (
                <tr key={row.idFactura}>
                  <td>{row.cliente.nombreCompleto}</td>
                  <td>{row.cliente.rut ?? '-'}</td>
                  <td>{row.contrato.plan ?? '-'}</td>
                  <td>{formatDateOnly(row.fechaLimitePago)}</td>
                  <td>${row.saldo.toLocaleString('es-CL')}</td>
                  <td>{row.diasAtraso} día(s)</td>
                  <td><StatusBadge value={row.cliente.estado} /></td>
                  <td>
                    {permissions.manageBilling && (
                      <div className="table-actions">
                        <button className="secondary compact" type="button" onClick={() => setPaymentTarget(row)}>
                          Registrar pago
                        </button>
                        <button
                          className="secondary compact"
                          type="button"
                          onClick={() => void run(() => api.post('/billing/notifications', { idCliente: row.cliente.idCliente, idFactura: row.idFactura, tipo: 'Preventiva' }), 'Aviso preventivo registrado')}
                        >
                          Aviso
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!morosos.length && <p className="empty-state">No hay clientes morosos para el alcance seleccionado.</p>}
      </section>

      <section className="panel stack">
        <div className="section-heading">
          <h2>Clientes programados para corte</h2>
          <p>Clientes cuya deuda supera la regla de días configurada para corte.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contrato</th>
                <th>Saldo</th>
                <th>Dias atraso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cortes.map((row) => (
                <tr key={`cut-${row.idFactura}`}>
                  <td>{row.cliente.nombreCompleto}</td>
                  <td>{row.idContrato}</td>
                  <td>${row.saldo.toLocaleString('es-CL')}</td>
                  <td>{row.diasAtraso}</td>
                  <td>
                    {permissions.manageBilling && (
                      <div className="table-actions">
                        <button
                          className="secondary compact"
                          type="button"
                          onClick={() => void run(() => api.post('/billing/notifications', { idCliente: row.cliente.idCliente, idFactura: row.idFactura, tipo: 'Ultimo aviso' }), 'Ultimo aviso registrado')}
                        >
                          Ultimo aviso
                        </button>
                        <button
                          className="secondary compact"
                          type="button"
                          onClick={() => void run(() => api.patch(`/billing/contracts/${row.idContrato}/suspend`), 'Servicio suspendido por no pago')}
                        >
                          Suspender
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!cortes.length && <p className="empty-state">No hay clientes dentro de regla de corte.</p>}
      </section>

      <section className="panel stack">
        <div className="section-heading">
          <h2>Notificaciones de cobranza</h2>
          <p>Historial de avisos registrados en modo simulado o desactivado.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Canal</th>
                <th>Estado envio</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((notification) => (
                <tr key={notification.idNotificacion}>
                  <td>{notification.idNotificacion}</td>
                  <td>{notification.idCliente ?? '-'}</td>
                  <td>{notification.canal ?? '-'}</td>
                  <td><StatusBadge value={notification.estadoEnvio} /></td>
                  <td>{formatDateTime(notification.fechaEnvio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!notifications.length && <p className="empty-state">Aun no hay notificaciones de cobranza registradas.</p>}
      </section>

      <Modal title="Registrar pago" open={Boolean(paymentTarget)} onClose={() => setPaymentTarget(null)}>
        {paymentTarget && (
          <form className="stack" onSubmit={registerPayment}>
            <section className="customer-preview">
              <h3>{paymentTarget.cliente.nombreCompleto}</h3>
              <p><strong>Factura:</strong> {paymentTarget.idFactura}</p>
              <p><strong>Saldo:</strong> ${paymentTarget.saldo.toLocaleString('es-CL')}</p>
            </section>
            <label>
              Monto pagado
              <input type="number" min="1" value={paymentForm.monto} onChange={(event) => setPaymentForm({ ...paymentForm, monto: event.target.value })} />
            </label>
            <label>
              Pasarela o medio
              <input value={paymentForm.pasarela} onChange={(event) => setPaymentForm({ ...paymentForm, pasarela: event.target.value })} />
            </label>
            <label>
              Codigo transaccion opcional
              <input value={paymentForm.codigoTransaccion} onChange={(event) => setPaymentForm({ ...paymentForm, codigoTransaccion: event.target.value })} />
            </label>
            <button>Guardar pago</button>
          </form>
        )}
      </Modal>
    </section>
  );
}
function MonitoringStatusView({ status }: { status: MonitoringStatus | null }) {
  if (!status) {
    return <p className="inline-status">Sin datos de monitoreo cargados.</p>;
  }

  return (
    <div className="monitoring-status-card">
      <p><strong>Estado:</strong> {status.estadoConexion}</p>
      <p>{status.mensaje}</p>
      <p><strong>Última medición:</strong> {formatDateTime(status.ultimaMedicion?.timestampMedicion)}</p>
      <p><strong>Potencia óptica:</strong> {status.ultimaMedicion?.potenciaActualDbm ?? 'No disponible'} dBm</p>
      <p><strong>Latencia:</strong> {status.latenciaEstado}</p>
      <p><strong>Equipo:</strong> {status.equipo?.numeroSerie ?? 'Sin equipo asociado'}</p>
      <p><strong>Caja NAP:</strong> {status.cajaNap?.identificadorUnico ?? status.cajaNap?.zona ?? 'Sin dato'}</p>
      {status.historial.length > 0 && (
        <ul className="compact-list">
          {status.historial.slice(0, 4).map((event) => (
            <li key={event.idHistorialOnt}>
              {event.evento ?? 'Evento'} - {formatDateTime(event.timestamp)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryBox({ title, value }: { title: string; value: string | number }) {
  return (
    <article className="history-box">
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

function InventoryAdvancedPanel({
  advancedInventory,
  workOrders,
  writeCompanyId,
  permissions,
  onChanged,
}: {
  advancedInventory: AdvancedInventory | null;
  workOrders: WorkOrder[];
  writeCompanyId: number;
  permissions: DashboardPermissions;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState('');
  const [consumableForm, setConsumableForm] = useState({ tipoNombre: '', bodegaNombre: '', cantidadDisponible: '0', umbralMinimo: '0' });
  const [movementForm, setMovementForm] = useState({ idStock: '', tipoMovimiento: 'Salida', cantidad: '1', idOt: '' });
  const [napForm, setNapForm] = useState({ identificadorUnico: '', zona: '', numeroPoste: '', capacidadPuertos: '8' });

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      setStatus('');
      await action();
      setStatus(success);
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function createConsumable(event: FormEvent) {
    event.preventDefault();

    if (!consumableForm.tipoNombre.trim() || !consumableForm.bodegaNombre.trim()) {
      setStatus('Indica tipo de consumible y bodega.');
      return;
    }

    await run(
      () => api.post('/inventory/consumables', {
        idEmpresa: writeCompanyId,
        tipoNombre: consumableForm.tipoNombre.trim(),
        bodegaNombre: consumableForm.bodegaNombre.trim(),
        cantidadDisponible: Number(consumableForm.cantidadDisponible),
        umbralMinimo: Number(consumableForm.umbralMinimo),
      }),
      'Stock consumible registrado',
    );
  }

  async function recordConsumableMovement(event: FormEvent) {
    event.preventDefault();

    if (!movementForm.idStock) {
      setStatus('Selecciona un consumible para registrar movimiento.');
      return;
    }

    await run(
      () => api.post(`/inventory/consumables/${movementForm.idStock}/movements`, {
        tipoMovimiento: movementForm.tipoMovimiento,
        cantidad: Number(movementForm.cantidad),
        idOt: movementForm.idOt ? Number(movementForm.idOt) : undefined,
      }),
      'Movimiento de consumible registrado',
    );
  }

  async function createNapBox(event: FormEvent) {
    event.preventDefault();

    if (!napForm.identificadorUnico.trim() || !napForm.zona.trim()) {
      setStatus('Indica identificador y zona de la caja NAP.');
      return;
    }

    await run(
      () => api.post('/inventory/nap-boxes', {
        idEmpresa: writeCompanyId,
        identificadorUnico: napForm.identificadorUnico.trim(),
        zona: napForm.zona.trim(),
        numeroPoste: napForm.numeroPoste.trim() || undefined,
        capacidadPuertos: Number(napForm.capacidadPuertos),
      }),
      'Caja NAP registrada',
    );
  }

  const consumibles = advancedInventory?.consumibles ?? [];
  const alertas = advancedInventory?.alertasStock ?? [];
  const cajasNap = advancedInventory?.cajasNap ?? [];
  const transferencias = advancedInventory?.transferencias ?? [];
  const usoMateriales = advancedInventory?.usoMateriales ?? [];
  const mantenciones = advancedInventory?.mantenciones ?? [];

  return (
    <section className="inventory-advanced full-width-panel stack">
      <section className="panel stack">
        <div className="section-heading">
          <h2>Inventario avanzado</h2>
          <p>Consumibles, cajas NAP, transferencias, mantenciones y consumo de materiales por OT.</p>
        </div>
        {status && <p className="inline-status">{status}</p>}
        <div className="advanced-summary-grid">
          <StatCard label="Consumibles" value={consumibles.length} hint="Materiales controlados" />
          <StatCard label="Stock bajo" value={alertas.length} hint="Bajo umbral minimo" />
          <StatCard label="Cajas NAP" value={cajasNap.length} hint="Registradas por zona" />
          <StatCard label="Uso materiales" value={usoMateriales.length} hint="Salidas asociadas a OT" />
        </div>
      </section>

      {permissions.manageInventory && (
        <section className="advanced-forms-grid">
          <form className="panel stack" onSubmit={createConsumable}>
            <h2>Stock consumible</h2>
            <input placeholder="Tipo de material, ej: Cable drop" value={consumableForm.tipoNombre} onChange={(event) => setConsumableForm({ ...consumableForm, tipoNombre: event.target.value })} />
            <input placeholder="Bodega" value={consumableForm.bodegaNombre} onChange={(event) => setConsumableForm({ ...consumableForm, bodegaNombre: event.target.value })} />
            <input type="number" min="0" placeholder="Cantidad" value={consumableForm.cantidadDisponible} onChange={(event) => setConsumableForm({ ...consumableForm, cantidadDisponible: event.target.value })} />
            <input type="number" min="0" placeholder="Umbral minimo" value={consumableForm.umbralMinimo} onChange={(event) => setConsumableForm({ ...consumableForm, umbralMinimo: event.target.value })} />
            <button>Registrar stock</button>
          </form>

          <form className="panel stack" onSubmit={recordConsumableMovement}>
            <h2>Movimiento de consumible</h2>
            <select value={movementForm.idStock} onChange={(event) => setMovementForm({ ...movementForm, idStock: event.target.value })}>
              <option value="">Seleccionar consumible</option>
              {consumibles.map((stock) => (
                <option key={stock.idStock} value={stock.idStock}>
                  {stock.tipoEquipo?.nombre ?? `Stock ${stock.idStock}`} - {stock.cantidadDisponible}
                </option>
              ))}
            </select>
            <select value={movementForm.tipoMovimiento} onChange={(event) => setMovementForm({ ...movementForm, tipoMovimiento: event.target.value })}>
              <option value="Entrada">Entrada</option>
              <option value="Salida">Salida</option>
              <option value="Ajuste">Ajuste</option>
            </select>
            <input type="number" min="0" value={movementForm.cantidad} onChange={(event) => setMovementForm({ ...movementForm, cantidad: event.target.value })} />
            <select value={movementForm.idOt} onChange={(event) => setMovementForm({ ...movementForm, idOt: event.target.value })}>
              <option value="">OT opcional</option>
              {workOrders.map((order) => (
                <option key={order.idOt} value={order.idOt}>
                  OT {order.idOt} - {order.tipoOt}
                </option>
              ))}
            </select>
            <button>Registrar movimiento</button>
          </form>

          <form className="panel stack" onSubmit={createNapBox}>
            <h2>Caja NAP</h2>
            <input placeholder="Identificador unico" value={napForm.identificadorUnico} onChange={(event) => setNapForm({ ...napForm, identificadorUnico: event.target.value })} />
            <input placeholder="Zona" value={napForm.zona} onChange={(event) => setNapForm({ ...napForm, zona: event.target.value })} />
            <input placeholder="Numero de poste" value={napForm.numeroPoste} onChange={(event) => setNapForm({ ...napForm, numeroPoste: event.target.value })} />
            <input type="number" min="1" value={napForm.capacidadPuertos} onChange={(event) => setNapForm({ ...napForm, capacidadPuertos: event.target.value })} />
            <button>Registrar caja NAP</button>
          </form>
        </section>
      )}

      <section className="advanced-tables-grid">
        <article className="panel stack">
          <h2>Consumibles</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Material</th><th>Bodega</th><th>Disponible</th><th>Umbral</th></tr>
              </thead>
              <tbody>
                {consumibles.map((stock) => (
                  <tr key={stock.idStock}>
                    <td>{stock.tipoEquipo?.nombre ?? '-'}</td>
                    <td>{stock.bodega?.nombre ?? '-'}</td>
                    <td>{stock.cantidadDisponible}</td>
                    <td>{stock.umbralMinimo ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!consumibles.length && <p className="empty-state">No hay consumibles registrados.</p>}
        </article>

        <article className="panel stack">
          <h2>Alertas de stock bajo</h2>
          <div className="compact-list">
            {alertas.map((stock) => (
              <div key={stock.idStock} className="compact-list-item">
                <strong>{stock.tipoEquipo?.nombre ?? `Stock ${stock.idStock}`}</strong>
                <span>{stock.cantidadDisponible} disponible(s), umbral {stock.umbralMinimo}</span>
              </div>
            ))}
          </div>
          {!alertas.length && <p className="empty-state">Sin alertas de stock bajo.</p>}
        </article>

        <article className="panel stack">
          <h2>Cajas NAP</h2>
          <div className="compact-list">
            {cajasNap.map((box) => (
              <div key={box.idCajaNap} className="compact-list-item">
                <strong>{box.identificadorUnico ?? `NAP ${box.idCajaNap}`}</strong>
                <span>{box.zona ?? '-'} - Poste {box.numeroPoste ?? '-'}</span>
              </div>
            ))}
          </div>
          {!cajasNap.length && <p className="empty-state">No hay cajas NAP registradas.</p>}
        </article>

        <article className="panel stack">
          <h2>Transferencias y mantenciones</h2>
          <div className="compact-list">
            {transferencias.slice(0, 5).map((transfer) => (
              <div key={transfer.idTransferencia} className="compact-list-item">
                <strong>Transferencia {transfer.idTransferencia}</strong>
                <span>{transfer.idEmpresaOrigen ?? '-'} a {transfer.idEmpresaDestino ?? '-'} - {formatDateOnly(transfer.fechaTransferencia)}</span>
              </div>
            ))}
            {mantenciones.slice(0, 5).map((row) => (
              <div key={row.idHistorial} className="compact-list-item">
                <strong>{row.unidad?.numeroSerie ?? `Equipo ${row.idUnidad ?? '-'}`}</strong>
                <span>{row.motivo ?? '-'} - {formatDateTime(row.fechaHora)}</span>
              </div>
            ))}
          </div>
          {!transferencias.length && !mantenciones.length && <p className="empty-state">Sin transferencias o mantenciones recientes.</p>}
        </article>
      </section>
    </section>
  );
}
function InventoryPanel({
  inventory,
  advancedInventory,
  customers,
  workOrders,
  writeCompanyId,
  permissions,
  onChanged,
}: {
  inventory: InventoryUnit[];
  advancedInventory: AdvancedInventory | null;
  customers: Customer[];
  workOrders: WorkOrder[];
  writeCompanyId: number;
  permissions: DashboardPermissions;
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState({ numeroSerie: '', modelo: '', tipoNombre: 'Router/ONU', numeroPoste: '' });
  const [movementForm, setMovementForm] = useState({ tipoMovimiento: 'Compra', idCliente: '', idEmpresaDestino: '' });
  const [statusForm, setStatusForm] = useState({ estado: 'Disponible', motivo: '' });
  const [installForm, setInstallForm] = useState({ idCliente: '', idOt: '', macAddress: '', puertoOlt: '', modelo: '' });
  const [advancedUnitForm, setAdvancedUnitForm] = useState({
    blockReason: '',
    diagnosisResult: 'Funciona',
    transferCompanyId: '',
    maintenanceType: 'Preventiva',
    maintenanceDesc: '',
    evidenceOt: '',
    evidenceUrl: '',
  });
  const [status, setStatus] = useState('');
  const [managementOpen, setManagementOpen] = useState(false);

  const selectedUnit = inventory.find((unit) => unit.idUnidad === selectedId) ?? null;
  const eligibleCustomers = customers.filter(
    (customer) =>
      customer.idEmpresa === selectedUnit?.idEmpresa ||
      customer.contratos?.some((contract) => contract.idEmpresa === selectedUnit?.idEmpresa),
  );
  const eligibleInstallOrders = workOrders.filter(
    (order) =>
      order.tipoOt === 'Instalacion' &&
      order.idCliente === Number(installForm.idCliente) &&
      order.idEmpresa === selectedUnit?.idEmpresa,
  );

  useEffect(() => {
    if (selectedUnit) {
      setStatusForm({ estado: selectedUnit.estado, motivo: '' });
      setInstallForm((current) => ({ ...current, modelo: selectedUnit.modelo ?? '' }));
    }
  }, [selectedUnit?.idUnidad]);

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      setStatus(success);
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  function selectedUnitPayload() {
    if (!selectedUnit) {
      throw new Error('No hay equipo seleccionado');
    }

    return selectedUnit.idUnidad;
  }

  return (
    <section className="workspace-grid">
      {permissions.manageInventory && <form
        className="panel stack"
        onSubmit={(event) => {
          event.preventDefault();

          if (!createForm.numeroSerie.trim() || !createForm.tipoNombre.trim()) {
            setStatus('Ingresa numero de serie y tipo de equipo.');
            return;
          }

          void run(
            () =>
              api.post('/inventory/equipment', {
                numeroSerie: createForm.numeroSerie.trim(),
                modelo: createForm.modelo.trim() || undefined,
                tipoNombre: createForm.tipoNombre.trim(),
                numeroPoste: createForm.numeroPoste.trim() || undefined,
                idEmpresa: writeCompanyId,
              }),
            'Equipo creado en inventario',
          );
        }}
      >
        <h2>Nuevo equipo</h2>
        <label>
          Numero de serie
          <input
            value={createForm.numeroSerie}
            onChange={(event) => setCreateForm({ ...createForm, numeroSerie: event.target.value })}
            placeholder="DEMO-FINET-RTR-002"
            maxLength={80}
            required
          />
        </label>
        <label>
          Modelo
          <input
            value={createForm.modelo}
            onChange={(event) => setCreateForm({ ...createForm, modelo: event.target.value })}
            placeholder="Huawei AX3 / FiberHome ONU"
            maxLength={80}
          />
        </label>
        <label>
          Tipo
          <input
            value={createForm.tipoNombre}
            onChange={(event) => setCreateForm({ ...createForm, tipoNombre: event.target.value })}
            placeholder="Router/ONU"
            maxLength={100}
            required
          />
        </label>
        <button>Crear equipo</button>
        {status && <p className="inline-status">{status}</p>}
      </form>}

      <section className="panel">
        <h2>Visualizando inventario por empresa</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Serie</th>
                <th>Modelo</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Empresa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((unit) => (
                <tr key={unit.idUnidad}>
                  <td>{unit.numeroSerie}</td>
                  <td>{unit.modelo ?? '-'}</td>
                  <td>{unit.tipoEquipo?.nombre ?? unit.idTipoEquipo ?? '-'}</td>
                  <td>{unit.estado}</td>
                  <td>{unit.empresa?.nombre ?? `Empresa ${unit.idEmpresa ?? '-'}`}</td>
                  <td>
                    <button
                      className="secondary compact"
                      onClick={() => {
                        setSelectedId(unit.idUnidad);
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

        <Modal title="Gestionar equipo" open={managementOpen} onClose={() => setManagementOpen(false)}>
          {selectedUnit ? (
            <div className="workflow-panel modal-workflow">
              <h3>{selectedUnit.numeroSerie}</h3>
              <p className="detail-line">
                Empresa: {selectedUnit.empresa?.nombre ?? `Empresa ${selectedUnit.idEmpresa ?? '-'}`}
                {selectedUnit.clienteInstalado ? ` - Cliente: ${selectedUnit.clienteInstalado.nombreCompleto}` : ''}
              </p>
              {(selectedUnit.macAddress || selectedUnit.puertoOlt) && (
                <p className="detail-line">
                  MAC: {selectedUnit.macAddress ?? '-'} - Puerto OLT: {selectedUnit.puertoOlt ?? '-'}
                </p>
              )}
              <div className="workflow-grid">
                {permissions.manageInventory && <label>
                  Estado logico
                  <select value={statusForm.estado} onChange={(event) => setStatusForm({ ...statusForm, estado: event.target.value })}>
                    {['Disponible', 'En Revision', 'Instalado', 'Baja Definitiva', 'Bloqueado'].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Motivo del cambio de estado"
                    value={statusForm.motivo}
                    onChange={(event) => setStatusForm({ ...statusForm, motivo: event.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void run(
                        () => api.patch(`/inventory/equipment/${selectedUnitPayload()}/status`, statusForm),
                        'Estado de equipo actualizado',
                      )
                    }
                  >
                    Actualizar
                  </button>
                </label>}

                {permissions.manageInventory && <label>
                  Movimiento
                  <select
                    value={movementForm.tipoMovimiento}
                    onChange={(event) => setMovementForm({ ...movementForm, tipoMovimiento: event.target.value })}
                  >
                    {['Compra', 'Devolucion', 'Asignacion', 'Descarte', 'Transferencia'].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <select value={movementForm.idCliente} onChange={(event) => setMovementForm({ ...movementForm, idCliente: event.target.value })}>
                    <option value="">Cliente opcional</option>
                    {customers.map((customer) => (
                      <option key={customer.idCliente} value={customer.idCliente}>
                        {customer.nombreCompleto}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="ID empresa destino, ej: 2"
                    value={movementForm.idEmpresaDestino}
                    onChange={(event) => setMovementForm({ ...movementForm, idEmpresaDestino: event.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void run(
                        () =>
                          api.post('/inventory/movements', {
                            idUnidad: selectedUnitPayload(),
                            tipoMovimiento: movementForm.tipoMovimiento,
                            idCliente: movementForm.idCliente ? Number(movementForm.idCliente) : undefined,
                            idEmpresaDestino: movementForm.idEmpresaDestino ? Number(movementForm.idEmpresaDestino) : undefined,
                            cantidad: 1,
                          }),
                        'Movimiento registrado',
                      )
                    }
                  >
                    Registrar
                  </button>
                </label>}
                {permissions.manageInventory && <label>
                  Bloquear equipo por uso malicioso
                  <input
                    placeholder="Motivo del bloqueo"
                    value={advancedUnitForm.blockReason}
                    onChange={(event) => setAdvancedUnitForm({ ...advancedUnitForm, blockReason: event.target.value })}
                  />
                  <button
                    type="button"
                    disabled={!advancedUnitForm.blockReason.trim()}
                    onClick={() =>
                      void run(
                        () => api.post(`/inventory/equipment/${selectedUnitPayload()}/block`, { motivo: advancedUnitForm.blockReason.trim() }),
                        'Equipo bloqueado y baja registrada',
                      )
                    }
                  >
                    Bloquear
                  </button>
                </label>}

                {permissions.manageInventory && <label>
                  Diagnosticar equipo devuelto
                  <select
                    value={advancedUnitForm.diagnosisResult}
                    onChange={(event) => setAdvancedUnitForm({ ...advancedUnitForm, diagnosisResult: event.target.value })}
                  >
                    <option value="Funciona">Funciona</option>
                    <option value="Danado">Danado</option>
                    <option value="Bloqueado">Bloqueado</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      void run(
                        () => api.post(`/inventory/equipment/${selectedUnitPayload()}/diagnosis`, { resultado: advancedUnitForm.diagnosisResult }),
                        'Diagnostico de equipo registrado',
                      )
                    }
                  >
                    Registrar diagnostico
                  </button>
                </label>}

                {permissions.manageInventory && <label>
                  Transferir equipo entre empresas
                  <input
                    placeholder="ID empresa destino"
                    value={advancedUnitForm.transferCompanyId}
                    onChange={(event) => setAdvancedUnitForm({ ...advancedUnitForm, transferCompanyId: event.target.value })}
                  />
                  <button
                    type="button"
                    disabled={!advancedUnitForm.transferCompanyId}
                    onClick={() =>
                      void run(
                        () => api.post(`/inventory/equipment/${selectedUnitPayload()}/transfer`, { idEmpresaDestino: Number(advancedUnitForm.transferCompanyId) }),
                        'Equipo transferido entre empresas',
                      )
                    }
                  >
                    Transferir
                  </button>
                </label>}

                {permissions.manageInventory && <label>
                  Registrar mantencion
                  <select
                    value={advancedUnitForm.maintenanceType}
                    onChange={(event) => setAdvancedUnitForm({ ...advancedUnitForm, maintenanceType: event.target.value })}
                  >
                    <option value="Preventiva">Preventiva</option>
                    <option value="Correctiva">Correctiva</option>
                  </select>
                  <input
                    placeholder="Descripción de la mantencion"
                    value={advancedUnitForm.maintenanceDesc}
                    onChange={(event) => setAdvancedUnitForm({ ...advancedUnitForm, maintenanceDesc: event.target.value })}
                  />
                  <button
                    type="button"
                    disabled={!advancedUnitForm.maintenanceDesc.trim()}
                    onClick={() =>
                      void run(
                        () => api.post(`/inventory/equipment/${selectedUnitPayload()}/maintenance`, {
                          tipo: advancedUnitForm.maintenanceType,
                          descripcion: advancedUnitForm.maintenanceDesc.trim(),
                        }),
                        'Mantencion registrada',
                      )
                    }
                  >
                    Registrar mantencion
                  </button>
                </label>}

                {permissions.installEquipment && <label>
                  Adjuntar evidencia a orden de trabajo
                  <select value={advancedUnitForm.evidenceOt} onChange={(event) => setAdvancedUnitForm({ ...advancedUnitForm, evidenceOt: event.target.value })}>
                    <option value="">Seleccionar OT</option>
                    {workOrders.map((order) => (
                      <option key={order.idOt} value={order.idOt}>
                        OT {order.idOt} - {order.tipoOt}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="URL o ruta local /uploads/..."
                    value={advancedUnitForm.evidenceUrl}
                    onChange={(event) => setAdvancedUnitForm({ ...advancedUnitForm, evidenceUrl: event.target.value })}
                  />
                  <button
                    type="button"
                    disabled={!advancedUnitForm.evidenceOt || !advancedUnitForm.evidenceUrl.trim()}
                    onClick={() =>
                      void run(
                        () => api.post(`/inventory/work-orders/${advancedUnitForm.evidenceOt}/evidence`, { url: advancedUnitForm.evidenceUrl.trim() }),
                        'Evidencia adjuntada a la OT',
                      )
                    }
                  >
                    Adjuntar evidencia
                  </button>
                </label>}


                {permissions.installEquipment && <label>
                  Asociando serie, MAC y puerto OLT al cliente
                  <input value={selectedUnit.numeroSerie} readOnly aria-label="Número de serie asociado" />
                  <select
                    value={installForm.idCliente}
                    onChange={(event) => setInstallForm({ ...installForm, idCliente: event.target.value, idOt: '' })}
                  >
                    <option value="">Seleccionar cliente</option>
                    {eligibleCustomers.map((customer) => (
                      <option key={customer.idCliente} value={customer.idCliente}>
                        {customer.nombreCompleto} - {customer.rut ?? 'sin RUT'}
                      </option>
                    ))}
                  </select>
                  <select value={installForm.idOt} onChange={(event) => setInstallForm({ ...installForm, idOt: event.target.value })}>
                    <option value="">Orden de instalación opcional</option>
                    {eligibleInstallOrders.map((order) => (
                      <option key={order.idOt} value={order.idOt}>
                        Orden {order.idOt} - {order.estado}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="MAC AA:BB:CC:DD:EE:FF"
                    value={installForm.macAddress}
                    onChange={(event) => setInstallForm({ ...installForm, macAddress: event.target.value })}
                  />
                  <input
                    placeholder="Puerto OLT, ej: OLT-1/1/3"
                    value={installForm.puertoOlt}
                    onChange={(event) => setInstallForm({ ...installForm, puertoOlt: event.target.value })}
                  />
                  <button
                    type="button"
                    disabled={!installForm.idCliente || !installForm.macAddress.trim() || !installForm.puertoOlt.trim()}
                    onClick={() =>
                      !macPattern.test(installForm.macAddress.trim())
                        ? setStatus('Ingresa una MAC valida, por ejemplo AA:BB:CC:DD:EE:FF.')
                        : !installForm.puertoOlt.trim()
                          ? setStatus('Ingresa el puerto OLT asociado a la instalación.')
                          : void run(
                            () =>
                              api.post(`/inventory/equipment/${selectedUnitPayload()}/install`, {
                                idCliente: Number(installForm.idCliente),
                                idOt: installForm.idOt ? Number(installForm.idOt) : undefined,
                                modelo: installForm.modelo.trim() || undefined,
                                macAddress: installForm.macAddress.trim().toUpperCase(),
                                puertoOlt: installForm.puertoOlt.trim(),
                              }),
                            'Equipo vinculado al cliente',
                          )
                    }
                  >
                    Vincular
                  </button>
                </label>}
              </div>
              {status && <p className="inline-status">{status}</p>}
            </div>
          ) : (
            <p className="inline-status">Selecciona un equipo del inventario para gestionarlo.</p>
          )}
        </Modal>
      </section>

      <InventoryAdvancedPanel
        advancedInventory={advancedInventory}
        workOrders={workOrders}
        writeCompanyId={writeCompanyId}
        permissions={permissions}
        onChanged={onChanged}
      />
    </section>
  );
}

function TicketsPanel({
  tickets,
  categories,
  permissions,
  onChanged,
}: {
  tickets: Ticket[];
  categories: TicketCategory[];
  permissions: DashboardPermissions;
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
  const [technicalNote, setTechnicalNote] = useState('');
  const [status, setStatus] = useState('');
  const [customerPreview, setCustomerPreview] = useState<Customer | null>(null);
  const [ticketServices, setTicketServices] = useState<CustomerService[]>([]);
  const [customerLookupStatus, setCustomerLookupStatus] = useState('');
  const [managementOpen, setManagementOpen] = useState(false);

  const selectedTicket = tickets.find((ticket) => ticket.idTicket === selectedId) ?? null;

  useEffect(() => {
    if (selectedTicket) {
      setCategoryId(String(selectedTicket.idCategoria));
      setPriority(selectedTicket.prioridad);
      setTicketStatus(selectedTicket.estado);
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
          Categoria
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
                <th>Codigo</th>
                <th>Cliente</th>
                <th>Categoria</th>
                <th>Servicio</th>
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
              {(permissions.classifyTickets || permissions.updateTicketStatus || permissions.diagnoseTickets) ? (
                <div className="workflow-grid">
                  {permissions.classifyTickets && <label>
                    Clasificacion
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
                    <button
                      type="button"
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
                    Diagnostico tecnico
                    <input
                      placeholder="Causa raiz"
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
                    <button
                      type="button"
                      onClick={() =>
                        void run(
                          () => api.post(`/tickets/${selectedTicket.idTicket}/diagnosis`, diagnosis),
                          'Diagnostico registrado',
                        )
                      }
                    >
                      Registrar diagnostico
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
                    Registrar observacion
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

function WorkOrdersPanel({ workOrders, onChanged }: { workOrders: WorkOrder[]; onChanged: () => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ potenciaOpticaDbm: '', observaciones: '' });
  const [status, setStatus] = useState('');

  const selectedOrder = workOrders.find((order) => order.idOt === selectedId) ?? null;
  const selectedOrderIsInstallation = normalizeWorkOrderValue(selectedOrder?.tipoOt) === 'instalacion';
  const selectedOrderIsCompleted = normalizeWorkOrderValue(selectedOrder?.estado) === 'completada';

  useEffect(() => {
    setForm({ potenciaOpticaDbm: '', observaciones: '' });
    setStatus('');
  }, [selectedId]);

  function ownerLabel(order: WorkOrder) {
    if (order.prospecto?.idProspecto) {
      return `Prospecto ${order.prospecto.idProspecto}`;
    }

    if (order.idCliente) {
      return `Cliente ${order.idCliente}`;
    }

    if (order.idTicket) {
      return `Ticket ${order.idTicket}`;
    }

    return 'Sin asociado';
  }

  async function completeInstallation() {
    if (!selectedOrder) {
      return;
    }

    try {
      const { data } = await api.patch(`/work-orders/${selectedOrder.idOt}/complete-installation`, {
        potenciaOpticaDbm: form.potenciaOpticaDbm ? Number(form.potenciaOpticaDbm) : undefined,
        observaciones: form.observaciones,
      });
      setStatus(
        `Instalación completada. Fecha de creación: ${formatDateTime(data.prospect.fechaCreacion)}. ` +
        `Fecha de conversión: ${formatDateOnly(data.prospect.fechaConversion)}. ` +
        `Tiempo de conversión calculado: ${data.prospect.tiempoConversionDias} día(s).`,
      );
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  return (
    <section className="work-orders-panel stack">
      <div className="section-heading">
        <h2>Órdenes de trabajo</h2>
        <p>Listado operativo de visitas, soporte e instalaciones registradas.</p>
      </div>
      <div className="table-wrap work-orders-table-wrap">
        <table className="work-orders-table operational-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Tipo</th>
              <th>Asociado</th>
              <th>Fecha</th>
              <th>Técnico</th>
              <th className="operational-badge-column">Prioridad</th>
              <th className="operational-badge-column">Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {workOrders.map((order) => (
              <tr key={order.idOt}>
                <td className="work-order-id">#{order.idOt}</td>
                <td><span className="work-order-type">{formatWorkOrderValue(order.tipoOt)}</span></td>
                <td>{ownerLabel(order)}</td>
                <td>
                  {order.fechaProgramada ? formatDateOnly(order.fechaProgramada) : '-'}
                  {order.horaVisita ? ` ${order.horaVisita}` : ''}
                </td>
                <td>{order.tecnico?.nombreCompleto ?? 'Sin asignar'}</td>
                <td className="operational-badge-column"><StatusBadge value={formatWorkOrderValue(order.prioridad)} /></td>
                <td className="operational-badge-column"><StatusBadge value={formatWorkOrderValue(order.estado)} /></td>
                <td>
                  <button
                    className="secondary compact operational-manage-button"
                    onClick={() => {
                      setSelectedId(order.idOt);
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
      {!workOrders.length && <p className="empty-state">No hay órdenes de trabajo disponibles.</p>}

      <Modal title="Gestionar orden de trabajo" open={modalOpen} onClose={() => setModalOpen(false)}>
        {selectedOrder ? (
          <div className="workflow-panel modal-workflow work-order-workflow">
            <section className="work-order-overview">
              <header className="work-order-overview-header">
                <span className="work-order-overview-icon" aria-hidden="true">
                  <ClipboardList size={23} strokeWidth={1.8} />
                </span>
                <div>
                  <p>Orden de trabajo</p>
                  <h3>Orden #{selectedOrder.idOt}</h3>
                </div>
                <StatusBadge value={formatWorkOrderValue(selectedOrder.estado)} />
              </header>

              <dl className="work-order-overview-data">
                <div>
                  <dt>Tipo</dt>
                  <dd>{formatWorkOrderValue(selectedOrder.tipoOt)}</dd>
                </div>
                <div>
                  <dt>Asociado</dt>
                  <dd>{ownerLabel(selectedOrder)}</dd>
                </div>
                <div>
                  <dt>Técnico</dt>
                  <dd>{selectedOrder.tecnico?.nombreCompleto ?? 'Sin asignar'}</dd>
                </div>
                <div>
                  <dt>Prioridad</dt>
                  <dd><StatusBadge value={formatWorkOrderValue(selectedOrder.prioridad)} /></dd>
                </div>
                <div>
                  <dt>Visita</dt>
                  <dd>
                    {selectedOrder.fechaProgramada ? formatDateOnly(selectedOrder.fechaProgramada) : 'Sin fecha'}{' '}
                    {selectedOrder.horaVisita ?? 'Sin hora'}
                  </dd>
                </div>
                <div>
                  <dt>Conexión</dt>
                  <dd>{selectedOrder.tipoConexion ? formatConnectionType(selectedOrder.tipoConexion) : 'No registrada'}</dd>
                </div>
                {selectedOrder.observacionesAgenda && (
                  <div className="work-order-overview-note">
                    <dt>Observaciones de agenda</dt>
                    <dd>{selectedOrder.observacionesAgenda}</dd>
                  </div>
                )}
              </dl>
            </section>

            {selectedOrderIsInstallation ? (
              <section className="work-order-completion">
                <div className="work-order-section-heading">
                  <span aria-hidden="true">
                    {selectedOrderIsCompleted
                      ? <CircleCheckBig size={21} strokeWidth={1.8} />
                      : <Wrench size={21} strokeWidth={1.8} />}
                  </span>
                  <div>
                    <h3>{selectedOrderIsCompleted ? 'Instalación completada' : 'Cierre de instalación'}</h3>
                    <p>
                      {selectedOrderIsCompleted
                        ? 'La orden ya fue completada. Puedes consultar aquí los datos registrados.'
                        : 'Registra los datos técnicos para confirmar la instalación y activar al cliente.'}
                    </p>
                  </div>
                </div>
                <div className="history-grid">
                  <HistoryBox title="Fecha de creación del prospecto" value={formatDateTime(selectedOrder.prospecto?.fechaCreacion)} />
                  <HistoryBox title="Fecha de conversión" value={formatDateOnly(selectedOrder.prospecto?.fechaConversion)} />
                  <HistoryBox
                    title="Tiempo de conversión"
                    value={
                      selectedOrder.prospecto?.tiempoConversionDias === null || selectedOrder.prospecto?.tiempoConversionDias === undefined
                        ? 'Pendiente'
                        : `${selectedOrder.prospecto.tiempoConversionDias} día(s)`
                    }
                  />
                </div>
                {!selectedOrder.prospecto?.fechaCreacion && (
                  <p className="alert">No se puede completar la instalación: falta la fecha de creación del prospecto.</p>
                )}
                <div className="workflow-grid work-order-technical-grid">
                  <label className="work-order-technical-field">
                    <span className="work-order-field-label">Potencia óptica</span>
                    <span className="work-order-measurement">
                      <input
                        aria-label="Potencia óptica en dBm"
                        type="number"
                        step="0.01"
                        placeholder="-19.50"
                        value={form.potenciaOpticaDbm}
                        onChange={(event) => setForm({ ...form, potenciaOpticaDbm: event.target.value })}
                      />
                      <span>dBm</span>
                    </span>
                  </label>
                  <label className="work-order-technical-field">
                    <span className="work-order-field-label">Observaciones</span>
                    <textarea
                      placeholder="Agrega observaciones técnicas"
                      value={form.observaciones}
                      onChange={(event) => setForm({ ...form, observaciones: event.target.value })}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="work-order-complete-button"
                  disabled={selectedOrderIsCompleted || !selectedOrder.prospecto?.fechaCreacion}
                  onClick={completeInstallation}
                >
                  Confirmar instalación y activar cliente
                </button>
              </section>
            ) : (
              <div className="work-order-information">
                <span aria-hidden="true">
                  <CircleCheckBig size={21} strokeWidth={1.8} />
                </span>
                <div>
                  <strong>Orden registrada</strong>
                  <p>Esta orden no requiere cierre de instalación desde este panel.</p>
                </div>
              </div>
            )}
            {status && <p className="inline-status">{status}</p>}
          </div>
        ) : (
          <p className="inline-status">Selecciona una orden de trabajo para gestionarla.</p>
        )}
      </Modal>
    </section>
  );
}

function ReportsPanel({ companies, initialScope }: { companies: Company[]; initialScope: string }) {
  const [type, setType] = useState('clientes');
  const [format, setFormat] = useState('csv');
  const [scopeMode, setScopeMode] = useState(initialScope === 'consolidado' ? 'consolidado' : 'empresa');
  const [companyId, setCompanyId] = useState(initialScope === 'consolidado' ? '' : initialScope);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('');
  const today = dateInputValue(new Date());

  useEffect(() => {
    if (!companyId && companies[0]) {
      setCompanyId(String(companies[0].idEmpresa));
    }
  }, [companies, companyId]);

  async function exportReport() {
    if (scopeMode === 'empresa' && !companyId) {
      setStatus('Selecciona la empresa incluida en el reporte.');
      return;
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      setStatus('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }

    if ((dateFrom && dateFrom < reportMinimumDate) || (dateTo && dateTo < reportMinimumDate)) {
      setStatus(`El periodo no puede ser anterior a ${formatDateOnly(reportMinimumDate)}.`);
      return;
    }

    if ((dateFrom && dateFrom > today) || (dateTo && dateTo > today)) {
      setStatus('El periodo del reporte no puede incluir fechas futuras.');
      return;
    }

    try {
      const response = await api.get('/reports/export', {
        params: {
          type,
          format,
          scope: scopeMode === 'consolidado' ? 'consolidado' : companyId,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reporte-${type}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus('Reporte generado correctamente');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  return (
    <section className="reports-shell">
      <div className="report-card">
        <div className="section-heading centered report-heading">
          <span className="report-heading-icon" aria-hidden="true">
            <BarChart3 size={28} strokeWidth={1.8} />
          </span>
          <h2>Reportes operativos</h2>
        </div>
        <div className="report-form-grid">
          <label>
            Tipo de reporte
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="clientes">Clientes</option>
              <option value="prospectos">Prospectos</option>
              <option value="tickets">Tickets</option>
              <option value="inventario">Inventario</option>
              <option value="cobranza">Cobranza</option>
              <option value="materiales">Materiales</option>
            </select>
          </label>
          <label>
            Formato
            <select value={format} onChange={(event) => setFormat(event.target.value)}>
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
            </select>
          </label>
          <label>
            Período desde
            <input
              type="date"
              min={reportMinimumDate}
              max={today}
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label>
            Período hasta
            <input
              type="date"
              min={reportMinimumDate}
              max={today}
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
          <label>
            Alcance
            <select value={scopeMode} onChange={(event) => setScopeMode(event.target.value)}>
              <option value="consolidado">Consolidado: todas las empresas</option>
              <option value="empresa">Una empresa</option>
            </select>
          </label>
          <label>
            Empresa
            <select
              value={companyId}
              disabled={scopeMode === 'consolidado'}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              <option value="">Seleccionar empresa</option>
              {companies.map((company) => (
                <option key={company.idEmpresa} value={company.idEmpresa}>
                  {company.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <small className="report-help">Periodo permitido: desde {formatDateOnly(reportMinimumDate)} hasta hoy.</small>
        <button type="button" className="report-button" onClick={exportReport}>
          Generar reporte
        </button>
        {status && <p className="inline-status">{status}</p>}
      </div>
    </section>
  );
}

function ImportPanel({ writeCompanyId, onImported }: { writeCompanyId: number; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!file) {
      setResult('Selecciona un archivo');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post('/imports/clients', formData, {
        params: { idEmpresa: writeCompanyId },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(`${data.status}: ${data.importedRows} importadas, ${data.rejectedRows} rechazadas`);
      onImported();
    } catch (err) {
      setResult(apiErrorMessage(err));
    }
  }

  return (
    <form className="import-panel" onSubmit={submit}>
      <div className="import-panel-heading">
        <span className="import-panel-icon" aria-hidden="true">
          <FileUp size={28} strokeWidth={1.8} />
        </span>
        <h2>Importación</h2>
      </div>
      <input
        aria-label="Seleccionar archivo para importar"
        accept=".csv,.xls,.xlsx"
        type="file"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <button>Importar</button>
      {result && <p className="inline-status">{result}</p>}
    </form>
  );
}

function UsersPanel({ users, roles, onUpdated }: { users: UserRow[]; roles: Role[]; onUpdated: () => void }) {
  const [status, setStatus] = useState('');

  async function assignRole(userId: number, roleId: number) {
    try {
      await api.patch(`/users/${userId}/role`, { roleId });
      setStatus('Perfil actualizado');
      onUpdated();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  return (
    <section className="users-panel">
      <h2>Usuarios</h2>
      {status && <p className="inline-status">{status}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Empresa</th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.idUsuario}>
                <td>{row.nombreCompleto}</td>
                <td>{row.email}</td>
                <td>
                  <select
                    value={row.roles[0]?.idRol ?? ''}
                    onChange={(event) => void assignRole(row.idUsuario, Number(event.target.value))}
                  >
                    {roles.map((role) => (
                      <option key={role.idRol} value={role.idRol}>
                        {role.nombreRol}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{row.empresa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AuditPanel({ audit }: { audit: AuditLog[] }) {
  return (
    <section className="audit-panel">
      <h2>Auditoría</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Accion</th>
              <th>Entidad</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((row) => (
              <tr key={row.idLog}>
                <td>{row.fechaHora ? new Date(row.fechaHora).toLocaleString() : '-'}</td>
                <td>{row.accion}</td>
                <td>{row.entidadAfectada ?? '-'}</td>
                <td>{row.usuario?.email ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
