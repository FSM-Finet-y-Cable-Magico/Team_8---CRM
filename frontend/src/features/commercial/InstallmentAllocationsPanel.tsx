import { useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage } from '../../api';
import { dateLabel } from './control-book-model';

type Line = { idImputacion: number; idCuota: number; monto: string; idOriginal: number | null; reversible: string };
type Detail = {
  idConvenio: number; idEmpresa: number; idFactura: number; estadoConvenio: string; puedeImputar: boolean;
  cuotas: Array<{ idCuota: number; numero: number; fechaVencimiento: string; monto: string; imputado: string; saldo: string | null; estado: string }>;
  pagos: Array<{ idPago: number; monto: string; disponible: string; fechaPago: string; origen: string }>;
  operaciones: Array<{ idOperacion: number; tipo: string; idUsuario: number; idAuditoria: string; fecha: string; motivo: string; detalles: Line[] }>;
};
const cents = (value: string) => {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};
const amount = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
type Command = { path: string; body: Record<string, unknown>; summary: string };

// Mounted per agreement/company by the history view; no automatic allocation or monetary charge.
export function InstallmentAllocationsPanel({ idConvenio, idEmpresa, onChanged }: { idConvenio: number; idEmpresa: number; onChanged?: () => void }) {
  const [open, setOpen] = useState(false), [detail, setDetail] = useState<Detail | null>(null);
  const [reload, setReload] = useState(0), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const [payment, setPayment] = useState(''), [values, setValues] = useState<Record<number, string>>({}), [reason, setReason] = useState('');
  const [reverse, setReverse] = useState<Line | null>(null), [reverseAmount, setReverseAmount] = useState('');
  const [command, setCommand] = useState<Command | null>(null);
  const sending = useRef(false), epoch = useRef(0);
  const base = `/commercial/agreements/${idConvenio}/allocations`;
  useEffect(() => {
    const generation = ++epoch.current;
    setDetail(null); setCommand(null); setValues({}); setPayment(''); setReverse(null); setReason(''); setError('');
    if (!open) return;
    const controller = new AbortController(); setLoading(true);
    void api.get<Detail>(base, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted || generation !== epoch.current) return;
      if (data.idConvenio !== idConvenio || data.idEmpresa !== idEmpresa) throw new Error('Respuesta de otro contexto empresarial');
      setDetail(data);
    }).catch(err => { if (!controller.signal.aborted && generation === epoch.current) setError(apiErrorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted && generation === epoch.current) setLoading(false); });
    return () => { controller.abort(); epoch.current++; };
  }, [base, idConvenio, idEmpresa, open, reload]);

  function prepare() {
    setError(''); setMessage('');
    if (!detail?.puedeImputar || !reason.trim() || reason.trim().length > 250) { setError('Indica un motivo de hasta 250 caracteres.'); return; }
    if (reverse) {
      const value = cents(reverseAmount), maximum = cents(reverse.reversible);
      if (value == null || value <= 0n || maximum == null || value > maximum) { setError('Importe de reversa inválido.'); return; }
      setCommand({ path: `${base}/${reverse.idImputacion}/reverse`, body: { monto: amount(value), motivo: reason.trim(), clave: crypto.randomUUID() },
        summary: `Revertir ${amount(value)} de la imputación ${reverse.idImputacion}. El pago original no se devuelve ni se modifica.` }); return;
    }
    const selected = detail.pagos.find(p => String(p.idPago) === payment);
    const lines: Array<{ idCuota: number; monto: string }> = []; let total = 0n;
    for (const q of detail.cuotas) {
      if (!values[q.idCuota]) continue;
      const value = cents(values[q.idCuota]), balance = q.saldo == null ? null : cents(q.saldo);
      if (value == null || value <= 0n || balance == null || value > balance) { setError('Revisa los importes y saldos de las cuotas seleccionadas.'); return; }
      total += value; lines.push({ idCuota: q.idCuota, monto: amount(value) });
    }
    const available = selected && cents(selected.disponible);
    if (!selected || available == null || !lines.length || total > available) { setError('Selecciona un pago y cuotas sin superar su saldo imputable.'); return; }
    setCommand({ path: base, body: { idPago: selected.idPago, cuotas: lines, motivo: reason.trim(), clave: crypto.randomUUID() },
      summary: `Asignar ${amount(total)} del pago ${selected.idPago}: ${lines.map(l => `cuota ${detail.cuotas.find(q => q.idCuota === l.idCuota)?.numero}: ${l.monto}`).join('; ')}. No se registrará un nuevo pago.` });
  }
  async function confirm() {
    if (!command || sending.current) return;
    const generation = epoch.current; sending.current = true; setBusy(true); setError('');
    try {
      await api.post(command.path, command.body);
      if (generation !== epoch.current) return;
      setMessage('Operación confirmada y auditada.'); setCommand(null); setReload(value => value + 1); onChanged?.();
    } catch (err) {
      if (generation === epoch.current) setError(`${apiErrorMessage(err)}. Si el resultado es incierto, reintenta esta misma confirmación; conserva su clave.`);
    } finally { sending.current = false; setBusy(false); }
  }
  const suggestion = detail?.cuotas.find(q => q.saldo !== null && (cents(q.saldo) ?? 0n) > 0n);
  return <section aria-label="Imputación de pagos existentes">
    <button type="button" disabled={busy} onClick={() => setOpen(v => !v)}>{open ? 'Ocultar imputaciones' : 'Ver cuotas e imputar pagos existentes'}</button>
    {open && <>
      <p>Imputar distribuye un pago ya recibido. Para cobrar utiliza Registrar pago en factura.</p>
      {loading && <p role="status">Consultando saldos…</p>}
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      {detail && <>
        <p>Convenio {idConvenio} · Empresa {idEmpresa} · Factura {detail.idFactura} · {detail.estadoConvenio}</p>
        <div className="control-history-table"><table><caption>Cuotas y saldo imputado</caption><thead><tr><th>Cuota / vencimiento</th><th>Monto</th><th>Imputado</th><th>Saldo</th><th>Estado</th><th>Importe a asignar</th></tr></thead>
          <tbody>{detail.cuotas.map(q => <tr key={q.idCuota}><th>{q.numero} · {dateLabel(q.fechaVencimiento)}</th><td>{q.monto}</td><td>{q.imputado}</td><td>{q.saldo ?? 'Revisión requerida'}</td><td>{q.estado}</td><td>
            {detail.puedeImputar && q.saldo !== null && (cents(q.saldo) ?? 0n) > 0n && <input aria-label={`Importe cuota ${q.numero}`} inputMode="decimal" disabled={busy || !!command || !!reverse} value={values[q.idCuota] ?? ''} onChange={e => setValues(v => ({ ...v, [q.idCuota]: e.target.value }))} />}
          </td></tr>)}</tbody></table></div>
        {detail.puedeImputar ? <fieldset disabled={busy || !!command}>
          <legend>{reverse ? 'Reversa compensatoria' : 'Imputación manual'}</legend>
          {reverse ? <><label>Importe a revertir (máximo {reverse.reversible})<input aria-label="Importe reversa" value={reverseAmount} inputMode="decimal" onChange={e => setReverseAmount(e.target.value)} /></label><button type="button" onClick={() => setReverse(null)}>Cancelar reversa</button></> : <>
            {suggestion && <p>Sugerencia: cuota {suggestion.numero}, vencimiento más antiguo disponible. Escribe explícitamente los importes que deseas asignar.</p>}
            <label>Pago registrado<select aria-label="Pago registrado" value={payment} onChange={e => setPayment(e.target.value)}><option value="">Seleccionar pago</option>{detail.pagos.map(p => <option key={p.idPago} value={p.idPago}>Pago {p.idPago} · {dateLabel(p.fechaPago)} · {p.origen} · recibido {p.monto} · disponible {p.disponible}</option>)}</select></label>
          </>}
          <label>Motivo<input aria-label="Motivo imputación" value={reason} maxLength={250} onChange={e => setReason(e.target.value)} /></label>
          <button type="button" onClick={prepare}>Revisar operación</button>
        </fieldset> : <p>Consulta de solo lectura. Solo un administrador puede operar sobre un convenio aprobado.</p>}
        {command && <div role="group" aria-label="Confirmar distribución"><p>{command.summary}</p><p>Motivo: {String(command.body.motivo)}</p><p>Clave de reintento: {String(command.body.clave)}</p>
          <button type="button" disabled={busy} onClick={() => void confirm()}>Confirmar operación auditada</button>
          <button type="button" disabled={busy} onClick={() => { setCommand(null); setReload(v => v + 1); }}>Volver a consultar antes de otra operación</button>
        </div>}
        <h4>Historial de imputaciones y compensaciones</h4>
        {detail.operaciones.length === 0 && <p className="empty-state">Sin imputaciones registradas. El saldo de la factura no modifica las cuotas automáticamente.</p>}
        {detail.operaciones.map(op => <article key={op.idOperacion}><p>{op.tipo} · {dateLabel(op.fecha)} · Operador {op.idUsuario} · Auditoría {op.idAuditoria} · {op.motivo}</p>
          {op.detalles.map(line => <p key={line.idImputacion}>Cuota {detail.cuotas.find(q => q.idCuota === line.idCuota)?.numero} · {line.monto}{line.idOriginal != null && ` · Compensa imputación ${line.idOriginal}`}
            {detail.puedeImputar && op.tipo === 'APLICAR' && (cents(line.reversible) ?? 0n) > 0n && <button type="button" disabled={busy || !!command} onClick={() => { setReverse(line); setReverseAmount(''); setReason(''); setError(''); }}>Preparar reversa</button>}
          </p>)}
        </article>)}
      </>}
    </>}
  </section>;
}
