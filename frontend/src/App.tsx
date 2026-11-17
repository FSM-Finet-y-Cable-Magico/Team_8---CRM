import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { clearSession, monitorSession, restoreSession } from './lib/session';
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
  technicalEntries,
} from './lib';
import { Sidebar, Topbar, type SidebarNavItem } from './layouts';
import { useCompanyDraft } from './shared/hooks/useCompanyDraft';
import { useTransientMessage } from './shared/hooks/useTransientMessage';
import { isRefreshPaused, useAutoRefresh } from './shared/hooks/useAutoRefresh';
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
    clientesRegistrados?: number;
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
  const [user, setUser] = useState<AuthUser | null>(restoreSession);

  useEffect(() => {
    if (user) return monitorSession(() => setUser(null));
  }, [user]);

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
  const [focusedTicketId, setFocusedTicketId] = useState<number | null>(null);
  const [controlBookFocus, setControlBookFocus] = useState<{ idCliente: number; idEmpresa: number } | null>(null);
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
  const [focusedInstallationContractId, setFocusedInstallationContractId] = useState<number | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const dataRequest = useRef<AbortController | null>(null);
  const loadedScope = useRef<string | null>(null);
  const companiesScope = useRef<string | null>(null);
  const [sectionError, setSectionError] = useState('');
  const dataScope = useRef(scope);
  dataScope.current = scope;
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [prospectsLoading, setProspectsLoading] = useState(true);
  const [prospectsError, setProspectsError] = useState('');
  const prospectsRequest = useRef<AbortController | null>(null);
  const prospectsScope = useRef(scope);
  const [pendingActivationProspects, setPendingActivationProspects] = useState<Prospect[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryUnit[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketCategories, setTicketCategories] = useState<TicketCategory[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const { message: notification, showMessage: showNotification, clearMessage: clearNotification } = useTransientMessage(3000);
  const isAdmin = hasPermission(user.roles, 'manageCompanyScope');
  const permissions = getDashboardPermissions(user.roles);
  const canManageCustomers = permissions.viewCustomers;
  const canViewInventory = permissions.viewInventory;
  const canViewTickets = permissions.viewTickets;
  const canViewInstallations = permissions.viewInstallations;
  const canViewWorkOrders = permissions.viewWorkOrders;

  const writeCompanyId = useMemo(() => {
    if (scope !== 'consolidado') {
      return Number(scope);
    }

    return user.idEmpresa ?? companies[0]?.idEmpresa ?? 1;
  }, [companies, scope, user.idEmpresa]);
  const prospectRegistration = useCompanyDraft(writeCompanyId, createProspectRegistrationDraft);

  async function loadProspects(background = false, parentSignal?: AbortSignal) {
    prospectsRequest.current?.abort();
    const controller = new AbortController();
    prospectsRequest.current = controller;
    const abort = () => controller.abort();
    parentSignal?.addEventListener('abort', abort, { once: true });
    if (parentSignal?.aborted) controller.abort();
    const current = () => !controller.signal.aborted && dataScope.current === scope;
    if (!background) { setProspectsLoading(true); setProspectsError(''); }
    if (prospectsScope.current !== scope) {
      prospectsScope.current = scope;
      setProspects([]);
    }
    try {
      const { data } = await api.get<Prospect[]>('/prospects', { params: { scope }, timeout: 15000, signal: controller.signal });
      if (current() && !(background && isRefreshPaused())) {
        setProspects(previous => background && JSON.stringify(previous) === JSON.stringify(data) ? previous : data);
        setProspectsError('');
      }
      return true;
    } catch (error) {
      if (current()) setProspectsError(apiErrorMessage(error));
      return false;
    } finally {
      parentSignal?.removeEventListener('abort', abort);
      if (current()) setProspectsLoading(false);
    }
  }

  async function loadData(background = false) {
    // Timer, focus and returning online share one read. Mutations can request a fresh one.
    if (background && dataRequest.current) return true;
    dataRequest.current?.abort();
    const controller = new AbortController();
    dataRequest.current = controller;
    const current = () => !controller.signal.aborted && dataScope.current === scope;
    const errors: string[] = [];
    const jobs: Promise<unknown>[] = [];
    if (!background) setSectionError('');
    function read<T>(path: string, setter: Dispatch<SetStateAction<T>>, params?: Record<string, unknown>, onData?: (data: T) => void) {
      jobs.push(api.get<T>(path, { params, signal: controller.signal, timeout: 15000 }).then(({ data }) => {
        if (!current() || (background && isRefreshPaused())) return;
        // Identical responses must not reset downstream forms or trigger another fetch.
        setter(previous => JSON.stringify(previous) === JSON.stringify(data) ? previous : data);
        onData?.(data);
        if (path === '/companies') companiesScope.current = scope;
      }).catch(error => { if (current()) errors.push(apiErrorMessage(error)); }));
    }
    const inView = (...tabs: Tab[]) => tabs.includes(activeTab);
    if (companiesScope.current !== scope) {
      if (isAdmin) read('/companies', setCompanies);
      else if (activeTab !== 'dashboard') jobs.push(api.get<Summary>('/companies/summary', { params: { scope }, signal: controller.signal, timeout: 15000 }).then(({ data }) => {
        if (current()) { setCompanies(data.empresas); companiesScope.current = scope; }
      }).catch(error => { if (current()) errors.push(apiErrorMessage(error)); }));
    }
    if (activeTab === 'dashboard') read('/companies/summary', setSummary, { scope }, result => {
      if (!isAdmin && result) { setCompanies(result.empresas); companiesScope.current = scope; }
    });
    if (permissions.viewProspects && inView('dashboard', 'prospects', 'installations')) {
      jobs.push(loadProspects(background, controller.signal).then(ok => { if (!ok && current()) errors.push('No se pudieron actualizar los prospectos. Inténtalo nuevamente.'); }));
    }
    if (inView('prospects', 'customers', 'plans')) read('/plans', setPlans, { scope, includeInactive: permissions.managePlans ? 'true' : undefined });
    if ((canManageCustomers || permissions.installEquipment) && inView('dashboard', 'customers', 'installations', 'commercial')) read('/customers', setCustomers, { scope });
    if (canViewInstallations && inView('dashboard', 'installations')) read('/prospects/pending-activation', setPendingActivationProspects, { scope });
    if (canViewInventory && activeTab === 'installations') read('/inventory', setInventory, { scope });
    if (canViewTickets && inView('dashboard', 'tickets')) read('/tickets', setTickets, { scope });
    if (canViewTickets && activeTab === 'tickets') read('/tickets/categories', setTicketCategories);
    if ((canViewWorkOrders || canViewInstallations) && inView('dashboard', 'installations', 'workOrders')) read('/work-orders', setWorkOrders, { scope });
    if (isAdmin && activeTab === 'users') { read('/users', setUsers); read('/users/roles', setRoles); }
    if (isAdmin && activeTab === 'audit') read('/audit', setAudit, { limit: 40 });
    await Promise.all(jobs);
    if (!current()) return false;
    setSectionError(errors.length ? 'No se pudieron actualizar los datos de esta sección. Inténtalo nuevamente.' : '');
    if (dataRequest.current === controller) dataRequest.current = null;
    return errors.length === 0;
  }

  useEffect(() => {
    if (loadedScope.current !== scope) {
      loadedScope.current = scope;
      setSummary(null); setProspects([]); setCustomers([]); setPendingActivationProspects([]);
      setWorkOrders([]); setPlans([]); setInventory([]);
      setTickets([]); setTicketCategories([]); setUsers([]); setRoles([]); setAudit([]);
    }
    void loadData();
    return () => {
      dataRequest.current?.abort(); dataRequest.current = null;
      prospectsRequest.current?.abort();
    };
  }, [scope, activeTab]);

  useAutoRefresh(() => loadData(true));

  function logout() {
    clearSession();
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

        <section className="content-shell">
          {sectionError && <div className="section-read-error" role="status">
            <span>{sectionError}</span> <button type="button" className="link-button" onClick={() => void loadData()}>Reintentar</button>
          </div>}
          {activeTab === 'dashboard' && (
            <DashboardHome
              summary={summary}
              prospects={prospects}
              customers={customers}
              tickets={tickets}
              workOrders={workOrders}
              scope={scope}
              companies={companies}
              permissions={permissions}
              onNavigate={setActiveTab}
              onOpenTicket={(id) => { setFocusedTicketId(id); setActiveTab('tickets'); }}
              onOpenControlBook={alert => {
                if (!permissions.viewControlBook || !alert.idCliente || !alert.idEmpresa) return;
                setScope(String(alert.idEmpresa));
                setControlBookFocus({ idCliente: alert.idCliente, idEmpresa: alert.idEmpresa });
                setActiveTab('commercial');
              }}
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
              scope={scope}
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
            <CoverageZonesPanel idEmpresa={writeCompanyId} scope={scope} companies={companies} canManage={permissions.managePaymentZones} />
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
              focusedContractId={focusedInstallationContractId}
              onFocusConsumed={() => { setFocusedInstallationProspectId(null); setFocusedInstallationContractId(null); }}
              onChanged={() => void loadData()}
            />
          )}
          {(activeTab === 'customers' || visitedModules.includes('customers')) && canManageCustomers && (
            <div hidden={activeTab !== 'customers'}>
            <CustomersPanel
              active={activeTab === 'customers'}
              writeCompanyId={writeCompanyId}
              companies={companies}
              pendingInstallationsView={customerPendingView}
              onPendingInstallationsViewConsumed={() => setCustomerPendingView(null)}
              customers={customers}
              plans={plans}
              scope={scope}
              permissions={permissions}
              profileEditor={{ admin: isAdmin, idEmpresa: user.idEmpresa }}
              onProfileUpdated={(profile) => setCustomers(current => current.map(customer => customer.idCliente === profile.idCliente ? { ...customer, ...profile } : customer))}
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
              customerFocus={controlBookFocus}
              onCustomerFocusConsumed={() => setControlBookFocus(null)}
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
            <TicketsPanel tickets={tickets} categories={ticketCategories} permissions={permissions} users={users} focusedTicketId={focusedTicketId} onFocusConsumed={() => setFocusedTicketId(null)} onChanged={() => void loadData()} />
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
