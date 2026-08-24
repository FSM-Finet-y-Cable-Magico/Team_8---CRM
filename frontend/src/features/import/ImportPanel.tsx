import { FormEvent, useState } from 'react';
import { FileUp } from 'lucide-react';
import { api, apiErrorMessage } from '../../api';

export function ImportPanel({ writeCompanyId, onImported }: { writeCompanyId: number; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!file) {
      setResult('Selecciona un archivo');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post('/imports/clients', formData, {
        params: { idEmpresa: writeCompanyId },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(`${data.status}: ${data.importedRows} importadas, ${data.rejectedRows} rechazadas`);
      onImported();
    } catch (err) {
      setResult(apiErrorMessage(err));
    }
  }

  return (
    <form className="import-panel" onSubmit={submit}>
      <div className="import-panel-heading">
        <span className="import-panel-icon" aria-hidden="true">
          <FileUp size={28} strokeWidth={1.8} />
        </span>
        <h2>Importación</h2>
      </div>
      <input
        aria-label="Seleccionar archivo para importar"
        accept=".csv,.xls,.xlsx"
        type="file"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <button>Importar</button>
      {result && <p className="inline-status">{result}</p>}
    </form>
  );
}
