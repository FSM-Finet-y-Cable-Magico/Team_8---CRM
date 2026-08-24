import { FormEvent, useEffect, useState } from 'react';
import { api, apiErrorMessage, type BillingOverview, type PaymentZone, type Plan, type ZonePriceRule } from '../../api';
import { formatDateOnly, formatDateTime } from '../../lib';
import { type DashboardPermissions } from '../../permissions';
import { Modal, StatCard, StatusBadge, TablePagination } from '../../shared/components';
export function BillingPanel({
  overview,
  plans,
  scope,
  writeCompanyId,
  permissions,
  onChanged,
}: {
  overview: BillingOverview | null;
  plans: Plan[];
  scope: string;
  writeCompanyId: number;
  permissions: DashboardPermissions;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState('');
  const [paymentTarget, setPaymentTarget] = useState<BillingOverview['morosos'][number] | null>(null);
  const [paymentForm, setPaymentForm] = useState({ monto: '', pasarela: 'Transferencia', codigoTransaccion: '' });
  const [zones, setZones] = useState<PaymentZone[]>([]);
  const [zoneRules, setZoneRules] = useState<ZonePriceRule[]>([]);
  const [zoneForm, setZoneForm] = useState({ nombreZona: '', comuna: '', descripcion: '', diaVencimientoSugerido: '5' });
  const [ruleForm, setRuleForm] = useState({ idPlan: '', idZonaPago: '', precioMensual: '', valorInstalacion: '' });
  const [morososPage, setMorososPage] = useState(1);
  const [cortesPage, setCortesPage] = useState(1);

  useEffect(() => {
    if (paymentTarget) {
      setPaymentForm({ monto: String(paymentTarget.saldo), pasarela: 'Transferencia', codigoTransaccion: '' });
    }
  }, [paymentTarget?.idFactura]);

  useEffect(() => {
    void loadZonesAndRules();
  }, [scope]);

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      setStatus('');
      await action();
      setStatus(success);
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function loadZonesAndRules() {
    try {
      const [zonesResult, rulesResult] = await Promise.all([
        api.get<PaymentZone[]>('/billing/zones', { params: { scope } }),
        api.get<ZonePriceRule[]>('/billing/zone-rules', { params: { scope } }),
      ]);
      setZones(zonesResult.data);
      setZoneRules(rulesResult.data);
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function createZone(event: FormEvent) {
    event.preventDefault();

    await run(
      async () => {
        await api.post('/billing/zones', {
          idEmpresa: writeCompanyId,
          nombreZona: zoneForm.nombreZona.trim(),
          comuna: zoneForm.comuna.trim() || undefined,
          descripcion: zoneForm.descripcion.trim() || undefined,
          diaVencimientoSugerido: Number(zoneForm.diaVencimientoSugerido),
        });
        setZoneForm({ nombreZona: '', comuna: '', descripcion: '', diaVencimientoSugerido: '5' });
        await loadZonesAndRules();
      },
      'Zona de pago registrada',
    );
  }

  async function createZoneRule(event: FormEvent) {
    event.preventDefault();

    await run(
      async () => {
        await api.post('/billing/zone-rules', {
          idPlan: Number(ruleForm.idPlan),
          idZonaPago: Number(ruleForm.idZonaPago),
          precioMensual: Number(ruleForm.precioMensual),
          valorInstalacion: ruleForm.valorInstalacion ? Number(ruleForm.valorInstalacion) : undefined,
        });
        setRuleForm({ idPlan: '', idZonaPago: '', precioMensual: '', valorInstalacion: '' });
        await loadZonesAndRules();
      },
      'Regla de precio por zona registrada',
    );
  }

  async function registerPayment(event: FormEvent) {
    event.preventDefault();

    if (!paymentTarget) {
      return;
    }

    const amount = Number(paymentForm.monto);

    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus('Ingresa un monto valido para registrar el pago.');
      return;
    }

    await run(
      () => api.post('/billing/payments', {
        idFactura: paymentTarget.idFactura,
        monto: amount,
        pasarela: paymentForm.pasarela.trim(),
        codigoTransaccion: paymentForm.codigoTransaccion.trim() || undefined,
      }),
      'Pago registrado y estado de cobranza actualizado',
    );
    setPaymentTarget(null);
  }

  const morosos = overview?.morosos ?? [];
  const cortes = overview?.cortesProgramados ?? [];
  const notifications = overview?.notificaciones ?? [];
  const pageSize = 10;
  const visibleMorosos = morosos.slice((morososPage - 1) * pageSize, morososPage * pageSize);
  const visibleCortes = cortes.slice((cortesPage - 1) * pageSize, cortesPage * pageSize);

  return (
    <section className="billing-module stack">
      <header className="billing-page-header">
        <h1>Cobranza</h1>
        {permissions.manageBilling && (
          <button type="button" onClick={() => void run(() => api.post('/billing/refresh-delinquency'), 'Clientes morosos actualizados')}>
            Actualizar morosidad
          </button>
        )}
      </header>

      <section className="billing-summary-strip">
        <StatCard label="Clientes morosos" value={overview?.metricas.clientesMorosos ?? 0} hint="" />
        <StatCard label="Facturas vencidas" value={overview?.metricas.facturasVencidas ?? 0} hint="" />
        <StatCard label="Programados para corte" value={overview?.metricas.clientesProgramadosCorte ?? 0} hint="" />
        <StatCard label="Canal de avisos" value={overview?.modoNotificacion ?? 'mock'} hint="" />
      </section>

      {status && <p className="inline-status">{status}</p>}

      <details className="billing-workspace-section" open>
        <summary><span>Clientes morosos</span><strong>{morosos.length}</strong></summary>
        <section className="panel stack">
        <div className="section-heading">
          <h2>Clientes morosos</h2>
          <p>Facturas vencidas calculadas con fecha actual, pagos registrados y contrato asociado.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>RUT</th>
                <th>Plan</th>
                <th>Vencimiento</th>
                <th>Saldo</th>
                <th>Atraso</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleMorosos.map((row) => (
                <tr key={row.idFactura}>
                  <td>{row.cliente.nombreCompleto}</td>
                  <td>{row.cliente.rut ?? '-'}</td>
                  <td>{row.contrato.plan ?? '-'}</td>
                  <td>{formatDateOnly(row.fechaLimitePago)}</td>
                  <td>${row.saldo.toLocaleString('es-CL')}</td>
                  <td>{row.diasAtraso} día(s)</td>
                  <td><StatusBadge value={row.cliente.estado} /></td>
                  <td>
                    {permissions.manageBilling && (
                      <div className="table-actions">
                        <button className="secondary compact" type="button" onClick={() => setPaymentTarget(row)}>
                          Registrar pago
                        </button>
                        <button
                          className="secondary compact"
                          type="button"
                          onClick={() => void run(() => api.post('/billing/notifications', { idCliente: row.cliente.idCliente, idFactura: row.idFactura, tipo: 'Preventiva' }), 'Aviso preventivo registrado')}
                        >
                          Aviso
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          {!morosos.length && <p className="empty-state">No hay clientes morosos para el alcance seleccionado.</p>}
          <TablePagination currentPage={morososPage} totalItems={morosos.length} pageSize={pageSize} onPageChange={setMorososPage} />
        </section>
      </details>

      <details className="billing-workspace-section">
        <summary><span>Programados para corte</span><strong>{cortes.length}</strong></summary>
        <section className="panel stack">
        <div className="section-heading">
          <h2>Clientes programados para corte</h2>
          <p>Clientes cuya deuda supera la regla de días configurada para corte.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contrato</th>
                <th>Saldo</th>
                <th>Dias atraso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleCortes.map((row) => (
                <tr key={`cut-${row.idFactura}`}>
                  <td>{row.cliente.nombreCompleto}</td>
                  <td>{row.idContrato}</td>
                  <td>${row.saldo.toLocaleString('es-CL')}</td>
                  <td>{row.diasAtraso}</td>
                  <td>
                    {permissions.manageBilling && (
                      <div className="table-actions">
                        <button
                          className="secondary compact"
                          type="button"
                          onClick={() => void run(() => api.post('/billing/notifications', { idCliente: row.cliente.idCliente, idFactura: row.idFactura, tipo: 'Ultimo aviso' }), 'Ultimo aviso registrado')}
                        >
                          Ultimo aviso
                        </button>
                        <button
                          className="secondary compact"
                          type="button"
                          onClick={() => void run(() => api.patch(`/billing/contracts/${row.idContrato}/suspend`), 'Servicio suspendido por no pago')}
                        >
                          Suspender
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          {!cortes.length && <p className="empty-state">No hay clientes dentro de regla de corte.</p>}
          <TablePagination currentPage={cortesPage} totalItems={cortes.length} pageSize={pageSize} onPageChange={setCortesPage} />
        </section>
      </details>

      <details className="billing-workspace-section">
        <summary><span>Notificaciones de cobranza</span><strong>{notifications.length}</strong></summary>
        <section className="panel stack">
        <div className="section-heading">
          <h2>Notificaciones de cobranza</h2>
          <p>Historial de avisos registrados en modo simulado o desactivado.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Canal</th>
                <th>Estado envio</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((notification) => (
                <tr key={notification.idNotificacion}>
                  <td>{notification.idNotificacion}</td>
                  <td>{notification.idCliente ?? '-'}</td>
                  <td>{notification.canal ?? '-'}</td>
                  <td><StatusBadge value={notification.estadoEnvio} /></td>
                  <td>{formatDateTime(notification.fechaEnvio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          {!notifications.length && <p className="empty-state">Aun no hay notificaciones de cobranza registradas.</p>}
        </section>
      </details>

      <details className="billing-workspace-section">
        <summary><span>Zonas de pago y reglas</span><strong>{zones.length}</strong></summary>
        <section className="panel stack">
        <div className="section-heading">
          <h2>Zonas de pago</h2>
          <p>Configura vencimientos sugeridos y precios manuales por zona.</p>
        </div>
        {permissions.managePaymentZones && (
          <div className="workflow-grid">
            <form className="stack" onSubmit={createZone}>
              <h3>Nueva zona</h3>
              <input placeholder="Nombre de zona" value={zoneForm.nombreZona} onChange={(event) => setZoneForm({ ...zoneForm, nombreZona: event.target.value })} required />
              <input placeholder="Comuna" value={zoneForm.comuna} onChange={(event) => setZoneForm({ ...zoneForm, comuna: event.target.value })} />
              <input type="number" min="1" max="28" placeholder="Día vencimiento sugerido" value={zoneForm.diaVencimientoSugerido} onChange={(event) => setZoneForm({ ...zoneForm, diaVencimientoSugerido: event.target.value })} />
              <textarea placeholder="Descripción" value={zoneForm.descripcion} onChange={(event) => setZoneForm({ ...zoneForm, descripcion: event.target.value })} />
              <button type="submit">Crear zona</button>
            </form>
            <form className="stack" onSubmit={createZoneRule}>
              <h3>Precio por zona</h3>
              <select value={ruleForm.idPlan} onChange={(event) => setRuleForm({ ...ruleForm, idPlan: event.target.value })} required>
                <option value="">Seleccionar plan</option>
                {plans.filter((plan) => plan.activo !== false).map((plan) => (
                  <option key={plan.idPlan} value={plan.idPlan}>{plan.nombreComercial}</option>
                ))}
              </select>
              <select value={ruleForm.idZonaPago} onChange={(event) => setRuleForm({ ...ruleForm, idZonaPago: event.target.value })} required>
                <option value="">Seleccionar zona</option>
                {zones.map((zone) => (
                  <option key={zone.idZonaPago} value={zone.idZonaPago}>{zone.nombreZona}</option>
                ))}
              </select>
              <input type="number" min="0" placeholder="Precio mensual" value={ruleForm.precioMensual} onChange={(event) => setRuleForm({ ...ruleForm, precioMensual: event.target.value })} required />
              <input type="number" min="0" placeholder="Valor instalación" value={ruleForm.valorInstalacion} onChange={(event) => setRuleForm({ ...ruleForm, valorInstalacion: event.target.value })} />
              <button type="submit">Guardar regla</button>
            </form>
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Zona</th>
                <th>Comuna</th>
                <th>Vencimiento sugerido</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => (
                <tr key={zone.idZonaPago}>
                  <td>{zone.nombreZona}</td>
                  <td>{zone.comuna ?? '-'}</td>
                  <td>{zone.diaVencimientoSugerido ?? '-'}</td>
                  <td><StatusBadge value={zone.activo === false ? 'Inactiva' : 'Activa'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="compact-list">
          {zoneRules.slice(0, 6).map((rule) => (
            <section className="compact-list-item" key={rule.idPlanZonaPrecio}>
              <strong>{rule.plan?.nombreComercial ?? `Plan ${rule.idPlan}`}</strong>
              <span>{rule.zonaPago?.nombreZona ?? `Zona ${rule.idZonaPago}`} - ${Number(rule.precioMensual).toLocaleString('es-CL')}</span>
            </section>
          ))}
        </div>
        </section>
      </details>

      <Modal title="Registrar pago" open={Boolean(paymentTarget)} onClose={() => setPaymentTarget(null)}>
        {paymentTarget && (
          <form className="stack" onSubmit={registerPayment}>
            <section className="customer-preview">
              <h3>{paymentTarget.cliente.nombreCompleto}</h3>
              <p><strong>Factura:</strong> {paymentTarget.idFactura}</p>
              <p><strong>Saldo:</strong> ${paymentTarget.saldo.toLocaleString('es-CL')}</p>
            </section>
            <label>
              Monto pagado
              <input type="number" min="1" value={paymentForm.monto} onChange={(event) => setPaymentForm({ ...paymentForm, monto: event.target.value })} />
            </label>
            <label>
              Pasarela o medio
              <input value={paymentForm.pasarela} onChange={(event) => setPaymentForm({ ...paymentForm, pasarela: event.target.value })} />
            </label>
            <label>
              Codigo transaccion opcional
              <input value={paymentForm.codigoTransaccion} onChange={(event) => setPaymentForm({ ...paymentForm, codigoTransaccion: event.target.value })} />
            </label>
            <button>Guardar pago</button>
          </form>
        )}
      </Modal>
    </section>
  );
}
