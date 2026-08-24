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
import { type Customer, type Prospect, type Ticket, type WorkOrder } from '../../api';
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

type Summary = {
  metricas: {
    clientes: number;
    prospectos: number;
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
};
export function DashboardHome({
  summary,
  prospects,
  customers,
  tickets,
  workOrders,
  permissions,
  onNavigate,
}: {
  summary: Summary | null;
  prospects: Prospect[];
  customers: Customer[];
  tickets: Ticket[];
  workOrders: WorkOrder[];
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
  const stats = [
    {
      label: 'Prospectos activos',
      value: summary?.metricas.prospectos ?? prospects.length,
      description: 'Oportunidades registradas',
      icon: UserRoundPlus,
      tone: 'mint' as const,
      tab: 'prospects' as Tab,
    },
    {
      label: 'Clientes activos',
      value: summary?.metricas.clientes ?? customers.length,
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
      <div className="page-heading">
        <h1>Dashboard operativo</h1>
      </div>

      <section className="stat-grid">
        {stats.map((stat) => (
          <DashboardStatCard key={stat.label} {...stat} onClick={() => onNavigate(stat.tab)} />
        ))}
      </section>

      <section className="dashboard-insights">
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
      </section>

      <section className="dashboard-actions">
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
