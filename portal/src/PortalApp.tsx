import { useEffect, useState } from 'react';
import {
  api,
  apiErrorMessage,
  CustomerService,
  PortalContract,
  PortalCustomer,
  Ticket,
  TicketCategory,
  TvipCredentialSummary,
  TvipGenerationResult,
} from './api';
import { PortalLogin } from './features/auth';
import { PortalContracts } from './features/contracts';
import { PortalHome } from './features/home';
import { PortalServices } from './features/services';
import { PortalTicketFormValue, PortalTickets } from './features/tickets';
import { PortalTvip } from './features/tvip';
import { PortalWifiRequest, WifiRequestForm } from './features/wifi';

const emptyTicketForm: PortalTicketFormValue = {
  idCategoria: '',
  idServicio: '',
  prioridad: 'Media',
  descripcion: '',
};

const emptyWifiForm: WifiRequestForm = {
  idServicio: '',
  nuevaContrasena: '',
  observaciones: '',
};

export function PortalApp() {
  const [token, setToken] = useState(() => localStorage.getItem('finet_portal_token') ?? '');
  const [customer, setCustomer] = useState<PortalCustomer | null>(() => {
    const stored = localStorage.getItem('finet_portal_customer');
    return stored ? JSON.parse(stored) as PortalCustomer : null;
  });
  const [services, setServices] = useState<CustomerService[]>([]);
  const [contracts, setContracts] = useState<PortalContract[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [tvip, setTvip] = useState<TvipCredentialSummary[]>([]);
  const [ticketForm, setTicketForm] = useState<PortalTicketFormValue>(emptyTicketForm);
  const [wifiForm, setWifiForm] = useState<WifiRequestForm>(emptyWifiForm);
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
      const [servicesResult, contractsResult, ticketsResult, categoriesResult, tvipResult] = await Promise.all([
        api.get<CustomerService[]>('/portal/services'),
        api.get<PortalContract[]>('/portal/contracts'),
        api.get<Ticket[]>('/portal/tickets'),
        api.get<TicketCategory[]>('/portal/ticket-categories'),
        api.get<TvipCredentialSummary[]>('/portal/tvip'),
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

  async function createTicket() {
    if (!ticketForm.idCategoria || ticketForm.descripcion.trim().length < 10) {
      setStatus('Selecciona categoría y describe el problema con al menos 10 caracteres.');
      return;
    }

    try {
      const { data } = await api.post<Ticket>('/portal/tickets', {
        idCategoria: Number(ticketForm.idCategoria),
        idServicio: ticketForm.idServicio ? Number(ticketForm.idServicio) : undefined,
        prioridad: ticketForm.prioridad,
        descripcion: ticketForm.descripcion.trim(),
      });
      setTicketForm(emptyTicketForm);
      await loadPortalData(true);
      setStatus(`Ticket ${data.codigoSeguimiento ?? data.idTicket} creado desde portal`);
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function requestWifiChange() {
    if (!wifiForm.idServicio) {
      setStatus('Selecciona el servicio para registrar la solicitud Wi-Fi.');
      return;
    }

    if (wifiForm.nuevaContrasena.trim() && wifiForm.nuevaContrasena.trim().length < 8) {
      setStatus('La nueva clave sugerida debe tener al menos 8 caracteres.');
      return;
    }

    try {
      const { data } = await api.post<{ mensaje: string; ticket?: Ticket }>('/portal/wifi-change-request', {
        idServicio: Number(wifiForm.idServicio),
        nuevaContrasena: wifiForm.nuevaContrasena.trim() || undefined,
        observaciones: wifiForm.observaciones.trim() || undefined,
      });
      setWifiForm(emptyWifiForm);
      await loadPortalData(true);
      const ticketCode = data.ticket?.codigoSeguimiento ? ` Ticket asociado: ${data.ticket.codigoSeguimiento}.` : '';
      setStatus(`${data.mensaje}${ticketCode}`);
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
    setContracts([]);
    setTickets([]);
    setCategories([]);
    setTvip([]);
    setTicketForm(emptyTicketForm);
    setWifiForm(emptyWifiForm);
    setTemporaryTvPassword(null);
    setStatus('');
  }

  if (!token || !customer) {
    return <PortalLogin loading={loading} status={status} onLogin={login} />;
  }

  const openTicketsCount = tickets.filter((ticket) => !['Resuelto', 'Cerrado'].includes(ticket.estado)).length;

  return (
    <main className="portal-shell">
      <PortalHome
        customer={customer}
        servicesCount={services.length}
        contractsCount={contracts.length}
        openTicketsCount={openTicketsCount}
        ticketsCount={tickets.length}
        tvipCount={tvip.length}
        status={status}
        onRefresh={() => void loadPortalData()}
        onLogout={logoutPortal}
      />
      <section className="portal-grid">
        <PortalServices services={services} />
        <PortalContracts contracts={contracts} />
        <PortalTickets
          services={services}
          tickets={tickets}
          categories={categories}
          form={ticketForm}
          onFormChange={setTicketForm}
          onCreate={() => void createTicket()}
        />
        <PortalWifiRequest
          services={services}
          form={wifiForm}
          onFormChange={setWifiForm}
          onSubmit={() => void requestWifiChange()}
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
