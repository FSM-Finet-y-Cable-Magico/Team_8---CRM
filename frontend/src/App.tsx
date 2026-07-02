import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  api,
  apiErrorMessage,
  AuditLog,
  AuthUser,
  Company,
  Customer,
  CustomerService,
  InstallAvailability,
  InventoryUnit,
  Plan,
  Prospect,
  Role,
  Ticket,
  TicketCategory,
  UserRow,
  WorkOrder,
} from './api';
import { DashboardPermissions, getDashboardPermissions, hasPermission, normalizeUserRoles } from './permissions';

type Tab = 'prospects' | 'installations' | 'customers' | 'inventory' | 'tickets' | 'workOrders' | 'reports' | 'rut' | 'import' | 'users' | 'audit';

type Summary = {
  scope: string;
  empresas: Company[];
  metricas: {
    clientes: number;
    prospectos: number;
  };
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

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  return <Dashboard user={user} onLogout={() => setUser(null)} />;
}

function LoginScreen({ onLogin }: { onLogin: (user: AuthUser) => void }) {
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
        </section>
      </section>
    </main>
  );
}

function Dashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('prospects');
  const [scope, setScope] = useState('consolidado');
  const [focusedInstallationProspectId, setFocusedInstallationProspectId] = useState<number | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryUnit[]>([]);
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
    const [summaryResult, prospectsResult, plansResult, customersResult, inventoryResult, ticketsResult, categoriesResult, workOrdersResult] = await Promise.allSettled([
      api.get<Summary>('/companies/summary', { params: { scope } }),
      api.get<Prospect[]>('/prospects', { params: { scope } }),
      api.get<Plan[]>('/plans', { params: { scope } }),
      loadCustomers ? api.get<Customer[]>('/customers', { params: { scope } }) : Promise.resolve({ data: [] as Customer[] }),
      canViewInventory ? api.get<InventoryUnit[]>('/inventory', { params: { scope } }) : Promise.resolve({ data: [] as InventoryUnit[] }),
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          
          <h1>CRM FiNet</h1>
        </div>
        <div className="topbar-actions">
          {isAdmin && (
            <label className="select-label">
              Empresa
              <select value={scope} onChange={(event) => setScope(event.target.value)}>
                <option value="consolidado">Consolidado</option>
                {companies.map((company) => (
                  <option key={company.idEmpresa} value={company.idEmpresa}>
                    {company.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="user-chip">{user.nombreCompleto}</span>
          <button className="secondary" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      <section className="metrics">
        <Metric label="Clientes" value={summary?.metricas.clientes ?? 0} />
        <Metric label="Prospectos" value={summary?.metricas.prospectos ?? 0} />
        <Metric label="Empresa de trabajo" value={companies.find((company) => company.idEmpresa === writeCompanyId)?.nombre ?? 'FiNet'} />
      </section>

      {message && <p className="alert">{message}</p>}

      <nav className="tabs">
        <TabButton current={activeTab} value="prospects" onClick={setActiveTab}>
          Prospectos
        </TabButton>
        {canViewInstallations && (
          <TabButton current={activeTab} value="installations" onClick={setActiveTab}>
            Instalaciones
          </TabButton>
        )}
        {canManageCustomers && (
          <TabButton current={activeTab} value="customers" onClick={setActiveTab}>
            Clientes
          </TabButton>
        )}
        {canViewInventory && (
          <TabButton current={activeTab} value="inventory" onClick={setActiveTab}>
            Inventario
          </TabButton>
        )}
        {canViewTickets && (
          <TabButton current={activeTab} value="tickets" onClick={setActiveTab}>
            Tickets
          </TabButton>
        )}
        {canViewWorkOrders && (
          <TabButton current={activeTab} value="workOrders" onClick={setActiveTab}>
            Órdenes de Trabajo
          </TabButton>
        )}
        <TabButton current={activeTab} value="rut" onClick={setActiveTab}>
          RUT
        </TabButton>
        {isAdmin && (
          <>
            <TabButton current={activeTab} value="reports" onClick={setActiveTab}>
              Reportes operativos
            </TabButton>
            <TabButton current={activeTab} value="import" onClick={setActiveTab}>
              Importacion
            </TabButton>
            <TabButton current={activeTab} value="users" onClick={setActiveTab}>
              Usuarios
            </TabButton>
            <TabButton current={activeTab} value="audit" onClick={setActiveTab}>
              Auditoria
            </TabButton>
          </>
        )}
      </nav>

      {activeTab === 'prospects' && (
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
      {activeTab === 'rut' && <RutPanel />}
      {activeTab === 'customers' && canManageCustomers && (
        <CustomersPanel customers={customers} scope={scope} permissions={permissions} onChanged={() => void loadData()} />
      )}
      {activeTab === 'inventory' && canViewInventory && (
        <InventoryPanel
          inventory={inventory}
          customers={customers}
          workOrders={workOrders}
          writeCompanyId={writeCompanyId}
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
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function TabButton({
  current,
  value,
  onClick,
  children,
}: {
  current: Tab;
  value: Tab;
  onClick: (tab: Tab) => void;
  children: string;
}) {
  return (
    <button className={current === value ? 'tab active' : 'tab'} onClick={() => onClick(value)}>
      {children}
    </button>
  );
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
          <button type="button" className="secondary compact" onClick={onClose}>
            Cerrar
          </button>
        </header>
        {children}
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
        <form className="panel stack" onSubmit={submit}>
          <h2>Registrando nuevo prospecto comercial</h2>
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

      <section className="panel">
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
    <div className="workflow-panel modal-workflow">
      <section className="customer-preview">
        <h3>{prospect.nombreCompleto}</h3>
        <p><strong>RUT:</strong> {prospect.rut ?? '-'}</p>
        <p><strong>Teléfono:</strong> {prospect.telefono ?? '-'}</p>
        <p><strong>Correo:</strong> {prospect.email ?? '-'}</p>
        <p><strong>Estado:</strong> {prospect.estadoPipeline ?? '-'}</p>
        <p><strong>Origen:</strong> {prospect.origenContacto ?? '-'}</p>
      </section>
      <div className="workflow-grid">
        {permissions.manageProspectPipeline && <label>
          Actualizar estado del prospecto en el pipeline
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
          <button
            type="button"
            onClick={() =>
              void runAction(
                () => api.patch(`/prospects/${prospect.idProspecto}/pipeline`, { estadoPipeline: pipelineStatus }),
                prospect.estadoPipeline === 'Perdido' ? 'Prospecto reactivado y pipeline actualizado' : 'Pipeline actualizado',
              )
            }
          >
            Actualizar Estado
          </button>
        </label>}

        {permissions.verifyFeasibility && <label>
          Verificando factibilidad técnica de instalación
          <select value={feasibilityResult} onChange={(event) => setFeasibilityResult(event.target.value as 'Factible' | 'No Factible')}>
            <option value="Factible">Factible</option>
            <option value="No Factible">No Factible</option>
          </select>
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
        </label>}

        {permissions.generateQuotes && <label>
          Generando cotización en formato PDF
          <select value={quotePlanId} onChange={(event) => setQuotePlanId(event.target.value)}>
            <option value="">Seleccionar plan</option>
            {planOptions.map((plan) => (
              <option key={plan.idPlan} value={plan.idPlan}>
                {plan.nombreComercial}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!quotePlanId}
            onClick={() => void generateQuote()}
          >
            Generar Cotización
          </button>
        </label>}

        {permissions.recordProspectLoss && <label>
          Registrando motivo de pérdida de prospecto
          <select value={lossReason} onChange={(event) => setLossReason(event.target.value)}>
            {['Sin cobertura', 'Precio', 'No responde', 'Competencia', 'Otro'].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
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
            Marcar como Perdido
          </button>
        </label>}

        {permissions.contractPlans && <label>
          Registrando tipo de plan contratado por el cliente
          <select value={contractPlanId} onChange={(event) => setContractPlanId(event.target.value)}>
            <option value="">Seleccionar plan</option>
            {planOptions.map((plan) => (
              <option key={plan.idPlan} value={plan.idPlan}>
                {plan.nombreComercial}
              </option>
            ))}
          </select>
          <input
            min="1"
            max="28"
            type="number"
            value={dueDay}
            onChange={(event) => setDueDay(Number(event.target.value))}
          />
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
        </label>}

        {permissions.createInstallOrders && prospect.estadoPipeline === 'Aceptado' && Boolean(prospect.idCliente) && (
          <label>
            Agenda de instalación
            <button type="button" onClick={onOpenInstallation}>
              Generar instalación
            </button>
          </label>
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
                <th>OT</th>
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
        `Orden de Instalación OT ${data.orden.idOt} creada y asignada a ${data.orden.tecnico.nombreCompleto}. ` +
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

  const visibleCustomers = searchResults ?? customers;
  const selectedCustomer =
    visibleCustomers.find((customer) => customer.idCliente === selectedId) ?? visibleCustomers[0] ?? null;
  const selectedService =
    services.find((service) => service.idServicio === selectedServiceId) ?? services[0] ?? null;
  const contractOptions = selectedCustomer?.contratos ?? [];
  const customerCompanyId = scope !== 'consolidado'
    ? Number(scope)
    : selectedCustomer?.idEmpresa ?? contractOptions[0]?.idEmpresa ?? undefined;

  useEffect(() => {
    if (!selectedId && customers[0]) {
      setSelectedId(customers[0].idCliente);
      setStatusValue(customers[0].estado);
    }
  }, [customers, selectedId]);

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
    }
  }, [selectedCustomer?.idCliente]);

  useEffect(() => {
    if (!selectedService) {
      setServiceUpdateForm(emptyServiceForm());
      return;
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
      setSelectedId(data[0]?.idCliente ?? null);
      setStatus(data.length ? `${data.length} cliente(s) encontrado(s)` : 'No se encontraron clientes');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  function clearSearch() {
    setSearchTerm('');
    setSearchResults(null);
    setSelectedId(customers[0]?.idCliente ?? null);
    setStatus('');
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
    <section className="workspace-grid">
      <section className="panel">
        <h2>Consultando historial completo del cliente</h2>
        <form className="customer-search" onSubmit={searchCustomers}>
          <label>
            Buscar cliente por RUT, teléfono, nombre o número de contrato
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Ej.: 12345678-5, +569..., Ana Pérez o 25"
            />
          </label>
          <div className="button-row">
            <button type="submit">Buscar cliente</button>
            {searchResults && (
              <button type="button" className="secondary" onClick={clearSearch}>
                Limpiar búsqueda
              </button>
            )}
          </div>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>RUT</th>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th>Origen</th>
                <th>Empresas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleCustomers.map((customer) => (
                <tr key={customer.idCliente}>
                  <td>{customer.rut ?? '-'}</td>
                  <td>{customer.nombreCompleto}</td>
                  <td>{customer.telefono ?? '-'}</td>
                  <td>{customer.estado}</td>
                  <td>{customer.origenContacto ?? '-'}</td>
                  <td>{customer.empresas?.join(', ') || customer.empresa?.nombre || '-'}</td>
                  <td>
                    <button className="secondary compact" onClick={() => setSelectedId(customer.idCliente)}>
                      Gestionar cliente
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel stack">
        <h2>Actualizando estado operativo del cliente</h2>
        {selectedCustomer ? (
          <>
            <p className="detail-line">
              {selectedCustomer.nombreCompleto} - {selectedCustomer.rut ?? 'sin RUT'}
            </p>
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
      </section>

      <section className="panel stack full-width-panel">
        <h2>Perfil individual de servicios contratados</h2>
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
              <div className="workflow-panel">
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
                          OT {order.idOt} - {order.tipoOt} - {order.estado} - {formatDateOnly(order.fechaProgramada)}
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
              <div className="workflow-grid">
                <form className="stack" onSubmit={createService}>
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
                  <form className="stack" onSubmit={updateService}>
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
                      placeholder="Observaciones tecnicas"
                      value={serviceUpdateForm.observacionesTecnicas}
                      onChange={(event) => setServiceUpdateForm({ ...serviceUpdateForm, observacionesTecnicas: event.target.value })}
                    />
                    <button type="submit">Actualizar perfil de servicio</button>
                  </form>
                )}
              </div>
            )}

            {permissions.manageServices && selectedService && (
              <form className="stack" onSubmit={attachEquipment}>
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
      </section>
    </section>
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

function InventoryPanel({
  inventory,
  customers,
  workOrders,
  writeCompanyId,
  permissions,
  onChanged,
}: {
  inventory: InventoryUnit[];
  customers: Customer[];
  workOrders: WorkOrder[];
  writeCompanyId: number;
  permissions: DashboardPermissions;
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState({ numeroSerie: '', modelo: '', tipoNombre: 'Router/ONU' });
  const [movementForm, setMovementForm] = useState({ tipoMovimiento: 'Compra', idCliente: '', idEmpresaDestino: '' });
  const [statusForm, setStatusForm] = useState({ estado: 'Disponible', motivo: '' });
  const [installForm, setInstallForm] = useState({ idCliente: '', idOt: '', macAddress: '', puertoOlt: '', modelo: '' });
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
                  {['Disponible', 'En Revision', 'Instalado', 'Baja Definitiva'].map((item) => (
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
                      OT {order.idOt} - {order.estado}
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
  const [status, setStatus] = useState('');
  const [customerPreview, setCustomerPreview] = useState<Customer | null>(null);
  const [ticketServices, setTicketServices] = useState<CustomerService[]>([]);
  const [customerLookupStatus, setCustomerLookupStatus] = useState('');

  const selectedTicket = tickets.find((ticket) => ticket.idTicket === selectedId) ?? tickets[0] ?? null;

  useEffect(() => {
    if (!selectedId && tickets[0]) {
      setSelectedId(tickets[0].idTicket);
    }
  }, [tickets, selectedId]);

  useEffect(() => {
    if (selectedTicket) {
      setCategoryId(String(selectedTicket.idCategoria));
      setPriority(selectedTicket.prioridad);
      setTicketStatus(selectedTicket.estado);
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
        className="panel stack"
        onSubmit={(event) => {
          event.preventDefault();
          const rut = normalizeRutInput(createForm.rut);

          if (!rutPattern.test(rut)) {
            setStatus('Ingresa el RUT del cliente con guion, por ejemplo 11111111-1.');
            return;
          }

          if (!createForm.idCategoria) {
            setStatus('Selecciona una categoria de falla.');
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
          Descripcion
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

      <section className="panel">
        <h2>Tickets</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Cliente</th>
                <th>Categoria</th>
                <th>Servicio</th>
                <th>Prioridad</th>
                <th>Estado</th>
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
                  <td>{ticket.prioridad}</td>
                  <td>{ticket.estado}</td>
                  <td>
                    <button className="secondary compact" onClick={() => setSelectedId(ticket.idTicket)}>
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedTicket && (permissions.classifyTickets || permissions.updateTicketStatus || permissions.diagnoseTickets) && (
          <div className="workflow-panel">
            <h3>{selectedTicket.codigoSeguimiento ?? `Ticket ${selectedTicket.idTicket}`}</h3>
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
          </div>
        )}
      </section>
    </section>
  );
}

function WorkOrdersPanel({ workOrders, onChanged }: { workOrders: WorkOrder[]; onChanged: () => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({ potenciaOpticaDbm: '', observaciones: '' });
  const [status, setStatus] = useState('');

  const installationOrders = workOrders.filter((order) => order.tipoOt === 'Instalacion');
  const selectedOrder =
    installationOrders.find((order) => order.idOt === selectedId) ?? installationOrders[0] ?? null;

  useEffect(() => {
    if (!selectedId && installationOrders[0]) {
      setSelectedId(installationOrders[0].idOt);
    }
  }, [installationOrders, selectedId]);

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
    <section className="workspace-grid">
      <section className="panel">
        <h2>Cerrando instalación y activando cliente</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Tipo</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Conexión</th>
                <th>Visita</th>
                <th>Técnico</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {installationOrders.map((order) => (
                <tr key={order.idOt}>
                  <td>{order.idOt}</td>
                  <td>{order.tipoOt}</td>
                  <td>{order.prioridad}</td>
                  <td>{order.estado}</td>
                  <td>{formatConnectionType(order.tipoConexion)}</td>
                  <td>
                    {order.fechaProgramada ? formatDateOnly(order.fechaProgramada) : '-'}
                    {order.horaVisita ? ` ${order.horaVisita}` : ''}
                  </td>
                  <td>{order.tecnico?.nombreCompleto ?? 'Sin asignar'}</td>
                  <td>
                    <button className="secondary compact" onClick={() => setSelectedId(order.idOt)}>
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel stack">
        <h2>Calculando tiempo de conversión del prospecto</h2>
        {selectedOrder ? (
          <>
            <p className="detail-line">
              OT {selectedOrder.idOt} - {selectedOrder.tipoOt} - {selectedOrder.estado}
            </p>
            <p className="detail-line">
              Tipo de conexión: {formatConnectionType(selectedOrder.tipoConexion)} - Visita:{' '}
              {selectedOrder.fechaProgramada ? formatDateOnly(selectedOrder.fechaProgramada) : 'Sin fecha'}{' '}
              {selectedOrder.horaVisita ?? 'Sin hora'} - Técnico: {selectedOrder.tecnico?.nombreCompleto ?? 'Sin asignar'}
            </p>
            {selectedOrder.observacionesAgenda && (
              <p className="detail-line">Observaciones de agenda: {selectedOrder.observacionesAgenda}</p>
            )}
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
            <label>
              Potencia optica dBm
              <input
                type="number"
                step="0.01"
                value={form.potenciaOpticaDbm}
                onChange={(event) => setForm({ ...form, potenciaOpticaDbm: event.target.value })}
              />
            </label>
            <label>
              Observaciones
              <textarea value={form.observaciones} onChange={(event) => setForm({ ...form, observaciones: event.target.value })} />
            </label>
            <button
              type="button"
              disabled={selectedOrder.estado === 'Completada' || !selectedOrder.prospecto?.fechaCreacion}
              onClick={completeInstallation}
            >
              Confirmar instalación y activar cliente
            </button>
            {status && <p className="inline-status">{status}</p>}
          </>
        ) : (
          <p className="inline-status">No hay ordenes de trabajo pendientes.</p>
        )}
      </section>
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
      setStatus('Reporte generado');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  return (
    <section className="panel narrow stack">
      <h2>Exportando reportes operativos</h2>
      <label>
        Tipo de reporte
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="clientes">Clientes</option>
          <option value="prospectos">Prospectos</option>
          <option value="tickets">Tickets</option>
          <option value="inventario">Inventario</option>
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
      <small>Periodo permitido: desde {formatDateOnly(reportMinimumDate)} hasta hoy.</small>
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
      <label>
        Formato
        <select value={format} onChange={(event) => setFormat(event.target.value)}>
          <option value="csv">CSV</option>
          <option value="xlsx">XLSX</option>
        </select>
      </label>
      <button type="button" onClick={exportReport}>
        Generar Reporte
      </button>
      {status && <p className="inline-status">{status}</p>}
    </section>
  );
}

function RutPanel() {
  const [rut, setRut] = useState('');
  const [result, setResult] = useState('');

  async function validate() {
    try {
      const { data } = await api.post('/rut/validate', { rut });
      setResult(data.valid ? `Valido: ${data.normalized}` : `Rechazado: ${data.reason}`);
    } catch (err) {
      setResult(apiErrorMessage(err));
    }
  }

  return (
    <section className="panel narrow stack">
      <h2>Validar RUT</h2>
      <label>
        RUT
        <input value={rut} onChange={(event) => setRut(event.target.value)} />
      </label>
      <button onClick={validate}>Validar</button>
      {result && <p className="inline-status">{result}</p>}
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
    <form className="panel narrow stack" onSubmit={submit}>
      <h2>Importacion masiva</h2>
      <input accept=".csv,.xls,.xlsx" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
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
    <section className="panel">
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
    <section className="panel">
      <h2>Auditoria</h2>
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
