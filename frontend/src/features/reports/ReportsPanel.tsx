import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { api, apiErrorMessage, type Company } from '../../api';
import { reportMinimumDate } from '../../constants';
import { dateInputValue, formatDateOnly } from '../../lib';

export function ReportsPanel({ companies, initialScope }: { companies: Company[]; initialScope: string }) {
  const [type, setType] = useState('clientes');
  const [format, setFormat] = useState('csv');
  const [scopeMode, setScopeMode] = useState(initialScope === 'consolidado' ? 'consolidado' : 'empresa');
  const [companyId, setCompanyId] = useState(initialScope === 'consolidado' ? '' : initialScope);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('');
  const today = dateInputValue(new Date());

  useEffect(() => {
    if (!companyId && companies[0]) {
      setCompanyId(String(companies[0].idEmpresa));
    }
  }, [companies, companyId]);

  async function exportReport() {
    if (scopeMode === 'empresa' && !companyId) {
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

    try {
      const response = await api.get('/reports/export', {
        params: {
          type,
          format,
          scope: scopeMode === 'consolidado' ? 'consolidado' : companyId,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
        responseType: 'blob',
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
              <option value="clientes">Clientes</option>
              <option value="prospectos">Prospectos</option>
              <option value="tickets">Tickets</option>
              <option value="inventario">Inventario</option>
              <option value="cobranza">Cobranza</option>
              <option value="materiales">Materiales</option>
            </select>
          </label>
          <label>
            Formato
            <select value={format} onChange={(event) => setFormat(event.target.value)}>
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
            </select>
          </label>
          <label>
            Período desde
            <input
              type="date"
              min={reportMinimumDate}
              max={today}
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label>
            Período hasta
            <input
              type="date"
              min={reportMinimumDate}
              max={today}
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
          <label>
            Alcance
            <select value={scopeMode} onChange={(event) => setScopeMode(event.target.value)}>
              <option value="consolidado">Consolidado: todas las empresas</option>
              <option value="empresa">Una empresa</option>
            </select>
          </label>
          <label>
            Empresa
            <select
              value={companyId}
              disabled={scopeMode === 'consolidado'}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              <option value="">Seleccionar empresa</option>
              {companies.map((company) => (
                <option key={company.idEmpresa} value={company.idEmpresa}>
                  {company.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <small className="report-help">Periodo permitido: desde {formatDateOnly(reportMinimumDate)} hasta hoy.</small>
        <button type="button" className="report-button" onClick={exportReport}>
          Generar reporte
        </button>
        {status && <p className="inline-status">{status}</p>}
      </div>
    </section>
  );
}
