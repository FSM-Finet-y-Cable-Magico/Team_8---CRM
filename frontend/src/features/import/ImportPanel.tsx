import { FormEvent, useState } from 'react';
import { FileSearch, FileUp } from 'lucide-react';
import { api, apiErrorMessage } from '../../api';

type Preview = {
  formatVersion: string;
  sheetName: string;
  sheetKind: string;
  totalRows: number;
  recognizedRows: number;
  validRut: number;
  invalidRut: number;
  duplicates: number;
  existingRecords: number;
  unknownRecords: number;
  recognizedPlans: number;
  unknownPlans: number;
  invalidDates: number;
  invalidAmounts: number;
  ambiguousFields: number;
  persisted: boolean;
  errors: Array<{ rowNumber: number; issues: string[] }>;
};

export function ImportPanel({ writeCompanyId, onImported }: { writeCompanyId: number; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [controlFile, setControlFile] = useState<File | null>(null);
  const [result, setResult] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) { setResult('Selecciona un archivo'); return; }
    const formData = new FormData(); formData.append('file', file);
    try {
      const { data } = await api.post('/imports/clients', formData, { params: { idEmpresa: writeCompanyId }, headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(`${data.status}: ${data.importedRows} importadas, ${data.rejectedRows} rechazadas`); onImported();
    } catch (err) { setResult(apiErrorMessage(err)); }
  }

  async function previewControlBook(event: FormEvent) {
    event.preventDefault();
    if (!controlFile) { setResult('Selecciona un XLSX de Libro Control'); return; }
    const formData = new FormData(); formData.append('file', controlFile); setBusy(true); setResult(''); setPreview(null);
    try {
      const { data } = await api.post<Preview>('/imports/control-book/preview', formData, { params: { idEmpresa: writeCompanyId }, headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(data); setResult('Preview completado. No se persistieron filas.');
    } catch (err) { setResult(apiErrorMessage(err)); } finally { setBusy(false); }
  }

  return <section className="import-workspace">
    <form className="import-panel" onSubmit={submit}>
      <div className="import-panel-heading"><span className="import-panel-icon"><FileUp size={28}/></span><div><h2>Importación histórica</h2><p>Flujo existente para clientes y prospectos normalizados.</p></div></div>
      <input aria-label="Seleccionar archivo para importar" accept=".csv,.xls,.xlsx" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)}/><button>Importar</button>
    </form>
    <form className="import-panel" onSubmit={previewControlBook}>
      <div className="import-panel-heading"><span className="import-panel-icon"><FileSearch size={28}/></span><div><h2>Preview Libro Control</h2><p>Analiza FINET_LIBRO_CONTROL_V1 sin guardar clientes, facturas ni pagos.</p></div></div>
      <input aria-label="Seleccionar Libro Control para preview" accept=".xlsx" type="file" onChange={(event) => setControlFile(event.target.files?.[0] ?? null)}/><button className="secondary" disabled={busy}>{busy ? 'Analizando…' : 'Generar preview'}</button>
      {preview && <div className="import-preview"><header><strong>{preview.sheetName}</strong><span>{preview.sheetKind}</span></header><dl>{[['Filas',preview.totalRows],['Reconocidas',preview.recognizedRows],['RUT inválidos',preview.invalidRut],['Duplicados',preview.duplicates],['Registros existentes',preview.existingRecords],['Planes desconocidos',preview.unknownPlans],['Fechas inválidas',preview.invalidDates],['Montos inválidos',preview.invalidAmounts],['Campos ambiguos',preview.ambiguousFields]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>Persistencia: <strong>{preview.persisted ? 'Sí' : 'No'}</strong></p>{preview.errors.length > 0 && <details><summary>Revisar primeras observaciones ({preview.errors.length})</summary><ul>{preview.errors.slice(0,30).map((item)=><li key={item.rowNumber}>Fila {item.rowNumber}: {item.issues.join(', ')}</li>)}</ul></details>}</div>}
    </form>
    {result && <p className="inline-status">{result}</p>}
  </section>;
}