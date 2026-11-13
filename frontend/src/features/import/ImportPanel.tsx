import { type FormEvent, useEffect, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { api, apiErrorMessage } from '../../api';

type ImportResult = {
  status: string;
  importedRows: number;
  rejectedRows: number;
  errors?: Array<{ rowNumber: number; reason: string }>;
  skippedRows?: number;
  createdCustomers?: number;
  reusedCustomers?: number;
  warnings?: Array<{ rowNumber: number; reason: string }>;
};
type ImportPreview = {
  formatVersion: string; totalRows: number; readyRows: number; rejectedRows: number; skippedRows: number; warningRows: number; policy: string;
  rows: Array<{ rowNumber: number; action: string; issues: string[]; warnings: string[] }>;
};

export function ImportPanel({ writeCompanyId, onImported }: { writeCompanyId: number; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const revision = useRef(0);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    setFile(null); setPreview(null); setResult(null); setError(''); setBusy(false); pending.current = false;
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
      if (!preview) {
        const { data } = await api.post<ImportPreview>('/imports/control-book/preview', body, { params: { idEmpresa: writeCompanyId, review: 'clients' }, signal: controller.signal, timeout: 120000, headers: { 'Content-Type': 'multipart/form-data' } });
        if (current === revision.current && !controller.signal.aborted) setPreview(data);
        return;
      }
      if (!preview.readyRows) return;
      const { data } = await api.post<ImportResult>('/imports/clients', body, { params: { idEmpresa: writeCompanyId }, signal: controller.signal, timeout: 600000, headers: { 'Content-Type': 'multipart/form-data' } });
      if (current !== revision.current || controller.signal.aborted) return;
      setResult(data);
      imported = data.importedRows > 0;
      if (imported || data.skippedRows) { setFile(null); if (input.current) input.current.value = ''; }
    } catch (err) {
      if (current === revision.current && !controller.signal.aborted) setError(apiErrorMessage(err));
    } finally {
      if (current === revision.current) { pending.current = false; setBusy(false); }
    }
    if (imported && current === revision.current) onImported();
  }

  function downloadReview() {
    if (!preview) return;
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = ['Fila,Acción,Revisión,Observaciones', ...preview.rows.map(row => [String(row.rowNumber), row.action, row.issues.join('. '), row.warnings.join('. ')].map(escape).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'revision-importacion.csv'; link.click(); URL.revokeObjectURL(url);
  }

  return <section className="import-workspace import-clients-only">
    <form className="import-panel" onSubmit={submit} aria-busy={busy}>
      <div className="import-panel-heading"><span className="import-panel-icon"><FileUp size={28} aria-hidden="true" /></span><div><h2>Importar clientes e históricos</h2><p>Revisa el archivo antes de confirmar la carga. Las filas del Libro de control se reconocen como clientes.</p></div></div>
      <input ref={input} aria-label="Seleccionar archivo para importar" accept=".csv,.xlsx" type="file" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null); setResult(null); setError(''); }} />
      <button type="submit" disabled={busy || !file || Boolean(preview && !preview.readyRows)}>{busy ? preview ? 'Importando…' : 'Revisando…' : preview ? `Importar ${preview.readyRows} filas revisadas` : 'Revisar archivo'}</button>
      {error && <p className="alert" role="alert">{error}</p>}
      {preview && !result && <section className="import-review" aria-label="Revisión del archivo">
        <p role="status">{preview.totalRows} filas: {preview.readyRows} listas, {preview.rejectedRows} para revisar y {preview.skippedRows} ya importadas.</p>
        <p>{preview.policy}</p>
        <button type="button" className="secondary" onClick={downloadReview}>Descargar revisión completa</button>
        <details><summary>Ver observaciones por fila</summary><ul>{preview.rows.filter(row => row.issues.length || row.warnings.length).slice(0, 100).map(row => <li key={row.rowNumber}>Fila {row.rowNumber}: {[...row.issues, ...row.warnings].join('. ')}</li>)}</ul></details>
      </section>}
      {result && <p className={result.status === 'fallida' ? 'alert' : 'inline-status'} role="status">{result.status === 'fallida' ? 'Importación no realizada.' : 'Importación completada.'} {result.importedRows} registros incorporados, {result.rejectedRows} filas rechazadas y {result.skippedRows ?? 0} ya importadas.{result.createdCustomers !== undefined && ` ${result.createdCustomers} clientes nuevos y ${result.reusedCustomers ?? 0} historiales agregados a clientes existentes.`}</p>}
      {Boolean(result?.errors?.length) && <details className="import-client-errors"><summary>Ver filas rechazadas</summary><ul>{result!.errors!.slice(0, 30).map(row => <li key={row.rowNumber}>Fila {row.rowNumber}: {row.reason}</li>)}</ul></details>}
    </form>
  </section>;
}
