import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, apiErrorMessage, type BillingInvoiceDetail, type Customer, type ExternalTaxDocument, type ExternalTaxDocumentPage } from '../../api';
import { formatDateOnly } from '../../lib';
import { StatusBadge, TablePagination } from '../../shared/components';
import { validateExternalDocumentForm } from './external-tax-document-form';

type InvoiceOption = { idFactura: number; idContrato: number; fechaEmision: string | null; saldo: number | null; folio: string | null };
type CustomerHistory = { idCliente: number; invoices: InvoiceOption[] };

const EMPTY_FORM = {
  tipoDocumento: 'BOLETA', folioONumero: '', emisorProveedor: '', fechaEmision: '',
  montoNeto: '', montoExento: '', iva: '', montoTotal: '', estado: 'REGISTRADO',
  idCliente: '', idContrato: '', idFactura: '', idCargoAdicional: '', urlDocumento: '', referenciaExterna: '',
};

const EMPTY_FILTERS = {
  search: '', tipoDocumento: '', folio: '', emisorProveedor: '', idCliente: '', idContrato: '', idFactura: '',
  estado: '', fechaDesde: '', fechaHasta: '',
};

export function ExternalTaxDocumentsPanel({ customers, scope, writeCompanyId, canManage, fixedCustomerId }: {
  customers: Customer[];
  scope: string;
  writeCompanyId: number;
  canManage: boolean;
  fixedCustomerId?: number;
}) {
  const [documents, setDocuments] = useState<ExternalTaxDocument[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [charges, setCharges] = useState<BillingInvoiceDetail['cargos']>([]);
  const [relationsLoading, setRelationsLoading] = useState(false);
  const [relationError, setRelationError] = useState('');
  const customerForm = () => ({ ...EMPTY_FORM, idCliente: fixedCustomerId ? String(fixedCustomerId) : '' });
  const [form, setForm] = useState(customerForm);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const idEmpresa = scope !== 'consolidado' && Number.isInteger(Number(scope)) ? Number(scope) : writeCompanyId;
  const contextKey = `${idEmpresa}:${fixedCustomerId ?? 'all'}`;
  const context = useRef(contextKey);
  context.current = contextKey;
  const companyCustomers = useMemo(() => customers
    .filter(customer => customer.idEmpresa === idEmpresa || customer.contratos?.some(contract => contract.idEmpresa === idEmpresa))
    .map(customer => ({ ...customer, contratos: customer.contratos?.filter(contract => contract.idEmpresa === idEmpresa) })), [customers, idEmpresa]);
  const selectedCustomer = companyCustomers.find((customer) => String(customer.idCliente) === form.idCliente);
  const filterCustomer = companyCustomers.find((customer) => String(customer.idCliente) === (fixedCustomerId ? String(fixedCustomerId) : filters.idCliente));
  const currentDocument = editingId ? documents.find(document => document.idDocumento === editingId) : undefined;
  const invoiceOptions = invoices.filter(invoice => !form.idContrato || invoice.idContrato === Number(form.idContrato));
  const currentInvoiceMissing = currentDocument?.idFactura && form.idFactura === String(currentDocument.idFactura) && !invoiceOptions.some(invoice => invoice.idFactura === currentDocument.idFactura);
  const currentChargeMissing = currentDocument?.idCargoAdicional && form.idCargoAdicional === String(currentDocument.idCargoAdicional) && !charges.some(charge => charge.idCargo === currentDocument.idCargoAdicional);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries({ idEmpresa, ...filters, ...(fixedCustomerId ? { idCliente: fixedCustomerId } : {}), page, pageSize: 20 }).filter(([, value]) => value !== ''));
      const { data } = await api.get<ExternalTaxDocumentPage>('/external-tax-documents', { params, signal });
      if (signal?.aborted || context.current !== contextKey) return;
      setDocuments(data.items);
      setTotalRows(data.pagination.totalRows);
    } catch (error) {
      if (!signal?.aborted && context.current === contextKey) setStatus(apiErrorMessage(error));
    } finally {
      if (!signal?.aborted && context.current === contextKey) setLoading(false);
    }
  }, [idEmpresa, filters, page, fixedCustomerId, contextKey]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => {
    setPage(1);
    setEditingId(null);
    setForm(customerForm());
    setFilters(EMPTY_FILTERS);
    setDocuments([]);
    setStatus('');
    setFieldErrors({});
  }, [idEmpresa, fixedCustomerId]);

  useEffect(() => {
    const controller = new AbortController();
    setInvoices([]); setRelationError('');
    if (!form.idCliente || !selectedCustomer) { setRelationsLoading(false); return () => controller.abort(); }
    setRelationsLoading(true);
    void api.get<CustomerHistory>(`/commercial/control-book/customers/${form.idCliente}/history`, { params: { idEmpresa }, signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (data.idCliente !== Number(form.idCliente)) throw new Error('invalid-context');
        const contracts = new Set((selectedCustomer.contratos ?? []).map(contract => contract.idContrato));
        setInvoices((data.invoices ?? []).filter(invoice => contracts.has(invoice.idContrato)));
      })
      .catch(error => { if (!controller.signal.aborted) setRelationError(apiErrorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setRelationsLoading(false); });
    return () => controller.abort();
  }, [idEmpresa, form.idCliente, selectedCustomer]);

  useEffect(() => {
    const controller = new AbortController(); setCharges([]);
    if (!form.idFactura) return () => controller.abort();
    void api.get<BillingInvoiceDetail>(`/billing/invoices/${form.idFactura}`, { params: { scope: String(idEmpresa) }, signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (data.idFactura !== Number(form.idFactura) || data.contrato?.idEmpresa !== idEmpresa || (form.idCliente && data.contrato.cliente?.idCliente !== Number(form.idCliente)) || (form.idContrato && data.idContrato !== Number(form.idContrato))) throw new Error('invalid-context');
        setCharges(data.cargos ?? []);
      })
      .catch(error => { if (!controller.signal.aborted) setRelationError(apiErrorMessage(error)); });
    return () => controller.abort();
  }, [idEmpresa, form.idCliente, form.idContrato, form.idFactura]);

  function optionalNumber(value: string, clearWhenEditing = false) {
    if (value) return Number(value);
    return clearWhenEditing && editingId ? null : undefined;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !canManage) return;
    const validation = validateExternalDocumentForm(form);
    setFieldErrors(validation);
    if (Object.keys(validation).length) { setStatus('Revisa los campos indicados; no se guardó el documento.'); return; }
    const submittedContext = contextKey;
    pending.current = true; setBusy(true);
    try {
      setStatus('');
      const payload = {
        idEmpresa,
        tipoDocumento: form.tipoDocumento,
        folioONumero: form.folioONumero.trim(),
        emisorProveedor: form.emisorProveedor.trim(),
        fechaEmision: form.fechaEmision,
        montoNeto: optionalNumber(form.montoNeto, true),
        montoExento: optionalNumber(form.montoExento, true),
        iva: optionalNumber(form.iva, true),
        montoTotal: Number(form.montoTotal),
        estado: form.estado,
        idCliente: fixedCustomerId ?? optionalNumber(form.idCliente, true),
        idContrato: optionalNumber(form.idContrato, true),
        idFactura: optionalNumber(form.idFactura, true),
        idCargoAdicional: optionalNumber(form.idCargoAdicional, true),
        urlDocumento: form.urlDocumento.trim() || (editingId ? null : undefined),
        referenciaExterna: form.referenciaExterna.trim() || (editingId ? null : undefined),
      };
      if (editingId) {
        const { idEmpresa: _ignored, ...update } = payload;
        await api.patch(`/external-tax-documents/${editingId}`, update);
        if (context.current === submittedContext) setStatus('Documento tributario actualizado');
      } else {
        await api.post('/external-tax-documents', payload);
        if (context.current === submittedContext) setStatus('Documento tributario externo registrado. No se generó un pago ni se emitió un DTE.');
      }
      if (context.current !== submittedContext) return;
      setEditingId(null);
      setForm(customerForm());
      await load();
    } catch (error) {
      if (context.current === submittedContext) setStatus(apiErrorMessage(error));
    } finally {
      pending.current = false; setBusy(false);
    }
  }

  function edit(document: ExternalTaxDocument) {
    if (pending.current) return;
    setFieldErrors({}); setStatus('');
    setEditingId(document.idDocumento);
    setForm({
      tipoDocumento: document.tipoDocumento,
      folioONumero: document.folioONumero,
      emisorProveedor: document.emisorProveedor,
      fechaEmision: document.fechaEmision.slice(0, 10),
      montoNeto: document.montoNeto ?? '',
      montoExento: document.montoExento ?? '',
      iva: document.iva ?? '',
      montoTotal: document.montoTotal,
      estado: document.estado,
      idCliente: document.idCliente ? String(document.idCliente) : '',
      idContrato: document.idContrato ? String(document.idContrato) : '',
      idFactura: document.idFactura ? String(document.idFactura) : '',
      idCargoAdicional: document.idCargoAdicional ? String(document.idCargoAdicional) : '',
      urlDocumento: document.urlDocumento ?? '',
      referenciaExterna: document.referenciaExterna ?? '',
    });
  }

  async function deactivate(document: ExternalTaxDocument) {
    if (pending.current || !canManage) return;
    const submittedContext = contextKey;
    pending.current = true; setBusy(true);
    try {
      await api.patch(`/external-tax-documents/${document.idDocumento}/deactivate`);
      if (context.current !== submittedContext) return;
      setStatus('Referencia tributaria anulada; su trazabilidad fue conservada');
      await load();
    } catch (error) {
      if (context.current === submittedContext) setStatus(apiErrorMessage(error));
    } finally {
      pending.current = false; setBusy(false);
    }
  }

  return (
    <div className="tax-documents">
      <section className="panel stack">
        <p>Registra boletas y facturas que ya existen fuera del CRM. Esta referencia no registra pagos, no emite documentos tributarios y no modifica la deuda.</p>
        {!fixedCustomerId && <p>Puede guardarse sin cliente para conservar una referencia de un emisor o proveedor. «Sin cliente» no clasifica el documento como compra: el modelo actual no distingue compras recibidas de ventas emitidas.</p>}
        <p>El comprobante de transferencia corresponde al pago; su código bancario no es un folio fiscal ni el identificador de una factura CRM.</p>
        {status && <p className="inline-status" role="status">{status}</p>}
        {Object.entries(fieldErrors).length > 0 && <ul role="alert">{Object.entries(fieldErrors).map(([field, message]) => <li key={field}>{message}</li>)}</ul>}

        {canManage && (
          <details open={Boolean(editingId)}>
            <summary>{editingId ? `Corregir documento ${editingId}` : 'Registrar documento tributario externo'}</summary>
            <form className="tax-document-form" onSubmit={submit}>
              <fieldset disabled={busy} style={{ display: 'contents' }}>
              <label>Empresa<input value={`Empresa ${idEmpresa}`} readOnly /></label>
              <label>Tipo<select value={form.tipoDocumento} onChange={(event) => setForm({ ...form, tipoDocumento: event.target.value })}><option value="BOLETA">Boleta</option><option value="FACTURA">Factura</option></select></label>
              <label>Folio/Número<input required maxLength={80} value={form.folioONumero} onChange={(event) => setForm({ ...form, folioONumero: event.target.value })} /></label>
              <label>Emisor/Proveedor<input required maxLength={160} value={form.emisorProveedor} onChange={(event) => setForm({ ...form, emisorProveedor: event.target.value })} /></label>
              <label>Fecha<input required type="date" value={form.fechaEmision} onChange={(event) => setForm({ ...form, fechaEmision: event.target.value })} /></label>
              <label>Monto total<input required type="number" min="0" step="0.01" value={form.montoTotal} onChange={(event) => setForm({ ...form, montoTotal: event.target.value })} /></label>
              <label>Neto opcional<input type="number" min="0" step="0.01" value={form.montoNeto} onChange={(event) => setForm({ ...form, montoNeto: event.target.value })} /></label>
              <label>Exento opcional<input type="number" min="0" step="0.01" value={form.montoExento} onChange={(event) => setForm({ ...form, montoExento: event.target.value })} /></label>
              <label>IVA opcional<input type="number" min="0" step="0.01" value={form.iva} onChange={(event) => setForm({ ...form, iva: event.target.value })} /></label>
              <label>Estado<select value={form.estado} onChange={(event) => setForm({ ...form, estado: event.target.value })}><option value="REGISTRADO">Registrado</option><option value="ANULADO">Anulado</option></select></label>
              {!fixedCustomerId && <label>Cliente opcional<select value={form.idCliente} onChange={(event) => setForm({ ...form, idCliente: event.target.value, idContrato: '', idFactura: '', idCargoAdicional: '' })}><option value="">Sin cliente</option>{companyCustomers.map((customer) => <option key={customer.idCliente} value={customer.idCliente}>{customer.nombreCompleto} · {customer.rut ?? 'sin RUT'}</option>)}</select></label>}
              <label>Contrato opcional<select value={form.idContrato} onChange={(event) => setForm({ ...form, idContrato: event.target.value, idFactura: '', idCargoAdicional: '' })}><option value="">Sin contrato</option>{(selectedCustomer?.contratos ?? []).map((contract) => <option key={contract.idContrato} value={contract.idContrato}>Contrato {contract.idContrato} · {contract.estado ?? '-'}</option>)}</select></label>
              <label>Factura CRM opcional<select value={form.idFactura} disabled={relationsLoading || (!form.idCliente && !currentInvoiceMissing)} onChange={(event) => { const invoice = invoiceOptions.find(item => item.idFactura === Number(event.target.value)); setForm({ ...form, idFactura: event.target.value, idContrato: invoice ? String(invoice.idContrato) : form.idContrato, idCargoAdicional: '' }); }}><option value="">Sin factura CRM</option>{currentInvoiceMissing && <option value={currentDocument.idFactura!}>Factura CRM #{currentDocument.idFactura} · vínculo actual</option>}{invoiceOptions.map(invoice => <option key={invoice.idFactura} value={invoice.idFactura}>Factura CRM #{invoice.idFactura} · {invoice.fechaEmision ? formatDateOnly(invoice.fechaEmision) : 'sin fecha'} · contrato {invoice.idContrato} · saldo {invoice.saldo == null ? 'no determinado' : `$${invoice.saldo.toLocaleString('es-CL')}`}</option>)}</select><small>Selecciona una factura del cliente y empresa; no ingreses la operación de transferencia.</small></label>
              <label>Cargo opcional<select value={form.idCargoAdicional} disabled={!form.idFactura && !currentChargeMissing} onChange={(event) => setForm({ ...form, idCargoAdicional: event.target.value })}><option value="">Sin cargo</option>{currentChargeMissing && <option value={currentDocument.idCargoAdicional!}>Cargo #{currentDocument.idCargoAdicional} · vínculo actual</option>}{charges.map(charge => <option key={charge.idCargo} value={charge.idCargo}>Cargo #{charge.idCargo} · {charge.tipo} · ${Number(charge.monto).toLocaleString('es-CL')} · {charge.estado}</option>)}</select><small>Los cargos disponibles se consultan en la factura CRM seleccionada.</small></label>
              {relationError && <p className="tax-document-wide" role="alert">No se pudieron consultar las referencias del CRM: {relationError}. Puedes registrar el documento sin esos vínculos.</p>}
              <label className="tax-document-wide">URL opcional<input type="url" maxLength={2048} placeholder="https://..." value={form.urlDocumento} onChange={(event) => setForm({ ...form, urlDocumento: event.target.value })} /></label>
              <label className="tax-document-wide">Referencia opcional<input maxLength={200} value={form.referenciaExterna} onChange={(event) => setForm({ ...form, referenciaExterna: event.target.value })} /></label>
              <div className="button-row tax-document-wide">
                <button type="submit" disabled={busy || relationsLoading}>{busy ? 'Guardando…' : editingId ? 'Guardar corrección' : 'Registrar documento'}</button>
                {editingId && <button type="button" className="secondary" onClick={() => { setEditingId(null); setForm(customerForm()); }}>Cancelar</button>}
              </div>
              </fieldset>
            </form>
          </details>
        )}

        <div className="tax-document-filters">
          <input aria-label="Buscar documentos" placeholder="Buscar folio, emisor, nombre o RUT" value={filters.search} onChange={(event) => { setPage(1); setFilters({ ...filters, search: event.target.value }); }} />
          <select aria-label="Filtrar tipo" value={filters.tipoDocumento} onChange={(event) => { setPage(1); setFilters({ ...filters, tipoDocumento: event.target.value }); }}><option value="">Todos los tipos</option><option value="BOLETA">Boleta</option><option value="FACTURA">Factura</option></select>
          <input aria-label="Filtrar folio" placeholder="Folio" value={filters.folio} onChange={(event) => { setPage(1); setFilters({ ...filters, folio: event.target.value }); }} />
          <input aria-label="Filtrar emisor" placeholder="Emisor/Proveedor" value={filters.emisorProveedor} onChange={(event) => { setPage(1); setFilters({ ...filters, emisorProveedor: event.target.value }); }} />
          {!fixedCustomerId && <select aria-label="Filtrar cliente" value={filters.idCliente} onChange={(event) => { setPage(1); setFilters({ ...filters, idCliente: event.target.value, idContrato: '' }); }}><option value="">Todos los clientes</option>{companyCustomers.map((customer) => <option key={customer.idCliente} value={customer.idCliente}>{customer.nombreCompleto}</option>)}</select>}
          <select aria-label="Filtrar contrato" value={filters.idContrato} onChange={(event) => { setPage(1); setFilters({ ...filters, idContrato: event.target.value }); }}><option value="">Todos los contratos</option>{(filterCustomer?.contratos ?? []).map((contract) => <option key={contract.idContrato} value={contract.idContrato}>Contrato {contract.idContrato}</option>)}</select>
          <input aria-label="Filtrar factura" type="number" min="1" placeholder="ID factura" value={filters.idFactura} onChange={(event) => { setPage(1); setFilters({ ...filters, idFactura: event.target.value }); }} />
          <select aria-label="Filtrar estado" value={filters.estado} onChange={(event) => { setPage(1); setFilters({ ...filters, estado: event.target.value }); }}><option value="">Todos los estados</option><option value="REGISTRADO">Registrado</option><option value="ANULADO">Anulado</option></select>
          <label>Desde<input type="date" value={filters.fechaDesde} onChange={(event) => { setPage(1); setFilters({ ...filters, fechaDesde: event.target.value }); }} /></label>
          <label>Hasta<input type="date" value={filters.fechaHasta} onChange={(event) => { setPage(1); setFilters({ ...filters, fechaHasta: event.target.value }); }} /></label>
          <button type="button" className="secondary compact" onClick={() => { setPage(1); setFilters(EMPTY_FILTERS); }}>Limpiar</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Tipo / Folio</th><th>Emisor</th><th>Cliente / Contrato</th><th>Fecha</th><th>Monto</th><th>Estado</th><th>Referencia</th><th>Fuente</th><th></th></tr></thead>
            <tbody>{documents.map((document) => (
              <tr key={document.idDocumento}>
                <td><strong>{document.tipoDocumento}</strong><br />{document.folioONumero}</td>
                <td>{document.emisorProveedor}</td>
                <td>{document.cliente?.nombreCompleto ?? '-'}<br />{document.idContrato ? `Contrato ${document.idContrato}` : '-'}</td>
                <td>{formatDateOnly(document.fechaEmision)}</td>
                <td>${Number(document.montoTotal).toLocaleString('es-CL')}</td>
                <td><StatusBadge value={document.estado} /></td>
                <td>{document.urlDocumento ? <a href={document.urlDocumento} target="_blank" rel="noreferrer">Abrir referencia</a> : document.referenciaExterna ?? '-'}</td>
                <td><span className="source-badge">Registro manual</span></td>
                <td>{canManage && <div className="table-actions"><button type="button" className="secondary compact" onClick={() => edit(document)}>Corregir</button>{document.estado !== 'ANULADO' && <button type="button" className="secondary compact" onClick={() => void deactivate(document)}>Anular</button>}</div>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!loading && !documents.length && <p className="empty-state">No hay documentos tributarios para los filtros seleccionados.</p>}
        {loading && <p className="empty-state">Cargando documentos…</p>}
        <TablePagination currentPage={page} totalItems={totalRows} pageSize={20} onPageChange={setPage} />
      </section>
    </div>
  );
}
