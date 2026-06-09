import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  api,
  apiErrorMessage,
  AuditLog,
  AuthUser,
  Company,
  Customer,
  InventoryUnit,
  Plan,
  Prospect,
  Role,
  Ticket,
  TicketCategory,
  UserRow,
  WorkOrder,
} from './api';

type Tab = 'prospects' | 'customers' | 'inventory' | 'tickets' | 'workOrders' | 'reports' | 'rut' | 'import' | 'users' | 'audit';

type Summary = {
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
};

const emptyProspectForm: ProspectFormState = {
  rut: '',
  nombreCompleto: '',
  email: '',
  telefono: '',
  direccion: '',
};

const rutPattern = /^\d{7,8}-[\dkK]$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const chileanMobilePattern = /^\+?56?9\d{8}$/;
const macPattern = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

function normalizeRutInput(value: string) {
  return value.trim().replace(/\./g, '').toUpperCase();
}

function validateProspectForm(form: ProspectFormState) {
  const rut = normalizeRutInput(form.rut);
  const nombreCompleto = form.nombreCompleto.trim();
  const email = form.email.trim().toLowerCase();
  const telefono = form.telefono.trim();
  const direccion = form.direccion.trim();

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

  return '';
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('finet_user');
    return stored ? (JSON.parse(stored) as AuthUser) : null;
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
      localStorage.setItem('finet_token', data.accessToken);
      localStorage.setItem('finet_user', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-label="Acceso FiNet">
        <section className="login-panel">
          <div className="login-heading">
            <h1>FiNet y Cable Magico</h1>
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
  const isAdmin = user.roles.includes('Administrador');
  const canManageCustomers = user.roles.some((role) => ['Administrador', 'Comercial', 'Soporte'].includes(role));
  const canViewInventory = user.roles.some((role) => ['Administrador', 'Soporte', 'Terreno'].includes(role));
  const canViewTickets = user.roles.some((role) => ['Administrador', 'Comercial', 'Soporte', 'Terreno'].includes(role));
  const canViewWorkOrders = user.roles.some((role) => ['Administrador', 'Soporte', 'Terreno'].includes(role));

  const writeCompanyId = useMemo(() => {
    if (scope !== 'consolidado') {
      return Number(scope);
    }

    return user.idEmpresa ?? companies[0]?.idEmpresa ?? 1;
  }, [companies, scope, user.idEmpresa]);

  async function loadData() {
    setMessage('');

    try {
      const [summaryResponse, prospectsResponse, plansResponse, customersResponse, inventoryResponse, ticketsResponse, categoriesResponse, workOrdersResponse] = await Promise.all([
        api.get<Summary>('/companies/summary', { params: { scope } }),
        api.get<Prospect[]>('/prospects', { params: { scope } }),
        api.get<Plan[]>('/plans', { params: { scope } }),
        canManageCustomers ? api.get<Customer[]>('/customers', { params: { scope } }) : Promise.resolve({ data: [] as Customer[] }),
        canViewInventory ? api.get<InventoryUnit[]>('/inventory', { params: { scope } }) : Promise.resolve({ data: [] as InventoryUnit[] }),
        canViewTickets ? api.get<Ticket[]>('/tickets', { params: { scope } }) : Promise.resolve({ data: [] as Ticket[] }),
        canViewTickets ? api.get<TicketCategory[]>('/tickets/categories') : Promise.resolve({ data: [] as TicketCategory[] }),
        canViewWorkOrders ? api.get<WorkOrder[]>('/work-orders', { params: { scope } }) : Promise.resolve({ data: [] as WorkOrder[] }),
      ]);
      setSummary(summaryResponse.data);
      setProspects(prospectsResponse.data);
      setPlans(plansResponse.data);
      setCustomers(customersResponse.data);
      setInventory(inventoryResponse.data);
      setTickets(ticketsResponse.data);
      setTicketCategories(categoriesResponse.data);
      setWorkOrders(workOrdersResponse.data);

      if (isAdmin) {
        const [companiesResponse, usersResponse, rolesResponse, auditResponse] = await Promise.all([
          api.get<Company[]>('/companies'),
          api.get<UserRow[]>('/users'),
          api.get<Role[]>('/users/roles'),
          api.get<AuditLog[]>('/audit', { params: { limit: 40 } }),
        ]);
        setCompanies(companiesResponse.data);
        setUsers(usersResponse.data);
        setRoles(rolesResponse.data);
        setAudit(auditResponse.data);
      }
    } catch (err) {
      setMessage(apiErrorMessage(err));
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
          <p className="eyebrow">Primer incremento</p>
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
            OTs
          </TabButton>
        )}
        <TabButton current={activeTab} value="rut" onClick={setActiveTab}>
          RUT
        </TabButton>
        {isAdmin && (
          <>
            <TabButton current={activeTab} value="reports" onClick={setActiveTab}>
              Reportes
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
          onCreated={() => void loadData()}
        />
      )}
      {activeTab === 'rut' && <RutPanel />}
      {activeTab === 'customers' && canManageCustomers && <CustomersPanel customers={customers} onChanged={() => void loadData()} />}
      {activeTab === 'inventory' && canViewInventory && (
        <InventoryPanel inventory={inventory} customers={customers} writeCompanyId={writeCompanyId} onChanged={() => void loadData()} />
      )}
      {activeTab === 'tickets' && canViewTickets && (
        <TicketsPanel tickets={tickets} categories={ticketCategories} onChanged={() => void loadData()} />
      )}
      {activeTab === 'workOrders' && canViewWorkOrders && <WorkOrdersPanel workOrders={workOrders} onChanged={() => void loadData()} />}
      {activeTab === 'reports' && isAdmin && <ReportsPanel scope={scope} />}
      {activeTab === 'import' && isAdmin && (
        <ImportPanel writeCompanyId={writeCompanyId} onImported={() => void loadData()} />
      )}
      {activeTab === 'users' && isAdmin && (
        <UsersPanel users={users} roles={roles} onUpdated={() => void loadData()} />
      )}
      {activeTab === 'audit' && isAdmin && <AuditPanel audit={audit} />}
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

function ProspectsPanel({
  prospects,
  plans,
  writeCompanyId,
  onCreated,
}: {
  prospects: Prospect[];
  plans: Plan[];
  writeCompanyId: number;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<ProspectFormState>(emptyProspectForm);
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selectedProspect = prospects.find((prospect) => prospect.idProspecto === selectedId) ?? prospects[0] ?? null;

  useEffect(() => {
    if (!selectedId && prospects[0]) {
      setSelectedId(prospects[0].idProspecto);
    }
  }, [prospects, selectedId]);

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
      <form className="panel stack" onSubmit={submit}>
        <h2>Nuevo prospecto</h2>
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
        <button>Guardar prospecto</button>
      </form>

      <section className="panel">
        <h2>Prospectos recientes</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>RUT</th>
                <th>Nombre</th>
                <th>Estado</th>
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
                  <td>{prospect.empresa?.nombre ?? '-'}</td>
                  <td>
                    <button className="secondary compact" onClick={() => setSelectedId(prospect.idProspecto)}>
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedProspect && (
          <ProspectWorkflowPanel
            prospect={selectedProspect}
            plans={plans}
            onChanged={onCreated}
          />
        )}
      </section>
    </section>
  );
}

function ProspectWorkflowPanel({
  prospect,
  plans,
  onChanged,
}: {
  prospect: Prospect;
  plans: Plan[];
  onChanged: () => void;
}) {
  const [pipelineStatus, setPipelineStatus] = useState(prospect.estadoPipeline ?? 'Prospecto Nuevo');
  const [feasibilityResult, setFeasibilityResult] = useState<'Factible' | 'No Factible'>('Factible');
  const [quotePlanId, setQuotePlanId] = useState('');
  const [lossReason, setLossReason] = useState('Sin cobertura');
  const [contractPlanId, setContractPlanId] = useState('');
  const [dueDay, setDueDay] = useState(5);
  const [installDate, setInstallDate] = useState('');
  const [installPriority, setInstallPriority] = useState('Media');
  const [status, setStatus] = useState('');

  useEffect(() => {
    setPipelineStatus(prospect.estadoPipeline ?? 'Prospecto Nuevo');
  }, [prospect.idProspecto, prospect.estadoPipeline]);

  const planOptions = plans.filter((plan) => !plan.idEmpresa || !prospect.empresa || plan.idEmpresa === prospect.empresa.idEmpresa);

  async function runAction(action: () => Promise<unknown>, success: string) {
    setStatus('');

    try {
      await action();
      setStatus(success);
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function generateQuote() {
    const { data } = await api.post(`/prospects/${prospect.idProspecto}/quotes`, { planId: Number(quotePlanId) });
    const pdf = await api.get(data.pdfUrl, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(pdf.data);
    window.open(objectUrl, '_blank');
  }

  return (
    <div className="workflow-panel">
      <h3>{prospect.nombreCompleto}</h3>
      <div className="workflow-grid">
        <label>
          Pipeline
          <select value={pipelineStatus} onChange={(event) => setPipelineStatus(event.target.value)}>
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
                'Pipeline actualizado',
              )
            }
          >
            Actualizar
          </button>
        </label>

        <label>
          Factibilidad
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
            Guardar
          </button>
        </label>

        <label>
          Cotizacion
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
            onClick={() => void runAction(generateQuote, 'Cotizacion generada')}
          >
            Generar PDF
          </button>
        </label>

        <label>
          Perdida
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
            Marcar
          </button>
        </label>

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
            Registrar
          </button>
        </label>

        <label>
          Orden instalacion
          <input type="date" value={installDate} onChange={(event) => setInstallDate(event.target.value)} />
          <select value={installPriority} onChange={(event) => setInstallPriority(event.target.value)}>
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>
          <button
            type="button"
            disabled={!installDate}
            onClick={() =>
              void runAction(
                () =>
                  api.post(`/prospects/${prospect.idProspecto}/install-orders`, {
                    fechaProgramada: installDate,
                    prioridad: installPriority,
                  }),
                'Orden de instalacion creada',
              )
            }
          >
            Crear OT
          </button>
        </label>
      </div>
      {status && <p className="inline-status">{status}</p>}
    </div>
  );
}

type CustomerHistory = {
  contratos: Array<{ idContrato: number; estado: string | null; plan?: Plan | null }>;
  tickets: Array<{ idTicket: number; estado: string; prioridad: string; descripcion: string | null }>;
  ordenes: Array<{ idOt: number; tipoOt: string; estado: string; observaciones: string | null }>;
  equipos: Array<{ idUnidad: number; numeroSerie: string; estado: string; modelo: string | null }>;
  auditoria: Array<{ idLog: string; accion: string; fechaHora: string | null }>;
};

function CustomersPanel({ customers, onChanged }: { customers: Customer[]; onChanged: () => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusValue, setStatusValue] = useState('Activo');
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [status, setStatus] = useState('');

  const selectedCustomer = customers.find((customer) => customer.idCliente === selectedId) ?? customers[0] ?? null;

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
    }
  }, [selectedCustomer?.idCliente]);

  async function updateCustomerStatus() {
    if (!selectedCustomer) {
      return;
    }

    try {
      await api.patch(`/customers/${selectedCustomer.idCliente}/status`, { estado: statusValue });
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

  return (
    <section className="workspace-grid">
      <section className="panel">
        <h2>Clientes</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>RUT</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.idCliente}>
                  <td>{customer.rut ?? '-'}</td>
                  <td>{customer.nombreCompleto}</td>
                  <td>{customer.estado}</td>
                  <td>
                    <button className="secondary compact" onClick={() => setSelectedId(customer.idCliente)}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel stack">
        <h2>Gestion de cliente</h2>
        {selectedCustomer ? (
          <>
            <p className="detail-line">
              {selectedCustomer.nombreCompleto} - {selectedCustomer.rut ?? 'sin RUT'}
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
                Actualizar estado
              </button>
              <button type="button" className="secondary" onClick={loadHistory}>
                Ver historial
              </button>
            </div>
            {status && <p className="inline-status">{status}</p>}
            {history && (
              <div className="history-grid">
                <HistoryBox title="Contratos" value={history.contratos.length} />
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
    </section>
  );
}

function HistoryBox({ title, value }: { title: string; value: number }) {
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
  writeCompanyId,
  onChanged,
}: {
  inventory: InventoryUnit[];
  customers: Customer[];
  writeCompanyId: number;
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState({ numeroSerie: '', modelo: '', tipoNombre: 'Router/ONU' });
  const [movementForm, setMovementForm] = useState({ tipoMovimiento: 'Compra', idCliente: '', idEmpresaDestino: '' });
  const [statusForm, setStatusForm] = useState({ estado: 'Disponible', motivo: '' });
  const [installForm, setInstallForm] = useState({ idCliente: '', macAddress: '', puertoOlt: '', modelo: '' });
  const [status, setStatus] = useState('');

  const selectedUnit = inventory.find((unit) => unit.idUnidad === selectedId) ?? inventory[0] ?? null;

  useEffect(() => {
    if (!selectedId && inventory[0]) {
      setSelectedId(inventory[0].idUnidad);
    }
  }, [inventory, selectedId]);

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
      <form
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
      </form>

      <section className="panel">
        <h2>Inventario</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Serie</th>
                <th>Modelo</th>
                <th>Tipo</th>
                <th>Estado</th>
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
                  <td>
                    <button className="secondary compact" onClick={() => setSelectedId(unit.idUnidad)}>
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedUnit && (
          <div className="workflow-panel">
            <h3>{selectedUnit.numeroSerie}</h3>
            <div className="workflow-grid">
              <label>
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
              </label>

              <label>
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
              </label>

              <label>
                Instalar router/ONU
                <select value={installForm.idCliente} onChange={(event) => setInstallForm({ ...installForm, idCliente: event.target.value })}>
                  <option value="">Seleccionar cliente</option>
                  {customers.map((customer) => (
                    <option key={customer.idCliente} value={customer.idCliente}>
                      {customer.nombreCompleto}
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
                  disabled={!installForm.idCliente}
                  onClick={() =>
                    !macPattern.test(installForm.macAddress.trim())
                      ? setStatus('Ingresa una MAC valida, por ejemplo AA:BB:CC:DD:EE:FF.')
                      : void run(
                          () =>
                            api.post(`/inventory/equipment/${selectedUnitPayload()}/install`, {
                              idCliente: Number(installForm.idCliente),
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
              </label>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

function TicketsPanel({
  tickets,
  categories,
  onChanged,
}: {
  tickets: Ticket[];
  categories: TicketCategory[];
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState({ rut: '', idCategoria: '', prioridad: 'Media', descripcion: '' });
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

  return (
    <section className="workspace-grid">
      <form
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
                prioridad: createForm.prioridad,
                descripcion: createForm.descripcion.trim(),
              }),
            'Ticket creado',
          );
        }}
      >
        <h2>Nuevo ticket</h2>
        <label>
          RUT cliente
          <input
            value={createForm.rut}
            onChange={(event) => setCreateForm({ ...createForm, rut: event.target.value })}
            placeholder="11111111-1"
            required
          />
        </label>
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
      </form>

      <section className="panel">
        <h2>Tickets</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Cliente</th>
                <th>Categoria</th>
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

        {selectedTicket && (
          <div className="workflow-panel">
            <h3>{selectedTicket.codigoSeguimiento ?? `Ticket ${selectedTicket.idTicket}`}</h3>
            <div className="workflow-grid">
              <label>
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
              </label>

              <label>
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
              </label>

              <label>
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
              </label>

              <label>
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
              </label>
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

  const selectedOrder = workOrders.find((order) => order.idOt === selectedId) ?? workOrders[0] ?? null;

  useEffect(() => {
    if (!selectedId && workOrders[0]) {
      setSelectedId(workOrders[0].idOt);
    }
  }, [workOrders, selectedId]);

  async function completeInstallation() {
    if (!selectedOrder) {
      return;
    }

    try {
      await api.patch(`/work-orders/${selectedOrder.idOt}/complete-installation`, {
        potenciaOpticaDbm: form.potenciaOpticaDbm ? Number(form.potenciaOpticaDbm) : undefined,
        observaciones: form.observaciones,
      });
      setStatus('Instalacion completada y cliente activado');
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  return (
    <section className="workspace-grid">
      <section className="panel">
        <h2>Ordenes de trabajo</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Tipo</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((order) => (
                <tr key={order.idOt}>
                  <td>{order.idOt}</td>
                  <td>{order.tipoOt}</td>
                  <td>{order.prioridad}</td>
                  <td>{order.estado}</td>
                  <td>{order.fechaProgramada ? new Date(order.fechaProgramada).toLocaleDateString() : '-'}</td>
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
        <h2>Cierre de instalacion</h2>
        {selectedOrder ? (
          <>
            <p className="detail-line">
              OT {selectedOrder.idOt} - {selectedOrder.tipoOt} - {selectedOrder.estado}
            </p>
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
            <button type="button" onClick={completeInstallation}>
              Completar instalacion
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

function ReportsPanel({ scope }: { scope: string }) {
  const [type, setType] = useState('clientes');
  const [format, setFormat] = useState('csv');
  const [status, setStatus] = useState('');

  async function exportReport() {
    try {
      const response = await api.get('/reports/export', {
        params: { type, format, scope },
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
      <h2>Reportes</h2>
      <label>
        Tipo
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="clientes">Clientes</option>
          <option value="prospectos">Prospectos</option>
          <option value="tickets">Tickets</option>
          <option value="inventario">Inventario</option>
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
        Exportar
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
