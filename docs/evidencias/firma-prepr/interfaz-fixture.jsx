import React from 'react';
import {createRoot} from 'react-dom/client';
import {api} from '../../../frontend/src/api.ts';
import {ProspectWorkflowPanel} from '../../../frontend/src/features/prospects/ProspectWorkflowPanel.tsx';
import {CustomerContractWorkflow} from '../../../frontend/src/features/customers/CustomerContractWorkflow.tsx';
import '../../../frontend/src/styles.css';
const variant=new URLSearchParams(location.search).get('mode')||'off';
const mode=variant==='manual'?'manual':'automatic';
const signed=variant==='signed',enabled=variant==='auto';
const company={idEmpresa:1,nombre:'Empresa ficticia QA'};
const plan={idPlan:10,idEmpresa:1,nombreComercial:'Plan ficticio QA',precioMensual:19990,velocidadMbps:300,empresa:company};
const contract={idContrato:10,idEmpresa:1,estado:signed?'Firmado':'Pendiente firma contrato',fechaInicio:'2026-11-10',plan};
const permissions={manageContracts:true,generateDigitalContract:true,recordProspectLoss:false,generateQuotes:false,contractPlans:false};
const status={enabled,sendAllowed:enabled,policy:{mode,available:enabled,manualAllowed:mode==='manual',
reason:variant==='off'?'Firma automática temporalmente no disponible; no admite firma manual':null},
solicitud:signed?{idSolicitud:'qa-fixture',estado:'FIRMADA',correoEstado:'SIMULADO',firmaCorreoEstado:'INDETERMINADO'}:null,signedDownloadAvailable:signed};
const documents=[{idContratoDigital:1,version:1,fechaGeneracion:'2026-11-10T12:00:00Z',estadoFirma:signed?'Firmado electronicamente':'Generado'}];
api.defaults.adapter=async config=>({status:200,statusText:'OK',headers:{},config,data:
config.url.endsWith('/signature')?status:config.url.endsWith('/digital-contract')?{documents}:[]});
function App(){return <main style={{padding:32,maxWidth:1100,margin:'auto',background:'#fff',minHeight:'100vh'}}>
<header style={{padding:20,background:'#edf7f4',border:'1px solid #227966',marginBottom:24}}>
<h1 style={{fontSize:24}}>Firma de contratos · QA local</h1>
<p>Componentes reales del CRM con API simulada y datos ficticios. No envía correos ni modifica bases.</p>
<p><strong>Escenario: {variant==='off'?'automático con envío apagado':variant==='manual'?'legado manual autorizado':variant==='signed'?'firma confirmada, descarga histórica disponible':'automático con PDF elegible'}</strong></p>
</header>
{signed?<CustomerContractWorkflow customer={{idCliente:1,nombreCompleto:'Cliente ficticio QA',empresa:company,contratos:[contract]}}
services={[]} servicesLoad={{status:'empty',customerId:1,error:''}} plans={[]} permissions={permissions} onRefresh={async()=>{}} onOpenObservations={()=>{}}/>:
<ProspectWorkflowPanel prospect={{idProspecto:1,idCliente:null,nombreCompleto:'Prospecto ficticio QA',estadoPipeline:'Pendiente firma',
empresa:company,contratos:[contract],requiereRevisionComercial:false}} plans={[]} permissions={permissions} onChanged={()=>{}}/>}
<footer style={{marginTop:24,borderTop:'1px solid #ddd',paddingTop:14}}>Evidencia de interfaz aislada. El recorrido por los portales intergrupos se valida por separado.</footer></main>}
createRoot(document.getElementById('root')).render(<App/>);