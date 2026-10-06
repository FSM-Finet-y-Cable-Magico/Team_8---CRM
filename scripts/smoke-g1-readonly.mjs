import {pathToFileURL} from 'node:url';
import {g1Config,positiveId,request,safeFailure} from './g1-smoke-common.mjs';
export async function main(env=process.env,fetchImpl=fetch,log=console.log) {
  try {
    const config=g1Config(env),company=positiveId(env.G1_SMOKE_COMPANY_ID),query='?id_empresa='+company;
    const tasks=[['/api/integraciones/tipos-equipo'+query,'GET tipos-equipo']];
    if(env.G1_SMOKE_SERIAL)tasks.push(['/api/integraciones/unidades/'+encodeURIComponent(env.G1_SMOKE_SERIAL)+query,'GET unidades/{serie}']);
    if(env.G1_SMOKE_SERVICE_ID)tasks.push(['/api/integraciones/equipos'+query+'&id_servicio='+positiveId(env.G1_SMOKE_SERVICE_ID),'GET equipos']);
    if(env.G1_SMOKE_STOCK==='1')tasks.push(['/api/integraciones/stock'+query,'GET stock (disponibilidad actual; no CU-61)']);
    let failed=false;
    for(const [path,label] of tasks) {
      const result=await request(config,path,label,{},fetchImpl);log(JSON.stringify(result));
      if(result.result!=='PASS')failed=true;
      if(result.status===401)break;
    }
    return failed?1:0;
  }catch(error){log(JSON.stringify(safeFailure(error)));return 2;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main();
