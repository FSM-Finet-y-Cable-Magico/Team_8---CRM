import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, apiErrorMessage, AuditLog, AuthUser, Company, Plan, Prospect, Role, UserRow } from './api';

type Tab = 'prospects' | 'rut' | 'import' | 'users' | 'audit';

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
  const [email, setEmail] = useState('admin@finet.local');
  const [password, setPassword] = useState('Admin2026!');
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
      <section className="login-panel">
        <div>
          <p className="eyebrow">CRM operativo</p>
          <h1>FiNet y Cable Magico</h1>
        </div>
        <form onSubmit={submit} className="stack">
          <label>
            Correo
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
          </label>
          <label>
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
          </label>
          {error && <p className="alert">{error}</p>}
          <button disabled={loading}>{loading ? 'Ingresando...' : 'Ingresar'}</button>
        </form>
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
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [message, setMessage] = useState('');
  const isAdmin = user.roles.includes('Administrador');

  const writeCompanyId = useMemo(() => {
    if (scope !== 'consolidado') {
      return Number(scope);
    }

    return user.idEmpresa ?? companies[0]?.idEmpresa ?? 1;
  }, [companies, scope, user.idEmpresa]);

  async function loadData() {
    setMessage('');

    try {
      const [summaryResponse, prospectsResponse, plansResponse] = await Promise.all([
        api.get<Summary>('/companies/summary', { params: { scope } }),
        api.get<Prospect[]>('/prospects', { params: { scope } }),
        api.get<Plan[]>('/plans', { params: { scope } }),
      ]);
      setSummary(summaryResponse.data);
      setProspects(prospectsResponse.data);
      setPlans(plansResponse.data);

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
        <TabButton current={activeTab} value="rut" onClick={setActiveTab}>
          RUT
        </TabButton>
        {isAdmin && (
          <>
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

    try {
      await api.post('/prospects', { ...form, idEmpresa: writeCompanyId });
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
          <input value={form.rut} onChange={(event) => setForm({ ...form, rut: event.target.value })} />
        </label>
        <label>
          Nombre completo
          <input
            value={form.nombreCompleto}
            onChange={(event) => setForm({ ...form, nombreCompleto: event.target.value })}
          />
        </label>
        <label>
          Email
          <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" />
        </label>
        <label>
          Celular
          <input value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} />
        </label>
        <label>
          Direccion
          <input value={form.direccion} onChange={(event) => setForm({ ...form, direccion: event.target.value })} />
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
