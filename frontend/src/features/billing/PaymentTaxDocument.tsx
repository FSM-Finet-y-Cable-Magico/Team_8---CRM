import { useState } from 'react';
import { api, apiErrorMessage } from '../../api';

type TaxStatus = { readiness: { state:string }; job: { estado:string; ultimoError:string | null } | null;
  intention: { estado:string; ambiente:string; tipoDte:number; folio:string | null; fingerprint:string; ultimoError:string | null; artefactoUrl:string | null; artefactoEstado:string; emailEstado:string; emailIntentos:number; fechaProximoEmail:string | null } | null };
const labels:Record<string,string> = { DISABLED:'Emisión deshabilitada', COMPANY_NOT_CONFIGURED:'Empresa sin configuración', COMPANY_DISABLED:'Empresa deshabilitada',
  SIMULADO:'Simulado; no se envió correo',
  CREDENTIALS_MISSING:'Faltan credenciales de pruebas', MIGRATION_REQUIRED:'Falta preparar la base de datos', READY_SANDBOX:'Ambiente de pruebas',
  PENDIENTE_CONTRATO_FACTURACION_CL:'Falta configuración tributaria', PENDIENTE:'Pendiente', EN_PROCESO:'Procesando', GENERADO:'Generado',
  FALLIDO:'Falló', RESULTADO_INDETERMINADO:'Resultado por verificar', DATOS_REQUERIDOS:'Requiere revisión de datos',
  NO_CONFIGURADO:'Correo sin configurar', SIN_DESTINATARIO:'Sin correo del cliente', ENVIADO:'Enviado', DISPONIBLE:'Disponible', REINTENTO_PENDIENTE:'Reintento programado' };

type RecoveryAction='reprepare'|'recipient'|'reconcile'|'reconcile-email';
export function PaymentTaxDocument({ idPago, canManage, canReconcile = false }: {idPago:number;canManage:boolean;canReconcile?:boolean}) {
  const [status,setStatus]=useState<TaxStatus | null>(null), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [action,setAction]=useState<RecoveryAction | ''>(''),[observation,setObservation]=useState(''),[folio,setFolio]=useState('');
  const [outcome,setOutcome]=useState('accepted'),[verified,setVerified]=useState(false);
  async function load(action?:'retry'|'artifacts') {
    if (busy) return; setBusy(true);setError('');
    try { if (action) await api.post(`/tax-documents/payments/${idPago}/${action}`);
      setStatus((await api.get<TaxStatus>(`/tax-documents/payments/${idPago}`)).data); }
    catch (e) {setError(apiErrorMessage(e));} finally {setBusy(false);}
  }
  const doc=status?.intention;
  async function correct() {
    if(busy || !action)return;setBusy(true);setError('');
    try {
      const body={observation,...(action==='reconcile' ? {fingerprint:doc?.fingerprint,folio,confirmSameDocument:verified} : {}),
        ...(action==='reconcile-email' ? {fingerprint:doc?.fingerprint,outcome,verified} : {})};
      await api.post(`/tax-documents/payments/${idPago}/${action}`,body);
      setStatus((await api.get<TaxStatus>(`/tax-documents/payments/${idPago}`)).data);
      setAction('');setObservation('');setVerified(false);
    }catch(e){setError(apiErrorMessage(e));}finally{setBusy(false);}
  }
  const link=doc?.artefactoUrl && /^https:\/\/www\.facturacion\.cl\/(sistema|plano)\/descargar\.php\?/.test(doc.artefactoUrl) ? doc.artefactoUrl : null;
  return <section className="stack">
    <button type="button" className="secondary compact" disabled={busy} onClick={()=>void load()}>{busy?'Consultando…':'Consultar boleta / factura'}</button>
    {error && <p role="alert">{error}</p>}
    {status && <p role="status">{labels[status.readiness.state] ?? status.readiness.state} · {labels[doc?.estado ?? status.job?.estado ?? 'PENDIENTE'] ?? doc?.estado}</p>}
    {canManage && status?.job?.estado==='DATOS_REQUERIDOS' && !doc && <button type="button" disabled={busy} onClick={()=>setAction('reprepare')}>Preparar con los datos corregidos del cliente</button>}
    {doc && <>
      <p>{[39,41].includes(doc.tipoDte)?'Boleta':'Factura'} · Folio {doc.folio ?? 'pendiente'} · {doc.ambiente==='sandbox'?'Documento de pruebas':doc.ambiente}</p>
      <p>Comprobante: {labels[doc.artefactoEstado] ?? doc.artefactoEstado} · Correo: {labels[doc.emailEstado] ?? doc.emailEstado}</p>
      {doc.fechaProximoEmail && <p>Próximo intento de correo: {new Date(doc.fechaProximoEmail).toLocaleString()}</p>}
      {canManage && doc.emailEstado==='SIN_DESTINATARIO' && <button type="button" disabled={busy} onClick={()=>setAction('recipient')}>Usar el correo corregido del cliente</button>}
      {canReconcile && doc.estado==='RESULTADO_INDETERMINADO' && <button type="button" disabled={busy} onClick={()=>setAction('reconcile')}>Registrar verificación del documento</button>}
      {canReconcile && doc.emailEstado==='RESULTADO_INDETERMINADO' && <button type="button" disabled={busy} onClick={()=>setAction('reconcile-email')}>Registrar verificación del correo</button>}
      {doc.emailEstado==='RESULTADO_INDETERMINADO' && <p>Debe verificarse si el correo llegó antes de volver a enviarlo.</p>}
      {link && <a href={link} target="_blank" rel="noreferrer">Abrir comprobante</a>}
      {doc.estado==='RESULTADO_INDETERMINADO' && <p>Un administrador debe verificar el documento en el proveedor antes de continuar.</p>}
      {canManage && doc.estado==='FALLIDO' && doc.ultimoError==='CONFIRMED_NOT_SENT' && <button disabled={busy} type="button" onClick={()=>void load('retry')}>Reintentar emisión sin envío previo</button>}
      {canManage && doc.estado==='GENERADO' && (doc.artefactoEstado!=='DISPONIBLE' || ['PENDIENTE','NO_CONFIGURADO','FALLIDO'].includes(doc.emailEstado)) && <button disabled={busy} type="button" onClick={()=>void load('artifacts')}>Recuperar comprobante y correo pendiente</button>}
    </>}
    {action && <form className="stack" onSubmit={e=>{e.preventDefault();void correct();}}>
      <label>Motivo y comprobaciones realizadas<textarea required maxLength={1000} value={observation} onChange={e=>setObservation(e.target.value)} /></label>
      {action==='reconcile' && <label>Folio verificado en el proveedor<input required pattern="[1-9][0-9]{0,9}" value={folio} onChange={e=>setFolio(e.target.value)} /></label>}
      {action==='reconcile-email' && <label>Resultado verificado<select value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="accepted">El correo fue aceptado</option><option value="not_accepted">Se comprobó que no fue aceptado</option></select></label>}
      {(action==='reconcile' || action==='reconcile-email') && <label><input type="checkbox" required checked={verified} onChange={e=>setVerified(e.target.checked)} />Verifiqué el documento, destinatario y resultado en el proveedor correspondiente.</label>}
      <button type="submit" disabled={busy || !observation.trim()}>Guardar comprobación</button>
      <button type="button" disabled={busy} onClick={()=>setAction('')}>Cancelar</button>
    </form>}
  </section>;
}
