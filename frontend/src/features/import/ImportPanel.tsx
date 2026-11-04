import { type FormEvent, useEffect, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { api, apiErrorMessage } from '../../api';

type ImportResult = {
  status: string;
  importedRows: number;
  rejectedRows: number;
  errors?: Array<{ rowNumber: number; reason: string }>;
};

export function ImportPanel({ writeCompanyId, onImported }: { writeCompanyId: number; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const revision = useRef(0);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    setFile(null); setResult(null); setError(''); setBusy(false); pending.current = false;
    if (input.current) input.current.value = '';
    return () => { revision.current++; request.current?.abort(); };
  }, [writeCompanyId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (!file) { setError('Selecciona un archivo para importar.'); return; }
    if (/\.xls$/i.test(file.name)) { setError('Guarda el archivo Excel antiguo como XLSX o CSV antes de cargarlo.'); return; }
    if (!/\.(csv|xlsx)$/i.test(file.name)) { setError('Selecciona un archivo CSV o XLSX.'); return; }
    if (!file.size || file.size > 5 * 1024 * 1024) { setError(file.size ? 'El archivo supera el límite de 5 MB.' : 'El archivo está vacío.'); return; }
    const current = revision.current;
    const controller = new AbortController(); request.current = controller;
    const body = new FormData(); body.append('file', file);
    pending.current = true; setBusy(true); setError(''); setResult(null);
    let imported = false;
    try {
      const { data } = await api.post<ImportResult>('/imports/clients', body, { params: { idEmpresa: writeCompanyId }, signal: controller.signal, headers: { 'Content-Type': 'multipart/form-data' } });
      if (current !== revision.current || controller.signal.aborted) return;
      setResult(data);
      imported = data.importedRows > 0;
      if (imported) { setFile(null); if (input.current) input.current.value = ''; }
    } catch (err) {
      if (current === revision.current && !controller.signal.aborted) setError(apiErrorMessage(err));
    } finally {
      if (current === revision.current) { pending.current = false; setBusy(false); }
    }
    if (imported && current === revision.current) onImported();
  }

  return <section className="import-workspace import-clients-only">
    <form className="import-panel" onSubmit={submit} aria-busy={busy}>
      <div className="import-panel-heading"><span className="import-panel-icon"><FileUp size={28} aria-hidden="true" /></span><div><h2>Importar clientes y prospectos</h2><p>Selecciona un archivo CSV o Excel con los datos que deseas importar.</p></div></div>
      <input ref={input} aria-label="Seleccionar archivo para importar" accept=".csv,.xlsx" type="file" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setResult(null); setError(''); }} />
      <button type="submit" disabled={busy || !file}>{busy ? 'Importando…' : 'Importar'}</button>
      {error && <p className="alert" role="alert">{error}</p>}
      {result && <p className={result.status === 'fallida' ? 'alert' : 'inline-status'} role="status">{result.status === 'fallida' ? 'Importación no realizada.' : 'Importación completada.'} {result.importedRows} registros importados y {result.rejectedRows} filas rechazadas.</p>}
      {Boolean(result?.errors?.length) && <details className="import-client-errors"><summary>Ver filas rechazadas</summary><ul>{result!.errors!.slice(0, 30).map(row => <li key={row.rowNumber}>Fila {row.rowNumber}: {row.reason}</li>)}</ul></details>}
    </form>
  </section>;
}
