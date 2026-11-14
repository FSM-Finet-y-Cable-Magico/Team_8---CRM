import { ContractSignatureActions } from '../contracts/ContractSignatureActions';
import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api, apiErrorMessage, DigitalContract } from '../../api';
import { formatDateOnly, formatDateTime } from '../../lib';
import { StatusBadge } from '../../shared/components';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';

export function ContractDocuments({ idContrato, fechaInicio, fechaConfirmacion, canGenerate, onChanged, compact = false, prospectList = false }: {
  idContrato: number; fechaInicio?: string | null; fechaConfirmacion?: string | null; canGenerate: boolean;
  onChanged?: () => void; compact?: boolean; prospectList?: boolean;
}) {
  const [documents, setDocuments] = useState<DigitalContract[]>([]);
  const [quotes, setQuotes] = useState<Array<{ idCotizacion: number; codigo: string | null; fechaEnvio: string | null }>>([]);
  const [prospectId, setProspectId] = useState<number | null>(null);
  const { message, showMessage: setMessage } = useTransientMessage();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const { data } = await api.get<{ documents: DigitalContract[] }>(`/contracts/${idContrato}/digital-contract`);
    setDocuments(data.documents);
  }, [idContrato]);
  useEffect(() => {
    let active = true;
    setLoading(true); setDocuments([]); setMessage('');
    api.get<{ documents: DigitalContract[]; quotes?: typeof quotes; idProspecto?: number | null }>(`/contracts/${idContrato}/digital-contract`)
      .then(({ data }) => { if (active) { setDocuments(data.documents); setQuotes(data.quotes ?? []); setProspectId(data.idProspecto ?? null); } })
      .catch(e => { if (active) setMessage(apiErrorMessage(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [idContrato]);
  async function generate() {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await api.post(`/contracts/${idContrato}/digital-contract`); await load(); setMessage('Nueva versión del contrato generada.'); }
    catch (e) { setMessage(apiErrorMessage(e)); } finally { setBusy(false); }
  }
  async function download(row?: DigitalContract) {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      let contract = row;
      if (!contract) {
        const { data } = await api.post<DigitalContract>(`/contracts/${idContrato}/digital-contract`, undefined, { params: { initial: true } });
        contract = data;
        setDocuments([contract]);
      }
      const { data } = await api.get(`/contracts/${idContrato}/digital-contract/download`, { params: { version: contract.version }, responseType: 'blob' });
      const url = URL.createObjectURL(data); const link = document.createElement('a');
      link.href = url; link.download = `contrato-${idContrato}-v${contract.version}.pdf`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setMessage(apiErrorMessage(e)); } finally { setBusy(false); }
  }
  async function downloadQuote(quote: typeof quotes[number]) {
    if (!prospectId || busy) return;
    setBusy(true); setMessage('');
    try {
      const { data } = await api.get(`/prospects/${prospectId}/quotes/${quote.idCotizacion}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url; link.download = `${quote.codigo ?? 'COT-' + quote.idCotizacion}.pdf`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setMessage(apiErrorMessage(error)); } finally { setBusy(false); }
  }
  if (prospectList) return <>
    {documents.map(row => <li key={row.idContratoDigital}>
      <div><strong>Contrato{documents.length > 1 ? ' · Versión ' + row.version : ''}</strong><small>{formatDateTime(row.fechaGeneracion)}</small></div>
      <button type="button" className="prospect-document-download" aria-label={`Descargar contrato, versión ${row.version}`} title="Descargar contrato" disabled={busy} onClick={() => void download(row)}><Download size={17} aria-hidden="true" /></button>
    </li>)}
    {!documents.length && <li>
      <div><strong>Contrato</strong>{(fechaConfirmacion || fechaInicio) && <small>{fechaConfirmacion ? formatDateTime(fechaConfirmacion) : formatDateOnly(fechaInicio)}</small>}</div>
      {loading ? <span role="status">Cargando…</span> : canGenerate
        ? <button type="button" className="prospect-document-download" aria-label="Descargar contrato" title="Descargar contrato" disabled={busy} onClick={() => void download()}><Download size={17} aria-hidden="true" /></button>
        : <small>Sin PDF generado</small>}
    </li>}
    {message && <li><p role="status" className="inline-status">{message}</p></li>}
    <ContractSignatureActions idContrato={idContrato} canSend={canGenerate} revision={documents[0]?.version ?? 0} onChanged={onChanged} prospectList />
  </>;
  if (compact) {
    return <section className="customer-contract-documents">
      <h4>Documentos</h4>
      {loading ? <span role="status">Cargando…</span> : !documents.length && !quotes.length ? <p className="empty-state">No hay documentos disponibles.</p> : <ul className="customer-document-list">
        {quotes.map(quote => <li key={quote.idCotizacion}><div><strong>{quote.codigo ?? 'COT-' + quote.idCotizacion}</strong><small>{quote.fechaEnvio ? formatDateTime(quote.fechaEnvio) : ''}</small></div><button type="button" aria-label={`Descargar cotización ${quote.codigo ?? quote.idCotizacion}`} title="Descargar cotización" disabled={busy} onClick={() => void downloadQuote(quote)}><Download size={17} aria-hidden="true" /></button></li>)}
        {documents.map(row => <li key={row.idContratoDigital}><div><strong>Contrato{documents.length > 1 ? ' · Versión ' + row.version : ''}</strong><small>{formatDateTime(row.fechaGeneracion)}</small></div><button type="button" aria-label={`Descargar contrato, versión ${row.version}`} title="Descargar contrato" disabled={busy} onClick={() => void download(row)}><Download size={17} aria-hidden="true" /></button></li>)}
      </ul>}
      {message && <p role="status" className="inline-status">{message}</p>}
    </section>;
  }
  return <section className="workflow-panel"><header className="section-heading compact-heading"><h3>Documentos del contrato</h3>
    {canGenerate && <button className="secondary compact" disabled={busy || loading} onClick={() => void generate()}>{busy ? 'Procesando…' : documents.length ? 'Generar nueva versión' : 'Generar PDF'}</button>}</header>
    <p>La confirmación de firma se registra por separado en la contratación.</p>
    <ContractSignatureActions idContrato={idContrato} canSend={canGenerate} revision={documents[0]?.version ?? 0} onChanged={onChanged} />
    {message && <p role="status" className="inline-status">{message}</p>}
    {loading ? <p>Cargando documentos…</p> : documents.length ? <div className="table-wrap"><table><thead><tr><th>Versión</th><th>Generado</th><th>Estado documental</th><th></th></tr></thead>
      <tbody>{documents.map(row => <tr key={row.idContratoDigital}><td>{row.version}</td><td>{formatDateTime(row.fechaGeneracion)}</td><td><StatusBadge value={row.estadoFirma} /></td><td><button className="secondary compact" disabled={busy} onClick={() => void download(row)}>Descargar PDF</button></td></tr>)}</tbody></table></div> : <p className="empty-state">Todavía no se ha generado un documento.</p>}
  </section>;
}
