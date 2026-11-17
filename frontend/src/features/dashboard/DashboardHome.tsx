import { useState } from 'react';
import {
  Boxes,
  CalendarPlus,
  CircleCheckBig,
  ClipboardList,
  HandCoins,
  Ticket as TicketIcon,
  TrendingDown,
  UserRoundPlus,
  Users,
  Wrench,
} from 'lucide-react';
import { type Company, type Customer, type Prospect, type Ticket, type WorkOrder } from '../../api';
import { expiryAlertKey, expiryUrgency, formatDateOnly, isInstallationWorkOrder, isCompletedWorkOrder, isTerminalWorkOrder, isInProgressWorkOrder } from '../../lib';
import { useDashboardFinance } from './useDashboardFinance';
import { type DashboardPermissions } from '../../permissions';
import {
  DashboardStatCard,
  ExpiryBadge,
  ExpiryCustomerCard,
  Modal,
  QuickActionCard,
  type ExpiryCustomerAlert,
} from '../../shared/components';

type Tab =
  | 'dashboard'
  | 'prospects'
  | 'installations'
  | 'customers'
  | 'commercial'
  | 'inventory'
  | 'plans'
  | 'tickets'
  | 'workOrders'
  | 'reports'
  | 'import'
  | 'users'
  | 'audit';

type DashboardExpiryAlert = ExpiryCustomerAlert & {
  idCliente?: number | null;
};

const clpFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

export function isPendingDashboardTicket(ticket: Ticket) {
  const terminal = /^(RESUELT[OA]|CERRAD[OA]|CANCELAD[OA]|ANULAD[OA]|COMPLETAD[OA]|FINALIZAD[OA])$/;
  return ![ticket.estado, ticket.estadoPresentacion].some(value => value && terminal.test(value.trim().toUpperCase()));
}

type Summary = {
  metricas: {
    clientes: number;
    clientesRegistrados?: number;
    prospectos: number;
    pendientesActivacion?: number;
    solicitudesAbiertas?: number;
    solicitudesNoFactibles?: number;
    instalacionesPendientes?: number;
    ticketsAbiertos?: number;
    clientesMorosos?: number;
    inventarioDisponible?: number;
    instalacionesMensuales?: number;
    instalacionesSinFechaTecnica?: number;
    instalacionesRequierenRevision?: number;
    churnRateMensual?: number | null;
    churnBajasMensuales?: number | null;
    churnEstado?: 'HISTORIAL_INSUFICIENTE';
  };
  alertasVencimiento?: DashboardExpiryAlert[];
  diasAnticipacionVencimiento?: number;
  ticketsCerradosPorTipo?: Array<{
    idCategoria: number;
    categoria: string;
    total: number;
  }>;
  origenCaptacion?: Array<{
    origen: string;
    total: number;
  }>;
};
export function DashboardHome({
  summary,
  prospects,
  customers,
  tickets,
  workOrders,
  scope = 'consolidado',
  companies = [],
  permissions,
  onNavigate,
  onOpenPendingInstallations,
  onOpenTicket,
  onOpenControlBook,
}: {
  summary: Summary | null;
  prospects: Prospect[];
  customers: Customer[];
  tickets: Ticket[];
  workOrders: WorkOrder[];
  scope?: string; companies?: Company[];
  permissions: DashboardPermissions;
  onNavigate: (tab: Tab) => void;
  onOpenPendingInstallations?: (view: 'activation' | 'agenda') => void;
  onOpenTicket: (id: number) => void;
  onOpenControlBook?: (alert: ExpiryCustomerAlert) => void;
}) {
  const [expiryFilter, setExpiryFilter] = useState<'overdue' | 'upcoming'>('upcoming');
  const [alertsModalOpen, setAlertsModalOpen] = useState(false);
  const [ticketsModalOpen, setTicketsModalOpen] = useState(false);
  const [selectedAlertKey, setSelectedAlertKey] = useState<string | null>(null);
  const pendingInstallations = workOrders.filter(
    (order) => isInstallationWorkOrder(order.tipoOt) && !isTerminalWorkOrder(order.estado),
  ).length;
  const expiryWindowDays = summary?.diasAnticipacionVencimiento ?? 7;
  const companyKey = scope === 'consolidado' ? [...new Set(companies.map(company => company.idEmpresa))].sort((a, b) => a - b).join(',') : scope;
  const finance = useDashboardFinance(companyKey, permissions.viewControlBook, expiryWindowDays);
  const pendingTickets = tickets.filter(isPendingDashboardTicket);
  const stats = [
    {
      label: 'Prospectos activos',
      value: summary?.metricas.prospectos ?? '—',
      description: 'Sin perder, convertir ni contrato firmado',
      icon: UserRoundPlus,
      tone: 'mint' as const,
      tab: 'prospects' as Tab,
    },
    {
      label: 'Pendientes de activación',
      value: summary?.metricas.pendientesActivacion ?? '—',
      description: 'Contratos firmados sin servicio activo',
      icon: CalendarPlus,
      tone: 'blue' as const,
      tab: 'customers' as Tab,
      pendingView: 'activation' as const,
    },
    {
      label: 'Clientes activos',
      value: summary?.metricas.clientes ?? '—',
      description: summary?.metricas.clientesRegistrados == null ? 'Con al menos un servicio activo'
        : `Con servicio activo · ${summary.metricas.clientesRegistrados} registrados en total`,
      icon: Users,
      tone: 'teal' as const,
      tab: 'customers' as Tab,
    },
    {
      label: 'Instalaciones pendientes',
      value: summary?.metricas.instalacionesPendientes ?? summary?.metricas.pendientesActivacion ?? '—',
      description: 'Personas en Instalaciones en proceso',
      icon: Wrench,
      tone: 'blue' as const,
      tab: 'installations' as Tab,
      pendingView: 'agenda' as const,
    },
    {
      label: 'Tickets abiertos',
      value: summary?.metricas.ticketsAbiertos ?? '—',
      description: 'Casos todavía en atención',
      icon: TicketIcon,
      tone: 'orange' as const,
      tab: 'tickets' as Tab,
    },
    {
      label: 'Clientes morosos',
      value: finance.data?.overdueCustomerCount ?? (permissions.viewControlBook ? '—' : summary?.metricas.clientesMorosos ?? '—'),
      description: 'Con saldo vencido',
      icon: HandCoins,
      tone: 'rose' as const,
      tab: 'commercial' as Tab,
    },
    {
      label: 'Inventario disponible',
      value: summary?.metricas.inventarioDisponible ?? 0,
      description: 'Equipos listos para asignar',
      icon: Boxes,
      tone: 'violet' as const,
      tab: 'inventory' as Tab,
    },
    {
      label: 'Instalaciones completadas este mes',
      value: summary?.metricas.instalacionesMensuales ?? 0,
      description: 'Instalaciones completadas en la empresa seleccionada',
      icon: CircleCheckBig,
      tone: 'green' as const,
      tab: 'installations' as Tab,
    },
    {
      label: 'Churn mensual',
      value: '-',
      description: 'Historial insuficiente para calcular bajas y población inicial',
      icon: TrendingDown,
      tone: 'amber' as const,
      tab: 'commercial' as Tab,
    },
  ];
  const quickActions = [
    {
      label: 'Nuevo prospecto',
      icon: UserRoundPlus,
      tone: 'mint' as const,
      tab: 'prospects' as Tab,
      visible: permissions.createProspects || permissions.viewProspects,
    },
    {
      label: 'Crear ticket',
      icon: TicketIcon,
      tone: 'orange' as const,
      tab: 'tickets' as Tab,
      visible: permissions.viewTickets,
    },
    {
      label: 'Ver instalaciones',
      icon: CalendarPlus,
      tone: 'blue' as const,
      tab: 'installations' as Tab,
      visible: permissions.viewInstallations,
    },
    {
      label: 'Consultar órdenes',
      icon: ClipboardList,
      tone: 'violet' as const,
      tab: 'workOrders' as Tab,
      visible: permissions.viewWorkOrders,
    },
  ];
  const expiryAlerts = finance.data?.alerts ?? [];
  const overdueAlerts = expiryAlerts.filter((alert) => alert.diasRestantes < 0);
  const upcomingAlerts = expiryAlerts.filter((alert) => alert.diasRestantes >= 0 && alert.diasRestantes <= expiryWindowDays);
  const filteredExpiryAlerts = expiryFilter === 'overdue' ? overdueAlerts : upcomingAlerts;
  const selectedAlert = filteredExpiryAlerts.find((alert) => expiryAlertKey(alert) === selectedAlertKey)
    ?? filteredExpiryAlerts[0]
    ?? null;
  const selectedCustomer = selectedAlert?.idCliente
    ? customers.find((customer) => customer.idCliente === selectedAlert.idCliente) ?? null
    : null;
  const completedInstallations = workOrders.filter(
    (order) => isInstallationWorkOrder(order.tipoOt) && isCompletedWorkOrder(order.estado),
  ).length;
  const inProgressInstallations = workOrders.filter(
    (order) => isInstallationWorkOrder(order.tipoOt) && isInProgressWorkOrder(order.estado),
  ).length;
  const installationSegments = [
    { label: 'Pendientes', value: pendingInstallations - inProgressInstallations, tone: 'pending' },
    { label: 'Completadas', value: completedInstallations, tone: 'completed' },
    { label: 'En progreso', value: inProgressInstallations, tone: 'progress' },
  ];
  const installationTotal = Math.max(installationSegments.reduce((total, segment) => total + segment.value, 0), 1);
  const installationChartSegments = installationSegments.map((segment, index) => ({
    ...segment,
    offset: installationSegments.slice(0, index).reduce((total, item) => total + item.value, 0),
  }));
  const activityTones = ['mint', 'teal', 'blue', 'orange', 'violet'];
  const activityBars = (summary?.origenCaptacion ?? [])
    .filter((item) => Number(item.total) > 0)
    .slice(0, 5)
    .map((item, index) => ({
      label: item.origen || 'Sin origen',
      value: Number(item.total),
      tone: activityTones[index % activityTones.length],
    }));
  const activityMaximum = Math.max(...activityBars.map((item) => item.value), 1);
  const keyIndicators = [
    { label: 'Instalaciones completadas este mes', value: summary?.metricas.instalacionesMensuales ?? '—', description: 'Instalaciones completadas', tone: 'green', tab: 'installations' as Tab },
    { label: 'Churn mensual', value: '-', description: 'Historial insuficiente para calcular bajas y población inicial', tone: 'amber', tab: 'commercial' as Tab },
    { label: 'Órdenes de trabajo', value: workOrders.length, description: 'Registradas en la vista actual', tone: 'violet', tab: 'workOrders' as Tab },
    { label: 'Facturas vencidas', value: finance.data?.overdueInvoiceCount ?? '—', description: 'Documentos con saldo vencido', tone: 'rose', tab: 'commercial' as Tab },
  ];

  function selectExpiryFilter(filter: 'overdue' | 'upcoming') {
    setExpiryFilter(filter);
    setSelectedAlertKey(null);
  }

  function openExpiryDetails(alert?: ExpiryCustomerAlert) {
    void finance.refresh();
    setSelectedAlertKey(alert ? expiryAlertKey(alert) : null);
    setAlertsModalOpen(true);
  }

  function ticketCard(ticket: Ticket) {
    return <button type="button" key={ticket.idTicket} className="compact-list-item dashboard-ticket-item" onClick={() => { setTicketsModalOpen(false); onOpenTicket(ticket.idTicket); }}>
      <strong>{ticket.codigoSeguimiento || `#${ticket.idTicket}`}</strong>
      <span>{ticket.cliente?.nombreCompleto ?? 'Sin cliente'}</span>
    </button>;
  }

  return (
    <section className="dashboard-home">
      <div className="dashboard-overview-heading">
        <div>
          <span>Resumen operativo</span>
          <h1>Panel general</h1>
          <p>Una vista rápida del estado comercial, técnico y de atención.</p>
        </div>
        <span className="dashboard-overview-live">Actualizado en tiempo real</span>
      </div>

      <section className="stat-grid">
        {stats.slice(0, 6).map((stat) => (
          <DashboardStatCard key={stat.label} {...stat} onClick={() => {
            if (stat.pendingView && onOpenPendingInstallations) onOpenPendingInstallations(stat.pendingView);
            else onNavigate(stat.tab);
          }} />
        ))}
      </section>

      <section className="dashboard-command-center">
        <article className="dashboard-activity-panel">
          {permissions.viewProspects && <button type="button" className="dashboard-panel-hitarea" aria-label="Ver prospectos por origen de captación" onClick={() => onNavigate('prospects')} />}
          <div className="dashboard-panel-heading">
            <h2>Origen de captación</h2>
          </div>
          {activityBars.length > 0 ? (
            <div className="activity-bar-chart" aria-label="Prospectos por origen de captación">
              <div className="activity-chart-scale" aria-hidden="true"><span>{activityMaximum}</span><span>{Math.ceil(activityMaximum / 2)}</span><span>0</span></div>
              <div className="activity-chart-bars">
                {activityBars.map((item) => (
                  <div key={item.label} className="activity-chart-bar-group">
                    <span className={`activity-chart-bar activity-chart-bar-${item.tone}`} style={{ height: `${Math.max((item.value / activityMaximum) * 100, 8)}%` }} />
                    <strong>{item.value}</strong>
                    <small>{item.label}</small>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="empty-state">Aún no hay prospectos con origen de captación registrado.</p>}
        </article>

        <article className="dashboard-installation-panel">
          {permissions.viewInstallations && <button type="button" className="dashboard-panel-hitarea" aria-label="Ir a instalaciones" onClick={() => onNavigate('installations')} />}
          <div className="dashboard-panel-heading"><h2>Órdenes de instalación</h2></div>
          <div className="installation-chart-layout">
            <div className="installation-donut-wrap">
              <svg className="installation-donut" viewBox="0 0 120 120" aria-label={`${installationSegments[0].value} instalaciones pendientes`} role="img">
                <circle className="installation-donut-track" cx="60" cy="60" r="44" />
                {installationChartSegments.map((segment) => (
                  <circle
                    key={segment.label}
                    className={`installation-donut-segment installation-donut-${segment.tone}`}
                    cx="60"
                    cy="60"
                    r="44"
                    strokeDasharray={`${(segment.value / installationTotal) * 276.46} 276.46`}
                    strokeDashoffset={`${-(segment.offset / installationTotal) * 276.46}`}
                  />
                ))}
              </svg>
              <div><strong>{installationSegments[0].value}</strong><span>Pendientes</span></div>
            </div>
            <div className="installation-chart-legend">
              {installationSegments.map((segment) => (
                <div key={segment.label}><span className={`installation-legend-dot ${segment.tone}`} /><span>{segment.label}</span><strong>{segment.value}</strong></div>
              ))}
            </div>
          </div>
        </article>

        <aside className="dashboard-key-indicators">
          <div className="dashboard-panel-heading"><h2>Indicadores clave</h2></div>
          <div>
            {keyIndicators.map((indicator) => (
              <button key={indicator.label} type="button" className={`dashboard-key-indicator dashboard-key-indicator-${indicator.tone}`} onClick={() => onNavigate(indicator.tab)}>
                <span>{indicator.label}</span><strong>{indicator.value}</strong>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="dashboard-support-row">
        <article className="panel stack expiry-panel">
          <div className="expiry-panel-header">
            <div className="section-heading">
              <h2>Alertas de vencimiento</h2>
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
                Próximos {expiryWindowDays} días
                <span>{upcomingAlerts.length}</span>
              </button>
            </div>
          </div>
          {filteredExpiryAlerts.length > 0 ? (
            <>
              <div className="expiry-alert-list">
                {filteredExpiryAlerts.slice(0, 4).map((alert) => (
                  <button type="button"
                    key={expiryAlertKey(alert)}
                    className={`expiry-alert-item expiry-alert-item-${expiryUrgency(alert.diasRestantes)}`}
                    onClick={() => openExpiryDetails(alert)}
                  >
                    <div className="expiry-alert-copy">
                      <strong className="expiry-client-link">
                        {alert.cliente}
                      </strong>
                      <span>{alert.plan ?? 'Plan sin detalle'} · {formatDateOnly(alert.fechaVencimiento)}</span>
                    </div>
                    <ExpiryBadge days={alert.diasRestantes} />
                  </button>
                ))}
              </div>
              <button type="button" className="expiry-view-more" onClick={() => openExpiryDetails()}>
                Ver más
              </button>
            </>
          ) : (
            <p className="empty-state">
              {finance.loading ? 'Consultando vencimientos…' : !finance.data ? 'Sin datos disponibles.' : expiryFilter === 'overdue'
                ? 'No hay facturas con saldo vencido.'
                : `No hay pagos pendientes que venzan durante los próximos ${expiryWindowDays} días.`}
            </p>
          )}

          <Modal
            title={expiryFilter === 'overdue' ? 'Vencimientos pendientes' : 'Próximos vencimientos'}
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
                <ExpiryCustomerCard alert={{ ...selectedAlert, empresa: companies.find(company => company.idEmpresa === selectedAlert.idEmpresa)?.nombre,
                  numeroContrato: selectedCustomer?.contratos?.find(contract => contract.idContrato === selectedAlert.idContrato)?.numeroContratoExterno ?? selectedAlert.numeroContrato }} customer={selectedCustomer}
                  onOpenCustomer={permissions.viewControlBook && selectedAlert.idCliente && onOpenControlBook ? () => onOpenControlBook(selectedAlert) : undefined} />
              ) : (
                <p className="empty-state">Selecciona un cliente para revisar sus datos.</p>
              )}
            </div>
          </Modal>
        </article>

        <article className="panel stack dashboard-tickets-panel">
          <div className="section-heading"><h2>Tickets</h2></div>
          {!permissions.viewTickets ? <p className="empty-state">No tienes acceso a los tickets.</p> : pendingTickets.length > 0 ? (
            <div className="compact-list">
              {pendingTickets.slice(0, 4).map(ticketCard)}
            </div>
          ) : (
            <p className="empty-state">No hay tickets pendientes.</p>
          )}
          {permissions.viewTickets && <button type="button" className="expiry-view-more" onClick={() => setTicketsModalOpen(true)}>Ver tickets</button>}
          <Modal title="Tickets pendientes" open={ticketsModalOpen} onClose={() => setTicketsModalOpen(false)}>
            <div className="dashboard-ticket-list">{pendingTickets.length ? pendingTickets.map(ticketCard) : <p className="empty-state">No hay tickets pendientes.</p>}</div>
          </Modal>
        </article>
        <section className="dashboard-actions dashboard-support-actions">
          <div className="dashboard-panel-heading"><h2>Acciones rápidas</h2></div>
          <div className="quick-actions">
            {quickActions.filter((action) => action.visible).map((action) => (
              <QuickActionCard key={action.label} {...action} onNavigate={onNavigate} />
            ))}
          </div>
        </section>
      </section>

      {permissions.viewControlBook && (
        <section className="dashboard-financial-summary" aria-label="Resumen financiero">
          <div className="dashboard-financial-heading">
            <div>
              <h2>Resumen financiero</h2>
            </div>
            <button type="button" className="dashboard-inline-link" onClick={() => onNavigate('commercial')}>
              Ver libro de control
            </button>
          </div>
          <div className="dashboard-financial-metrics">
            <div>
              <span>Saldo vencido</span>
              <strong>{finance.data ? clpFormatter.format(finance.data.overdueBalance) : '—'}</strong>
            </div>
            <div>
              <span>Facturas vencidas</span>
              <strong>{finance.data?.overdueInvoiceCount ?? '—'}</strong>
            </div>
            <div>
              <span>Saldo pendiente</span>
              <strong>{finance.data ? clpFormatter.format(finance.data.totalDebt) : '—'}</strong>
            </div>
            <div>
              <span>Clientes morosos</span>
              <strong>{finance.data?.overdueCustomerCount ?? '—'}</strong>
            </div>
          </div>
        </section>
      )}

      <section className="dashboard-actions dashboard-actions-legacy">
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
