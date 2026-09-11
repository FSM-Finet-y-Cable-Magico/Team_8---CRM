import { useEffect, useMemo, useState } from 'react';
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

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  return <Dashboard user={user} onLogout={() => setUser(null)} />;
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
      companiesResult,
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
      isAdmin ? api.get<Company[]>('/companies') : Promise.resolve({ data: [] as Company[] }),
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
    const companyOptions = isAdmin
      ? settledData(companiesResult, [] as Company[], errors)
      : summaryData?.empresas ?? [];

    setSummary(summaryData);
    setCompanies(companyOptions.length > 0 ? companyOptions : summaryData?.empresas ?? []);
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
              billingOverview={billingOverview}
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
            <UsersPanel users={users} roles={roles} companies={companies} onUpdated={() => void loadData()} />
          )}
          {activeTab === 'audit' && permissions.viewAudit && <AuditPanel audit={audit} />}
        </section>
      </section>
    </main>
  );
}
