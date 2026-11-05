export function g1Config(env) {
  const raw=env.G1_API_URL??'';
  let url;
  try { url=new URL(raw); } catch { throw new Error('G1_INVALID_URL'); }
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(raw!==raw.trim()||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!/^https?:\/\/[^/]+\/?$/.test(raw)||(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))) throw new Error('G1_INVALID_URL');
  const key=env.G1_API_KEY??'';
  if(!key.trim()) throw new Error('G1_API_KEY_NOT_CONFIGURED');
  if(key!==key.trim()||/[\r\n]/.test(key)) throw new Error('G1_API_KEY_INVALID_FORMAT');
  const timeout=Number(env.G1_REQUEST_TIMEOUT_MS??8000);
  if(!Number.isInteger(timeout)||timeout<1||timeout>60000) throw new Error('G1_TIMEOUT_CONFIG_INVALID');
  return {origin:url.origin,key,timeout};
}
export function positiveId(value) {
  const id=typeof value==='number'?value:typeof value==='string'&&/^[1-9]\d*$/.test(value)?Number(value):NaN;
  if(!Number.isSafeInteger(id)||id<=0||id>2147483647) throw new Error('POSITIVE_ID_REQUIRED');
  return id;
}
export async function request(config,path,label,init={},fetchImpl=fetch) {
  const started=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),config.timeout);
  try {
    const response=await fetchImpl(config.origin+path,{...init,redirect:'error',headers:{Accept:'application/json','Content-Type':'application/json','X-API-KEY':config.key},signal:controller.signal});
    const body=await response.json().catch(()=>null);
    const result=response.status===401?'AUTH_CONFIGURATION_MISMATCH':!response.ok?'HTTP_REJECTED':body?.success===true&&body.data!==undefined?'PASS':'INVALID_RESPONSE';
    return {endpoint:label,status:response.status,durationMs:Date.now()-started,result,count:Array.isArray(body?.data)?body.data.length:undefined};
  } catch(error) { return {endpoint:label,status:null,durationMs:Date.now()-started,result:error?.name==='AbortError'?'TIMEOUT':'CONNECTION_FAILED'}; }
  finally{clearTimeout(timer);}
}
export function safeFailure(error) {
  const known=['G1_INVALID_URL','G1_API_KEY_NOT_CONFIGURED','G1_API_KEY_INVALID_FORMAT','G1_TIMEOUT_CONFIG_INVALID','POSITIVE_ID_REQUIRED','ACTIVATION_WRITE_NOT_ALLOWED','ACTIVATION_PAYLOAD_INVALID'];
  return {result:'FAIL',reason:known.includes(error?.message)?error.message:'CONFIGURATION_OR_REQUEST_FAILED'};
}
