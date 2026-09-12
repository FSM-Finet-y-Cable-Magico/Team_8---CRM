import { useState } from 'react';
import {
  ArrowRight,
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
import { type BillingOverview, type Customer, type Prospect, type Ticket, type WorkOrder } from '../../api';
import { expiryAlertKey, expiryUrgency, formatDateOnly } from '../../lib';
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
  | 'inventory'
  | 'plans'
  | 'billing'
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

type Summary = {
  metricas: {
    clientes: number;
    prospectos: number;
    pendientesActivacion?: number;
    solicitudesAbiertas?: number;
    solicitudesNoFactibles?: number;
    instalacionesPendientes?: number;
    ticketsAbiertos?: number;
    clientesMorosos?: number;
    inventarioDisponible?: number;
    instalacionesMensuales?: number;
    churnRateMensual?: number;
    churnBajasMensuales?: number;
  };
  alertasVencimiento?: DashboardExpiryAlert[];
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
  billingOverview,
  permissions,
  onNavigate,
}: {
  summary: Summary | null;
  prospects: Prospect[];
  customers: Customer[];
  tickets: Ticket[];
  workOrders: WorkOrder[];
  billingOverview: BillingOverview | null;
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
  const overdueBalance = billingOverview?.morosos.reduce((total, invoice) => total + Number(invoice.saldo ?? 0), 0) ?? 0;
  const stats = [
    {
      label: 'Prospectos activos',
      value: summary?.metricas.prospectos ?? 0,
      description: 'Oportunidades registradas',
      icon: UserRoundPlus,
      tone: 'mint' as const,
      tab: 'prospects' as Tab,
    },
    {
      label: 'Pendientes de activacion',
      value: summary?.metricas.pendientesActivacion ?? 0,
      description: 'Contratos firmados sin servicio activo',
      icon: CalendarPlus,
      tone: 'blue' as const,
      tab: 'customers' as Tab,
    },
    {
      label: 'Clientes activos',
      value: summary?.metricas.clientes ?? 0,
      description: 'Clientes de la vista actual',
      icon: Users,
      tone: 'teal' as const,
      tab: 'customers' as Tab,
    },
    {
      label: 'Instalaciones pendientes',
      value: summary?.metricas.instalacionesPendientes ?? pendingInstallations,
      description: 'Por coordinar o finalizar',
      icon: Wrench,
      tone: 'blue' as const,
      tab: 'installations' as Tab,
    },
    {
      label: 'Tickets abiertos',
      value: summary?.metricas.ticketsAbiertos ?? openTickets,
      description: 'Casos todavía en atención',
      icon: TicketIcon,
      tone: 'orange' as const,
      tab: 'tickets' as Tab,
    },
    {
      label: 'Clientes morosos',
      value: summary?.metricas.clientesMorosos ?? 0,
      description: 'Con deuda o suspensión',
      icon: HandCoins,
      tone: 'rose' as const,
      tab: 'billing' as Tab,
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
      label: 'Instalaciones del mes',
      value: summary?.metricas.instalacionesMensuales ?? 0,
      description: 'Completadas durante el mes',
      icon: CircleCheckBig,
      tone: 'green' as const,
      tab: 'installations' as Tab,
    },
    {
      label: 'Churn mensual',
      value: `${summary?.metricas.churnRateMensual ?? 0}%`,
      description: `${summary?.metricas.churnBajasMensuales ?? 0} baja(s) durante el mes`,
      icon: TrendingDown,
      tone: 'amber' as const,
      tab: 'billing' as Tab,
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
  const completedInstallations = workOrders.filter(
    (order) => order.tipoOt === 'Instalacion' && ['Completada', 'Cerrada'].includes(order.estado),
  ).length;
  const inProgressInstallations = workOrders.filter(
    (order) => order.tipoOt === 'Instalacion' && ['En progreso', 'En curso'].includes(order.estado),
  ).length;
  const installationSegments = [
    { label: 'Pendientes', value: Number(summary?.metricas.instalacionesPendientes ?? pendingInstallations), tone: 'pending' },
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
    { label: 'Instalaciones del mes', value: summary?.metricas.instalacionesMensuales ?? 0, description: 'Completadas durante el mes', tone: 'green', tab: 'installations' as Tab },
    { label: 'Churn mensual', value: `${summary?.metricas.churnRateMensual ?? 0}%`, description: `${summary?.metricas.churnBajasMensuales ?? 0} baja(s) durante el mes`, tone: 'amber', tab: 'billing' as Tab },
    { label: 'Órdenes de trabajo', value: workOrders.length, description: 'Registradas en la vista actual', tone: 'violet', tab: 'workOrders' as Tab },
    { label: 'Facturas vencidas', value: billingOverview?.metricas.facturasVencidas ?? 0, description: 'Documentos con atraso', tone: 'rose', tab: 'billing' as Tab },
  ];

  function selectExpiryFilter(filter: 'overdue' | 'upcoming') {
    setExpiryFilter(filter);
    setSelectedAlertKey(null);
  }

  function openExpiryDetails(alert?: ExpiryCustomerAlert) {
    setSelectedAlertKey(alert ? expiryAlertKey(alert) : null);
    setAlertsModalOpen(true);
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
          <DashboardStatCard key={stat.label} {...stat} onClick={() => onNavigate(stat.tab)} />
        ))}
      </section>

      <section className="dashboard-command-center">
        {permissions.manageCustomerRequests && <article className="dashboard-activity-panel"><div className="dashboard-panel-heading"><h2>Seguimiento de solicitudes</h2></div><p><strong>{summary?.metricas.solicitudesAbiertas ?? 0}</strong> abiertas o en gestión</p><p><strong>{summary?.metricas.solicitudesNoFactibles ?? 0}</strong> cerradas como no factibles</p><p>Totales de la empresa seleccionada. Las solicitudes se gestionan desde la ficha del cliente.</p><button className="secondary compact" onClick={() => onNavigate('customers')}>Ver clientes</button></article>}
        <article className="dashboard-activity-panel">
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
          ) : <p className="dashboard-chart-empty">Aún no hay prospectos con origen de captación registrado.</p>}
        </article>

        <article className="dashboard-installation-panel">
          <div className="dashboard-panel-heading"><h2>Instalaciones</h2></div>
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
                <span>{indicator.label}</span><strong>{indicator.value}</strong><small>{indicator.description}</small>
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
        <section className="dashboard-actions dashboard-support-actions">
          <div className="dashboard-panel-heading"><h2>Acciones rápidas</h2></div>
          <div className="quick-actions">
            {quickActions.filter((action) => action.visible).map((action) => (
              <QuickActionCard key={action.label} {...action} onNavigate={onNavigate} />
            ))}
          </div>
        </section>
      </section>

      {permissions.viewBilling && (
        <section className="dashboard-financial-summary" aria-label="Resumen de cobranza">
          <div className="dashboard-financial-heading">
            <div>
              <span>Seguimiento financiero</span>
              <h2>Resumen de cobranza</h2>
            </div>
            <button type="button" className="dashboard-inline-link" onClick={() => onNavigate('billing')}>
              Ver cobranza
              <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          <div className="dashboard-financial-metrics">
            <div>
              <span>Saldo vencido</span>
              <strong>{clpFormatter.format(overdueBalance)}</strong>
              <small>Total pendiente de regularizar</small>
            </div>
            <div>
              <span>Facturas vencidas</span>
              <strong>{billingOverview?.metricas.facturasVencidas ?? 0}</strong>
              <small>Documentos con atraso</small>
            </div>
            <div>
              <span>Cortes programados</span>
              <strong>{billingOverview?.metricas.clientesProgramadosCorte ?? 0}</strong>
              <small>Requieren seguimiento</small>
            </div>
            <div>
              <span>Clientes morosos</span>
              <strong>{billingOverview?.metricas.clientesMorosos ?? summary?.metricas.clientesMorosos ?? 0}</strong>
              <small>Con deuda o suspensión</small>
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
