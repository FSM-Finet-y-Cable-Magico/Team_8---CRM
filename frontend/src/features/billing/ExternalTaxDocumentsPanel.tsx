import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, apiErrorMessage, type Customer, type ExternalTaxDocument, type ExternalTaxDocumentPage } from '../../api';
import { formatDateOnly } from '../../lib';
import { StatusBadge, TablePagination } from '../../shared/components';

const EMPTY_FORM = {
  tipoDocumento: 'BOLETA', folioONumero: '', emisorProveedor: '', fechaEmision: '',
  montoNeto: '', montoExento: '', iva: '', montoTotal: '', estado: 'REGISTRADO',
  idCliente: '', idContrato: '', idFactura: '', idCargoAdicional: '', urlDocumento: '', referenciaExterna: '',
};

const EMPTY_FILTERS = {
  search: '', tipoDocumento: '', folio: '', emisorProveedor: '', idCliente: '', idContrato: '', idFactura: '',
  estado: '', fechaDesde: '', fechaHasta: '',
};

export function ExternalTaxDocumentsPanel({ customers, scope, writeCompanyId, canManage }: {
  customers: Customer[];
  scope: string;
  writeCompanyId: number;
  canManage: boolean;
}) {
  const [documents, setDocuments] = useState<ExternalTaxDocument[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const idEmpresa = scope !== 'consolidado' && Number.isInteger(Number(scope)) ? Number(scope) : writeCompanyId;
  const companyCustomers = useMemo(() => customers.filter((customer) => customer.idEmpresa === idEmpresa), [customers, idEmpresa]);
  const selectedCustomer = companyCustomers.find((customer) => String(customer.idCliente) === form.idCliente);
  const filterCustomer = companyCustomers.find((customer) => String(customer.idCliente) === filters.idCliente);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries({ idEmpresa, ...filters, page, pageSize: 20 }).filter(([, value]) => value !== ''));
      const { data } = await api.get<ExternalTaxDocumentPage>('/external-tax-documents', { params });
      setDocuments(data.items);
      setTotalRows(data.pagination.totalRows);
    } catch (error) {
      setStatus(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [idEmpresa, filters, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setPage(1);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, [idEmpresa]);

  function optionalNumber(value: string, clearWhenEditing = false) {
    if (value) return Number(value);
    return clearWhenEditing && editingId ? null : undefined;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
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
        idCliente: optionalNumber(form.idCliente, true),
        idContrato: optionalNumber(form.idContrato, true),
        idFactura: optionalNumber(form.idFactura, true),
        idCargoAdicional: optionalNumber(form.idCargoAdicional, true),
        urlDocumento: form.urlDocumento.trim() || (editingId ? null : undefined),
        referenciaExterna: form.referenciaExterna.trim() || (editingId ? null : undefined),
      };
      if (editingId) {
        const { idEmpresa: _ignored, ...update } = payload;
        await api.patch(`/external-tax-documents/${editingId}`, update);
        setStatus('Documento tributario actualizado');
      } else {
        await api.post('/external-tax-documents', payload);
        setStatus('Documento tributario registrado');
      }
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (error) {
      setStatus(apiErrorMessage(error));
    }
  }

  function edit(document: ExternalTaxDocument) {
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
    try {
      await api.patch(`/external-tax-documents/${document.idDocumento}/deactivate`);
      setStatus('Referencia tributaria anulada; su trazabilidad fue conservada');
      await load();
    } catch (error) {
      setStatus(apiErrorMessage(error));
    }
  }

  return (
    <details className="billing-workspace-section tax-documents" open>
      <summary><span>Documentos tributarios</span><strong>{totalRows}</strong></summary>
      <section className="panel stack">
        <div className="section-heading">
          <h2>Documentos tributarios externos</h2>
          <p>Metadata de boletas y facturas externas. Fuente EXTERNO_MANUAL; Facturación.cl permanece sin integración.</p>
        </div>
        {status && <p className="inline-status">{status}</p>}

        {canManage && (
          <details open={Boolean(editingId)}>
            <summary>{editingId ? `Corregir documento ${editingId}` : 'Registrar documento externo'}</summary>
            <form className="tax-document-form" onSubmit={submit}>
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
              <label>Cliente opcional<select value={form.idCliente} onChange={(event) => setForm({ ...form, idCliente: event.target.value, idContrato: '' })}><option value="">Sin cliente</option>{companyCustomers.map((customer) => <option key={customer.idCliente} value={customer.idCliente}>{customer.nombreCompleto} · {customer.rut ?? 'sin RUT'}</option>)}</select></label>
              <label>Contrato opcional<select value={form.idContrato} onChange={(event) => setForm({ ...form, idContrato: event.target.value })}><option value="">Sin contrato</option>{(selectedCustomer?.contratos ?? []).map((contract) => <option key={contract.idContrato} value={contract.idContrato}>Contrato {contract.idContrato} · {contract.estado ?? '-'}</option>)}</select></label>
              <label>Factura opcional<input type="number" min="1" placeholder="ID factura" value={form.idFactura} onChange={(event) => setForm({ ...form, idFactura: event.target.value })} /></label>
              <label>Cargo opcional<input type="number" min="1" placeholder="ID cargo" value={form.idCargoAdicional} onChange={(event) => setForm({ ...form, idCargoAdicional: event.target.value })} /></label>
              <label className="tax-document-wide">URL opcional<input type="url" maxLength={2048} placeholder="https://..." value={form.urlDocumento} onChange={(event) => setForm({ ...form, urlDocumento: event.target.value })} /></label>
              <label className="tax-document-wide">Referencia opcional<input maxLength={200} value={form.referenciaExterna} onChange={(event) => setForm({ ...form, referenciaExterna: event.target.value })} /></label>
              <div className="button-row tax-document-wide">
                <button type="submit">{editingId ? 'Guardar corrección' : 'Registrar metadata'}</button>
                {editingId && <button type="button" className="secondary" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>Cancelar</button>}
              </div>
            </form>
          </details>
        )}

        <div className="tax-document-filters">
          <input aria-label="Buscar documentos" placeholder="Buscar folio, emisor, nombre o RUT" value={filters.search} onChange={(event) => { setPage(1); setFilters({ ...filters, search: event.target.value }); }} />
          <select aria-label="Filtrar tipo" value={filters.tipoDocumento} onChange={(event) => { setPage(1); setFilters({ ...filters, tipoDocumento: event.target.value }); }}><option value="">Todos los tipos</option><option value="BOLETA">Boleta</option><option value="FACTURA">Factura</option></select>
          <input aria-label="Filtrar folio" placeholder="Folio" value={filters.folio} onChange={(event) => { setPage(1); setFilters({ ...filters, folio: event.target.value }); }} />
          <input aria-label="Filtrar emisor" placeholder="Emisor/Proveedor" value={filters.emisorProveedor} onChange={(event) => { setPage(1); setFilters({ ...filters, emisorProveedor: event.target.value }); }} />
          <select aria-label="Filtrar cliente" value={filters.idCliente} onChange={(event) => { setPage(1); setFilters({ ...filters, idCliente: event.target.value, idContrato: '' }); }}><option value="">Todos los clientes</option>{companyCustomers.map((customer) => <option key={customer.idCliente} value={customer.idCliente}>{customer.nombreCompleto}</option>)}</select>
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
                <td><span className="source-badge">{document.fuente}</span></td>
                <td>{canManage && <div className="table-actions"><button type="button" className="secondary compact" onClick={() => edit(document)}>Corregir</button>{document.estado !== 'ANULADO' && <button type="button" className="secondary compact" onClick={() => void deactivate(document)}>Anular</button>}</div>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!loading && !documents.length && <p className="empty-state">No hay documentos tributarios para los filtros seleccionados.</p>}
        {loading && <p className="empty-state">Cargando documentos…</p>}
        <TablePagination currentPage={page} totalItems={totalRows} pageSize={20} onPageChange={setPage} />
      </section>
    </details>
  );
}
