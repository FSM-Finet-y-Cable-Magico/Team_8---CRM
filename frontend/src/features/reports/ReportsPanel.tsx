import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { api, apiErrorMessage, type Company } from '../../api';
import { reportMinimumDate } from '../../constants';
import { dateInputValue, formatDateOnly } from '../../lib';
import { ReportPeriodPicker } from './ReportPeriodPicker';

export function ReportsPanel({ companies, initialScope }: { companies: Company[]; initialScope: string }) {
  const [type, setType] = useState('libro-control');
  const [format, setFormat] = useState('csv');
  const [companyId, setCompanyId] = useState(initialScope);
  const [period, setPeriod] = useState({ from: '', to: '' });
  const [busy, setBusy] = useState(false);
  const { from: dateFrom, to: dateTo } = period;
  const [status, setStatus] = useState('');
  const today = dateInputValue(new Date());

  useEffect(() => {
    setCompanyId(initialScope);
  }, [initialScope]);

  async function exportReport() {
    if (busy) return;
    if (!companyId) {
      setStatus('Selecciona la empresa incluida en el reporte.');
      return;
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      setStatus('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }

    if ((dateFrom && dateFrom < reportMinimumDate) || (dateTo && dateTo < reportMinimumDate)) {
      setStatus(`El periodo no puede ser anterior a ${formatDateOnly(reportMinimumDate)}.`);
      return;
    }

    if ((dateFrom && dateFrom > today) || (dateTo && dateTo > today)) {
      setStatus('El periodo del reporte no puede incluir fechas futuras.');
      return;
    }

    setBusy(true);
    setStatus('');
    try {
      const response = await api.get('/reports/export', {
        params: {
          type,
          format,
          scope: companyId,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
        responseType: 'blob',
        timeout: 120000,
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reporte-${type}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus('Reporte generado correctamente');
    } catch (err) {
      setStatus(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="reports-shell">
      <div className="report-card">
        <div className="section-heading centered report-heading">
          <span className="report-heading-icon" aria-hidden="true">
            <BarChart3 size={28} strokeWidth={1.8} />
          </span>
          <h2>Reportes operativos</h2>
        </div>
        <div className="report-form-grid">
          <label>
            Tipo de reporte
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="libro-control">Libro de control</option>
              <option value="clientes">Clientes</option>
              <option value="prospectos">Prospectos</option>
              <option value="tickets">Tickets</option>
              <option value="inventario">Inventario</option>
            </select>
          </label>
          <label>
            Formato
            <select value={format} onChange={(event) => setFormat(event.target.value)}>
              <option value="csv">CSV</option>
              <option value="xlsx">Excel (.xlsx)</option>
            </select>
          </label>
          <ReportPeriodPicker value={period} onChange={setPeriod} min={reportMinimumDate} max={today} />
          <label>
            Empresa
            <select
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              <option value="consolidado">Todas las empresas</option>
              {companies.map((company) => (
                <option key={company.idEmpresa} value={company.idEmpresa}>
                  {company.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="report-button" disabled={busy} onClick={exportReport}>
          {busy ? 'Generando reporte…' : 'Generar reporte'}
        </button>
        {status && <p className="inline-status">{status}</p>}
      </div>
    </section>
  );
}
