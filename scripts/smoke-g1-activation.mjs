import {pathToFileURL} from 'node:url';
import {g1Config,positiveId,request,safeFailure} from './g1-smoke-common.mjs';
export async function main(env=process.env,fetchImpl=fetch,log=console.log) {
  try {
    if(env.ALLOW_G1_ACTIVATION_WRITE!=='1')throw new Error('ACTIVATION_WRITE_NOT_ALLOWED');
    const config=g1Config(env);
    let payload;try{payload=JSON.parse(env.G1_ACTIVATION_PAYLOAD_JSON??'');}catch{throw new Error('ACTIVATION_PAYLOAD_INVALID');}
    if(!payload||typeof payload!=='object'||typeof payload.event_id!=='string'||!payload.event_id.trim()||payload.event_id.length>100
      ||typeof payload.trace_id!=='string'||!payload.trace_id.trim()||typeof payload.rut_cliente!=='string'||!payload.rut_cliente.trim()
      ||!Array.isArray(payload.equipos)||!payload.equipos.length
      ||payload.equipos.some(x=>typeof x?.numero_serie!=='string'||!x.numero_serie.trim()||x.numero_serie!==x.numero_serie.trim())
      ||new Set(payload.equipos.map(x=>x.numero_serie)).size!==payload.equipos.length)throw new Error('ACTIVATION_PAYLOAD_INVALID');
    for(const key of ['id_empresa','id_ot','id_cliente','id_servicio','id_contrato'])payload[key]=positiveId(payload[key]);
    const result=await request(config,'/api/integraciones/activaciones','POST activaciones',{method:'POST',body:JSON.stringify(payload)},fetchImpl);
    log(JSON.stringify(result));return result.result==='PASS'?0:1;
  }catch(error){log(JSON.stringify(safeFailure(error)));return 2;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main();
