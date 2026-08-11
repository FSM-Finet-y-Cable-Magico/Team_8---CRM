import { useEffect, useState } from 'react';
import {
  api,
  apiErrorMessage,
  CustomerService,
  PortalCustomer,
  Ticket,
  TicketCategory,
  TvipCredentialSummary,
  TvipGenerationResult,
} from './api';
import { PortalLogin } from './features/auth';
import { PortalHome } from './features/home';
import { PortalServices } from './features/services';
import { PortalTickets } from './features/tickets';
import { PortalTvip } from './features/tvip';

type TicketForm = {
  idCategoria: string;
  idServicio: string;
  prioridad: string;
  descripcion: string;
};

export function PortalApp() {
  const [token, setToken] = useState(() => localStorage.getItem('finet_portal_token') ?? '');
  const [customer, setCustomer] = useState<PortalCustomer | null>(() => {
    const stored = localStorage.getItem('finet_portal_customer');
    return stored ? JSON.parse(stored) as PortalCustomer : null;
  });
  const [services, setServices] = useState<CustomerService[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [tvip, setTvip] = useState<TvipCredentialSummary[]>([]);
  const [ticketForm, setTicketForm] = useState<TicketForm>({
    idCategoria: '',
    idServicio: '',
    prioridad: 'Media',
    descripcion: '',
  });
  const [temporaryTvPassword, setTemporaryTvPassword] = useState<{ idContrato: number; password: string } | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      void bootstrapPortal();
    }
  }, []);

  async function bootstrapPortal() {
    try {
      const { data } = await api.get<PortalCustomer>('/portal/me');
      localStorage.setItem('finet_portal_customer', JSON.stringify(data));
      setCustomer(data);
      await loadPortalData(true);
    } catch (err) {
      logoutPortal();
      setStatus(apiErrorMessage(err));
    }
  }

  async function login(credentials: { rut: string; password: string }) {
    setLoading(true);
    setStatus('');

    try {
      const { data } = await api.post<{ portalToken: string; customer: PortalCustomer }>('/portal/login', credentials);
      localStorage.setItem('finet_portal_token', data.portalToken);
      localStorage.setItem('finet_portal_customer', JSON.stringify(data.customer));
      setToken(data.portalToken);
      setCustomer(data.customer);
      await loadPortalData(true);
      setStatus('Sesión portal iniciada');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadPortalData(silent = false) {
    try {
      const [servicesResult, ticketsResult, categoriesResult, tvipResult] = await Promise.all([
        api.get<CustomerService[]>('/portal/services'),
        api.get<Ticket[]>('/portal/tickets'),
        api.get<TicketCategory[]>('/portal/ticket-categories'),
        api.get<TvipCredentialSummary[]>('/portal/tvip'),
      ]);
      setServices(servicesResult.data);
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

  async function createTicket() {
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
      });
      setTicketForm({ idCategoria: '', idServicio: '', prioridad: 'Media', descripcion: '' });
      await loadPortalData(true);
      setStatus('Ticket creado desde portal');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function regenerateTvip(idContrato: number) {
    try {
      const { data } = await api.post<TvipGenerationResult>('/portal/tvip/regenerate', { idContrato });
      setTemporaryTvPassword({ idContrato, password: data.temporaryPassword });
      await loadPortalData(true);
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
    setTickets([]);
    setTvip([]);
    setStatus('');
  }

  if (!token || !customer) {
    return <PortalLogin loading={loading} status={status} onLogin={login} />;
  }

  return (
    <main className="portal-shell">
      <PortalHome
        customer={customer}
        servicesCount={services.length}
        ticketsCount={tickets.length}
        tvipCount={tvip.length}
        status={status}
        onRefresh={() => void loadPortalData()}
        onLogout={logoutPortal}
      />
      <section className="portal-grid">
        <PortalServices services={services} />
        <PortalTickets
          services={services}
          tickets={tickets}
          categories={categories}
          form={ticketForm}
          onFormChange={setTicketForm}
          onCreate={() => void createTicket()}
        />
        <PortalTvip
          credentials={tvip}
          temporaryPassword={temporaryTvPassword}
          onRegenerate={(idContrato) => void regenerateTvip(idContrato)}
        />
      </section>
    </main>
  );
}
