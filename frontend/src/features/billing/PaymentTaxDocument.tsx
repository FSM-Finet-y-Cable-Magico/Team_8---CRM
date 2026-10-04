import { useState } from 'react';
import { api, apiErrorMessage } from '../../api';

type TaxStatus = { readiness: { state:string }; job: { estado:string; ultimoError:string | null } | null;
  intention: { estado:string; ambiente:string; tipoDte:number; folio:string | null; ultimoError:string | null; artefactoUrl:string | null; artefactoEstado:string; emailEstado:string } | null };
const labels:Record<string,string> = { DISABLED:'Emisión deshabilitada', COMPANY_NOT_CONFIGURED:'Empresa sin configuración', COMPANY_DISABLED:'Empresa deshabilitada',
  CREDENTIALS_MISSING:'Faltan credenciales de pruebas', MIGRATION_REQUIRED:'Falta preparar la base de datos', READY_SANDBOX:'Ambiente de pruebas',
  PENDIENTE_CONTRATO_FACTURACION_CL:'Falta configuración tributaria', PENDIENTE:'Pendiente', EN_PROCESO:'Procesando', GENERADO:'Generado',
  FALLIDO:'Falló', RESULTADO_INDETERMINADO:'Resultado por verificar', DATOS_REQUERIDOS:'Requiere revisión de datos',
  NO_CONFIGURADO:'Correo sin configurar', SIN_DESTINATARIO:'Sin correo del cliente', ENVIADO:'Enviado', DISPONIBLE:'Disponible', REINTENTO_PENDIENTE:'Reintento programado' };

export function PaymentTaxDocument({ idPago, canManage }: {idPago:number;canManage:boolean}) {
  const [status,setStatus]=useState<TaxStatus | null>(null), [busy,setBusy]=useState(false), [error,setError]=useState('');
  async function load(action?:'retry'|'artifacts') {
    if (busy) return; setBusy(true);setError('');
    try { if (action) await api.post(`/tax-documents/payments/${idPago}/${action}`);
      setStatus((await api.get<TaxStatus>(`/tax-documents/payments/${idPago}`)).data); }
    catch (e) {setError(apiErrorMessage(e));} finally {setBusy(false);}
  }
  const doc=status?.intention;
  const link=doc?.artefactoUrl && /^https:\/\/www\.facturacion\.cl\/(sistema|plano)\/descargar\.php\?/.test(doc.artefactoUrl) ? doc.artefactoUrl : null;
  return <section className="stack">
    <button type="button" className="secondary compact" disabled={busy} onClick={()=>void load()}>{busy?'Consultando…':'Consultar boleta / factura'}</button>
    {error && <p role="alert">{error}</p>}
    {status && <p role="status">{labels[status.readiness.state] ?? status.readiness.state} · {labels[doc?.estado ?? status.job?.estado ?? 'PENDIENTE'] ?? doc?.estado}</p>}
    {doc && <>
      <p>{[39,41].includes(doc.tipoDte)?'Boleta':'Factura'} · Folio {doc.folio ?? 'pendiente'} · {doc.ambiente==='sandbox'?'Documento de pruebas':doc.ambiente}</p>
      <p>Comprobante: {labels[doc.artefactoEstado] ?? doc.artefactoEstado} · Correo: {labels[doc.emailEstado] ?? doc.emailEstado}</p>
      {doc.emailEstado==='RESULTADO_INDETERMINADO' && <p>Debe verificarse si el correo llegó antes de volver a enviarlo.</p>}
      {link && <a href={link} target="_blank" rel="noreferrer">Abrir comprobante</a>}
      {doc.estado==='RESULTADO_INDETERMINADO' && <p>Un administrador debe verificar el documento en el proveedor antes de continuar.</p>}
      {canManage && doc.estado==='FALLIDO' && doc.ultimoError==='CONFIRMED_NOT_SENT' && <button disabled={busy} type="button" onClick={()=>void load('retry')}>Reintentar emisión sin envío previo</button>}
      {canManage && doc.estado==='GENERADO' && (doc.artefactoEstado!=='DISPONIBLE' || ['PENDIENTE','NO_CONFIGURADO','FALLIDO'].includes(doc.emailEstado)) && <button disabled={busy} type="button" onClick={()=>void load('artifacts')}>Recuperar comprobante y correo pendiente</button>}
    </>}
  </section>;
}
