import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage, DigitalContract } from '../../api';
import { formatDateTime } from '../../lib';
import { StatusBadge } from '../../shared/components';

export function ContractDocuments({ idContrato, canGenerate }: { idContrato: number; canGenerate: boolean }) {
  const [documents, setDocuments] = useState<DigitalContract[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const { data } = await api.get<{ documents: DigitalContract[] }>(`/contracts/${idContrato}/digital-contract`);
    setDocuments(data.documents);
  }, [idContrato]);
  useEffect(() => {
    let active = true;
    setLoading(true); setDocuments([]); setMessage('');
    api.get<{ documents: DigitalContract[] }>(`/contracts/${idContrato}/digital-contract`)
      .then(({ data }) => { if (active) setDocuments(data.documents); })
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
  async function download(row: DigitalContract) {
    setBusy(true); setMessage('');
    try {
      const { data } = await api.get(`/contracts/${idContrato}/digital-contract/download`, { params: { version: row.version }, responseType: 'blob' });
      const url = URL.createObjectURL(data); const link = document.createElement('a');
      link.href = url; link.download = `contrato-${idContrato}-v${row.version}.pdf`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setMessage(apiErrorMessage(e)); } finally { setBusy(false); }
  }
  return <section className="workflow-panel"><header className="section-heading compact-heading"><h3>Documentos del contrato</h3>
    {canGenerate && <button className="secondary compact" disabled={busy || loading} onClick={() => void generate()}>{busy ? 'Procesando…' : documents.length ? 'Generar nueva versión' : 'Generar PDF'}</button>}</header>
    <p>La confirmación de firma se registra por separado en la contratación.</p>
    {message && <p role="status" className="inline-status">{message}</p>}
    {loading ? <p>Cargando documentos…</p> : documents.length ? <div className="table-wrap"><table><thead><tr><th>Versión</th><th>Generado</th><th>Estado documental</th><th></th></tr></thead>
      <tbody>{documents.map(row => <tr key={row.idContratoDigital}><td>{row.version}</td><td>{formatDateTime(row.fechaGeneracion)}</td><td><StatusBadge value={row.estadoFirma} /></td><td><button className="secondary compact" disabled={busy} onClick={() => void download(row)}>Descargar PDF</button></td></tr>)}</tbody></table></div> : <p className="empty-state">Todavía no se ha generado un documento.</p>}
  </section>;
}
