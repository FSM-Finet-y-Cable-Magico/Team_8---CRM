import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  ChevronDown,
  CircleCheckBig,
  ClipboardList,
  FileClock,
  FileUp,
  House,
  Mail,
  Map as MapIcon,
  Router,
  Table2,
  Ticket as TicketIcon,
  UserCog,
  UserRoundPlus,
  Users,
  Wifi,
} from 'lucide-react';
import {
  api,
  apiErrorMessage,
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
  Prospect,
  Role,
  Ticket,
  TicketCategory,
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
import { CommercialControlBookPanel } from './features/commercial';
import { CustomersPanel } from './features/customers';
import { CoverageZonesPanel } from './features/coverage';
import { DashboardHome } from './features/dashboard';
import { ImportPanel } from './features/import';
import { InstallationsPanel } from './features/installations';
import { InventoryPanel } from './features/inventory';
import { PlansPanel } from './features/plans';
import { createProspectRegistrationDraft, ProspectsPanel } from './features/prospects';
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
  settledData,
  technicalEntries,
} from './lib';
import { Sidebar, Topbar, type SidebarNavItem } from './layouts';
import { useCompanyDraft } from './shared/hooks/useCompanyDraft';
import { useTransientMessage } from './shared/hooks/useTransientMessage';
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
  ToastNotice,
  type ExpiryCustomerAlert,
} from './shared/components';

type Tab =
  | 'dashboard'
  | 'prospects'
  | 'coverage'
  | 'installations'
  | 'customers'
  | 'inventory'
  | 'plans'
  | 'commercial'
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
    pendientesActivacion?: number;
    instalacionesPendientes?: number;
    ticketsAbiertos?: number;
    clientesMorosos?: number;
    inventarioDisponible?: number;
    serviciosActivos?: number;
    instalacionesMensuales?: number;
    instalacionesSinFechaTecnica?: number;
    instalacionesRequierenRevision?: number;
    ticketsCerradosMensuales?: number;
    churnRateMensual?: number | null;
    churnBajasMensuales?: number | null;
    churnEstado?: 'HISTORIAL_INSUFICIENTE';
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

  useEffect(() => {
    const handleExpiredSession = () => setUser(null);
    window.addEventListener('finet:auth-expired', handleExpiredSession);

    return () => window.removeEventListener('finet:auth-expired', handleExpiredSession);
  }, []);

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  return <Dashboard key={user.idUsuario} user={user} onLogout={() => setUser(null)} />;
}
function Dashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [visitedModules, setVisitedModules] = useState<Tab[]>([]);
  useEffect(() => {
    if (activeTab === 'customers' || activeTab === 'commercial') {
      setVisitedModules(current => current.includes(activeTab) ? current : [...current, activeTab]);
    }
  }, [activeTab]);
  const [customerPendingView, setCustomerPendingView] = useState<'activation' | null>(null);
  const [installationView, setInstallationView] = useState<'coordination' | 'agenda' | null>(null);
  const [scope, setScope] = useState('consolidado');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusedInstallationProspectId, setFocusedInstallationProspectId] = useState<number | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [prospectsLoading, setProspectsLoading] = useState(true);
  const [prospectsError, setProspectsError] = useState('');
  const prospectsRequest = useRef(0);
  const prospectsScope = useRef(scope);
  const [pendingActivationProspects, setPendingActivationProspects] = useState<Prospect[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryUnit[]>([]);
  const [billingOverview, setBillingOverview] = useState<BillingOverview | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketCategories, setTicketCategories] = useState<TicketCategory[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [message, setMessage] = useState('');
  const { message: notification, showMessage: showNotification, clearMessage: clearNotification } = useTransientMessage(3000);
  const isAdmin = hasPermission(user.roles, 'manageCompanyScope');
  const permissions = getDashboardPermissions(user.roles);
  const canManageCustomers = permissions.viewCustomers;
  const canViewInventory = permissions.viewInventory;
  const canViewTickets = permissions.viewTickets;
  const canViewInstallations = permissions.viewInstallations;
  const canViewWorkOrders = permissions.viewWorkOrders;

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(''), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const writeCompanyId = useMemo(() => {
    if (scope !== 'consolidado') {
      return Number(scope);
    }

    return user.idEmpresa ?? companies[0]?.idEmpresa ?? 1;
  }, [companies, scope, user.idEmpresa]);
  const prospectRegistration = useCompanyDraft(writeCompanyId, createProspectRegistrationDraft);

  async function loadProspects() {
    const request = ++prospectsRequest.current;
    setProspectsLoading(true);
    setProspectsError('');
    // Keep the selected prospect mounted while rechecking coverage; clear only when changing company scope.
    if (prospectsScope.current !== scope) {
      prospectsScope.current = scope;
      setProspects([]);
    }
    try {
      const { data } = await api.get<Prospect[]>('/prospects', { params: { scope }, timeout: 15000 });
      if (request === prospectsRequest.current) setProspects(data);
    } catch {
      if (request === prospectsRequest.current) {
        setProspectsError('No se pudieron cargar los prospectos. Comprueba la conexión del servidor y la configuración de la base de datos.');
      }
    } finally {
      if (request === prospectsRequest.current) setProspectsLoading(false);
    }
  }

  async function loadData() {
    void loadProspects();
    setMessage('');
    const errors: string[] = [];
    const loadCustomers = canManageCustomers || permissions.installEquipment;
    const [
      summaryResult,
      companiesResult,
      pendingActivationProspectsResult,
      plansResult,
      customersResult,
      inventoryResult,
      billingResult,
      ticketsResult,
      categoriesResult,
      workOrdersResult,
    ] = await Promise.allSettled([
      api.get<Summary>('/companies/summary', { params: { scope } }),
      isAdmin ? api.get<Company[]>('/companies') : Promise.resolve({ data: [] as Company[] }),
      canViewInstallations
        ? api.get<Prospect[]>('/prospects/pending-activation', { params: { scope } })
        : Promise.resolve({ data: [] as Prospect[] }),
      api.get<Plan[]>('/plans', { params: { scope, includeInactive: permissions.managePlans ? 'true' : undefined } }),
      loadCustomers ? api.get<Customer[]>('/customers', { params: { scope } }) : Promise.resolve({ data: [] as Customer[] }),
      canViewInventory ? api.get<InventoryUnit[]>('/inventory', { params: { scope } }) : Promise.resolve({ data: [] as InventoryUnit[] }),
      permissions.viewBilling ? api.get<BillingOverview>('/billing/overview', { params: { scope } }) : Promise.resolve({ data: null as BillingOverview | null }),
      canViewTickets ? api.get<Ticket[]>('/tickets', { params: { scope } }) : Promise.resolve({ data: [] as Ticket[] }),
      canViewTickets ? api.get<TicketCategory[]>('/tickets/categories') : Promise.resolve({ data: [] as TicketCategory[] }),
      canViewWorkOrders || canViewInstallations
        ? api.get<WorkOrder[]>('/work-orders', { params: { scope } })
        : Promise.resolve({ data: [] as WorkOrder[] }),
    ]);
    const summaryData = settledData(summaryResult, null as Summary | null, errors);
    const companyOptions = isAdmin
      ? settledData(companiesResult, [] as Company[], errors)
      : summaryData?.empresas ?? [];

    setSummary(summaryData);
    setCompanies(companyOptions.length > 0 ? companyOptions : summaryData?.empresas ?? []);
    setPendingActivationProspects(settledData(pendingActivationProspectsResult, [] as Prospect[], errors));
    setPlans(settledData(plansResult, [] as Plan[], errors));
    setCustomers(settledData(customersResult, [] as Customer[], errors));
    setInventory(settledData(inventoryResult, [] as InventoryUnit[], errors));
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
    { tab: 'coverage', label: 'Cobertura', visible: permissions.managePaymentZones, icon: MapIcon },
    { tab: 'customers', label: 'Clientes', visible: canManageCustomers, icon: Users },
    { tab: 'installations', label: 'Instalaciones', visible: canViewInstallations, icon: Router },
    { tab: 'inventory', label: 'Inventario', visible: canViewInventory, icon: Boxes },
    { tab: 'plans', label: 'Planes', visible: permissions.managePlans, icon: ClipboardList },
    { tab: 'commercial', label: 'Libro de control', visible: permissions.viewControlBook, icon: Table2 },
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
      <ToastNotice message={notification} onDismiss={clearNotification} />
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
        <Modal title="Mi perfil" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
          <section className="user-settings-card">
            <header className="user-settings-heading">
              <span className="user-settings-avatar" aria-hidden="true">{userInitials || 'U'}</span>
              <div className="user-settings-identity">
                <h3>{user.nombreCompleto}</h3>
                <p className="user-settings-role">{user.roles.join(', ') || 'Sin rol asignado'}</p>
              </div>
            </header>
            <dl className="user-settings-details">
              <div>
                <dt><Mail size={17} strokeWidth={1.7} aria-hidden="true" />Correo electrónico</dt>
                <dd>{user.email ?? 'Sin correo registrado'}</dd>
              </div>
              <div>
                <dt><Building2 size={17} strokeWidth={1.7} aria-hidden="true" />Empresa</dt>
                <dd>{currentCompanyName}</dd>
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
              billingOverview={billingOverview}
              permissions={permissions}
              onNavigate={setActiveTab}
              onOpenPendingInstallations={(view) => {
                if (view === 'agenda') {
                  if (!canViewInstallations) return;
                  setInstallationView('agenda');
                  setActiveTab('installations');
                } else {
                  if (!canManageCustomers) return;
                  setCustomerPendingView('activation');
                  setActiveTab('customers');
                }
              }}
            />
          )}
          {activeTab === 'prospects' && permissions.viewProspects && (
            <ProspectsPanel
              key={writeCompanyId}
              registration={prospectRegistration}
              prospects={prospects}
              loading={prospectsLoading}
              loadError={prospectsError}
              onReload={() => void loadProspects()}
              plans={plans}
              writeCompanyId={writeCompanyId}
              permissions={permissions}
              onCreated={() => void loadData()}
              onNotify={showNotification}
            />
          )}
          {activeTab === 'coverage' && permissions.managePaymentZones && (
            <CoverageZonesPanel idEmpresa={writeCompanyId} canManage={permissions.managePaymentZones} />
          )}
          {activeTab === 'installations' && canViewInstallations && (
            <InstallationsPanel
              scope={scope}
              requestedView={installationView}
              onViewConsumed={() => setInstallationView(null)}
              companies={companies}
              customers={customers}
              prospects={prospects}
              pendingActivationProspects={pendingActivationProspects}
              workOrders={workOrders}
              inventory={inventory}
              canComplete={permissions.installEquipment}
               canRequest={permissions.createInstallOrders}
              focusedProspectId={focusedInstallationProspectId}
              onFocusConsumed={() => setFocusedInstallationProspectId(null)}
              onChanged={() => void loadData()}
            />
          )}
          {(activeTab === 'customers' || visitedModules.includes('customers')) && canManageCustomers && (
            <div hidden={activeTab !== 'customers'}>
            <CustomersPanel
              active={activeTab === 'customers'}
              pendingInstallationsView={customerPendingView}
              onPendingInstallationsViewConsumed={() => setCustomerPendingView(null)}
              customers={customers}
              plans={plans}
              scope={scope}
              permissions={permissions}
              profileEditor={{ admin: isAdmin, idEmpresa: user.idEmpresa }}
              onProfileUpdated={(profile) => setCustomers(current => current.map(customer => customer.idCliente === profile.idCliente ? { ...customer, ...profile } : customer))}
              onManageInstallation={(idProspecto) => {
                setFocusedInstallationProspectId(idProspecto);
                setActiveTab('installations');
              }}
              onChanged={() => void loadData()}
            />
            </div>
          )}
          {activeTab === 'inventory' && canViewInventory && (
            <InventoryPanel
              companyId={writeCompanyId}
              companyName={currentCompanyName}
            />
          )}
          {activeTab === 'plans' && permissions.managePlans && (
            <PlansPanel
              plans={plans}
              companies={companies}
              scope={scope}
              permissions={permissions}
              writeCompanyId={writeCompanyId}
              onChanged={() => void loadData()}
            />
          )}
          {(activeTab === 'commercial' || visitedModules.includes('commercial')) && permissions.viewControlBook && (
            <div hidden={activeTab !== 'commercial'}>
            <CommercialControlBookPanel
              active={activeTab === 'commercial'}
              scope={scope}
              writeCompanyId={writeCompanyId}
              permissions={permissions}
              customers={customers}
              companies={companies}
              onChanged={() => void loadData()}
            />
            </div>
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
            <UsersPanel users={users} roles={roles} companies={companies} currentUserId={user.idUsuario} onUpdated={() => void loadData()} />
          )}
          {activeTab === 'audit' && permissions.viewAudit && <AuditPanel audit={audit} />}
        </section>
      </section>
    </main>
  );
}
